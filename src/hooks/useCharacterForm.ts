"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import type { Character, CharacterVisualScore, ComicStyle, ReferenceImageEntry } from "@/lib/types";
import { getStoredRequestConfigs, getStoredConfigs } from "@/hooks/useAPIConfig";
import { getImageAdapter } from "@/lib/imageGen";
import { urlToBase64 } from "@/lib/utils";
import { generateCharacterProfile, generateCharacterReferencePrompt } from "@/lib/llm";
import { evaluateCharacterVisual } from "@/lib/vlmScorer";
import { generateCharacterPromptPatch, applyPromptPatch } from "@/lib/vlmRetry";

/** Maximum number of image versions to keep per reference entry */
const MAX_VERSIONS = 5;

function createEntry(
  imageUrl: string,
  label: string,
  source: "ai" | "upload",
  style?: ComicStyle,
  prompt?: string,
): ReferenceImageEntry {
  const now = Date.now();
  return {
    imageUrl,
    prompt,
    label,
    source,
    versions: [{ imageUrl, createdAt: now }],
    activeVersionIndex: 0,
    createdAt: now,
    style,
  };
}

function resolveAvatarIndex(char: Partial<Character> | null): number {
  if (!char?.avatarUrl || !char.referenceEntries?.length) return 0;
  const idx = char.referenceEntries.findIndex((e) => e.imageUrl === char.avatarUrl);
  return idx >= 0 ? idx : 0;
}

function createEmptyCharacter(): Omit<Character, "id" | "createdAt" | "updatedAt"> {
  return {
    name: "",
    description: "",
    appearance: { gender: "", age: "", hair: "", eyes: "", clothing: "", species: "" },
    style: "anime",
    avatarUrl: null,
    referenceEntries: [],
    tags: [],
  };
}

export function deriveCharacterReviewStatus(score?: CharacterVisualScore | null): Character["reviewStatus"] {
  if (!score) return "unreviewed";
  return score.overall >= 7 ? "reviewed" : "needs_repair";
}

export interface UseCharacterFormOptions {
  character: Partial<Character> | null;
  onSave: (data: Omit<Character, "id" | "createdAt" | "updatedAt"> & { id?: string }) => Promise<Character>;
}

export function useCharacterForm({ character, onSave }: UseCharacterFormOptions) {
  const isEdit = !!character?.id;

  // --- Form fields ---
  const [form, setForm] = useState(() => {
    const base = createEmptyCharacter();
    return {
      name: character?.name ?? base.name,
      description: character?.description ?? base.description,
      appearance: character?.appearance ?? base.appearance,
      style: (character?.style ?? base.style) as ComicStyle,
      tags: character?.tags ?? base.tags,
    };
  });
  const [tagInput, setTagInput] = useState((character?.tags || []).join(", "));

  // --- Reference images ---
  const [entries, setEntries] = useState<ReferenceImageEntry[]>(() => {
    const baseStyle = (character?.style ?? "anime") as ComicStyle;
    return (character?.referenceEntries ?? []).map((e) => ({
      ...e,
      style: e.style || baseStyle,
    }));
  });
  const [avatarIndex, setAvatarIndex] = useState(() => resolveAvatarIndex(character ?? null));

  // --- UI state ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  const [regeneratingIndex, setRegeneratingIndex] = useState(-1);

  // --- VLM ---
  const [vlmScore, setVlmScore] = useState<CharacterVisualScore | null>(character?.visualScore ?? null);
  const [vlmLoading, setVlmLoading] = useState(false);
  const [vlmError, setVlmError] = useState("");
  const [vlmRetrying, setVlmRetrying] = useState(false);

  // --- Model selection ---
  const storedConfigs = useMemo(() => getStoredConfigs(), []);
  const [selectedLLMId, setSelectedLLMId] = useState(storedConfigs.activeLLMId ?? "");
  const [selectedImageId, setSelectedImageId] = useState(storedConfigs.activeImageId ?? "");

  // --- Lightbox ---
  const [previewIndex, setPreviewIndex] = useState(-1);

  // --- Variants ---
  const [variants, setVariants] = useState<Character["variants"]>(character?.variants);

  // --- Wikipedia state ---
  const [wikiImporting, setWikiImporting] = useState(false);
  const [wikiSearchOpen, setWikiSearchOpen] = useState(false);
  const [wikiSearchQuery, setWikiSearchQuery] = useState("");
  const [wikiSearchResults, setWikiSearchResults] = useState<Array<{ title: string; description?: string; thumbnail?: { source: string }; lang: string }>>([]);
  const [wikiSearching, setWikiSearching] = useState(false);
  const [wikiImportStep, setWikiImportStep] = useState("");
  const [wikiImportResult, setWikiImportResult] = useState<{
    enDesc: string;
    zhSummary: string;
    thumbnail: boolean;
    appearanceFields: number;
    tags: number;
  } | null>(null);

  // --- Lightbox keyboard navigation ---
  useEffect(() => {
    if (previewIndex < 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewIndex(-1);
      else if (e.key === "ArrowLeft") setPreviewIndex((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setPreviewIndex((i) => Math.min(entries.length - 1, i + 1));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [previewIndex, entries.length]);

  // --- Derived ---
  const avatarUrl = entries[avatarIndex]?.imageUrl ?? null;

  const buildVariantsForSave = () =>
    variants?.length
      ? variants.map((variant) => ({
          label: variant.label,
          appearance: variant.appearance,
          referenceEntries: variant.referenceEntries ?? [],
          avatarUrl: variant.avatarUrl ?? null,
        }))
      : undefined;

  const buildCharacterPayload = (
    overrides: Partial<Omit<Character, "id" | "createdAt" | "updatedAt">> = {},
  ): Omit<Character, "id" | "createdAt" | "updatedAt"> => ({
    name: form.name.trim(),
    description: form.description.trim(),
    appearance: form.appearance,
    style: form.style,
    avatarUrl,
    referenceEntries: entries,
    tags: tagInput
      .split(/[,，、；;]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    variants: buildVariantsForSave(),
    ...overrides,
  });

  // --- Mutations ---

  const updateField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateAppearance = (key: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      appearance: { ...prev.appearance, [key]: value },
    }));
  };

  const addEntries = useCallback((newEntries: ReferenceImageEntry[]) => {
    setEntries((prev) => {
      const updated = [...prev, ...newEntries];
      if (prev.length === 0 && updated.length > 0) {
        setAvatarIndex(0);
      }
      return updated;
    });
  }, []);

  const removeEntry = useCallback((index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
    setAvatarIndex((prev) => {
      if (index < prev) return prev - 1;
      if (index === prev) return 0;
      return prev;
    });
  }, []);

  const setAvatar = useCallback((index: number) => {
    setAvatarIndex(index);
  }, []);

  const upsertAIEntry = useCallback((entry: ReferenceImageEntry, targetIndex?: number) => {
    setEntries((prev) => {
      if (targetIndex !== undefined && targetIndex >= 0 && targetIndex < prev.length) {
        const old = prev[targetIndex];
        const allVersions = [...(old.versions || []), { imageUrl: entry.imageUrl, createdAt: Date.now() }];
        const trimmed = allVersions.slice(-MAX_VERSIONS);
        const replaced: ReferenceImageEntry = {
          ...entry,
          versions: trimmed,
          activeVersionIndex: trimmed.length - 1,
        };
        const updated = [...prev];
        updated[targetIndex] = replaced;
        setAvatarIndex(targetIndex);
        return updated;
      }
      setAvatarIndex(prev.length);
      return [...prev, entry];
    });
  }, []);

  const updateEntryStyle = useCallback((index: number, style: ComicStyle) => {
    setEntries((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], style };
      return updated;
    });
  }, []);

  const downloadEntry = useCallback((index: number) => {
    const entry = entries[index];
    if (!entry?.imageUrl) return;
    const link = document.createElement("a");
    link.href = entry.imageUrl;
    const ext = entry.imageUrl.startsWith("data:image/png") ? "png" : "webp";
    link.download = `${form.name || "ref"}_${index + 1}.${ext}`;
    link.click();
  }, [entries, form.name]);

  // --- Handlers ---

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const promises = Array.from(files).map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        }),
    );

    Promise.all(promises).then((results) => {
      const newEntries = results.map((img) =>
        createEntry(img, form.name || "", "upload", form.style),
      );
      addEntries(newEntries);
    });

    e.target.value = "";
  };

  const handleAIGenerate = async (targetIndex?: number) => {
    const { appearance, style: charStyle, name } = form;
    const isNonHuman = !!appearance.species;
    const parts = isNonHuman
      ? [appearance.species, appearance.age, appearance.hair, appearance.eyes, appearance.clothing].filter(Boolean)
      : [
          appearance.gender,
          appearance.age,
          appearance.hair && `${appearance.hair} hair`,
          appearance.eyes && `${appearance.eyes} eyes`,
          appearance.clothing,
        ].filter(Boolean);

    if (parts.length === 0 && !name) {
      setAiError("请先填写外观属性或角色名");
      return;
    }

    setAiGenerating(true);
    setRegeneratingIndex(targetIndex ?? -1);
    setAiError("");
    try {
      let prompt: string;
      try {
        const { llmConfig } = getStoredRequestConfigs(selectedLLMId || undefined, undefined);
        if (llmConfig?.apiUrl) {
          const charForPrompt = { ...form, appearance: { ...appearance } } as import("@/lib/types").Character;
          prompt = await generateCharacterReferencePrompt(charForPrompt, charStyle, llmConfig);
        } else {
          throw new Error("no LLM");
        }
      } catch {
        const subjectType = isNonHuman ? "mascot character" : "character";
        prompt = `portrait of ${name || subjectType}, ${parts.join(", ")}, character reference sheet, white background, studio lighting`;
      }

      const { imageConfig } = getStoredRequestConfigs(undefined, selectedImageId || undefined);
      if (!imageConfig) throw new Error("请先配置文生图 API");
      const adapter = getImageAdapter(imageConfig);
      const imageUrl = await adapter.generate(prompt, charStyle);
      const base64 = await urlToBase64(imageUrl);

      const entry = createEntry(base64, name || "", "ai", charStyle, prompt);
      upsertAIEntry(entry, targetIndex);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI 生成失败");
    } finally {
      setAiGenerating(false);
      setRegeneratingIndex(-1);
    }
  };

  // --- Wikipedia ---
  const wikiSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const doWikiSearch = useCallback((query: string) => {
    if (wikiSearchTimeoutRef.current) clearTimeout(wikiSearchTimeoutRef.current);
    if (!query.trim()) {
      setWikiSearchResults([]);
      return;
    }
    wikiSearchTimeoutRef.current = setTimeout(async () => {
      setWikiSearching(true);
      try {
        const [enRes, zhRes] = await Promise.all([
          fetch(`/api/wikipedia?q=${encodeURIComponent(query)}&lang=en`).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`/api/wikipedia?q=${encodeURIComponent(query)}&lang=zh`).then(r => r.ok ? r.json() : null).catch(() => null),
        ]);

        const results: Array<{ title: string; description?: string; thumbnail?: { source: string }; lang: string }> = [];
        const seen = new Set<string>();

        for (const r of (enRes?.results || [])) {
          const key = r.title.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            results.push({ ...r, lang: "en" });
          }
        }
        for (const r of (zhRes?.results || [])) {
          const key = r.title.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            results.push({ ...r, lang: "zh" });
          }
        }

        setWikiSearchResults(results.slice(0, 10));
      } catch {
        // silent
      } finally {
        setWikiSearching(false);
      }
    }, 300);
  }, []);

  const handleOpenWikiSearch = () => {
    setWikiSearchOpen(true);
    setWikiSearchQuery(form.name.trim());
    setWikiSearchResults([]);
    setWikiImportResult(null);
    if (form.name.trim()) {
      doWikiSearch(form.name.trim());
    }
  };

  const handleWikiImport = async (selectedTitle: string, selectedLang: string) => {
    setWikiImporting(true);
    setAiError("");
    setWikiImportResult(null);
    setWikiImportStep("获取文章...");
    const charName = form.name.trim() || selectedTitle;

    try {
      let article: { extract?: string; thumbnail?: { source: string }; title?: string; pageUrl?: string } | null = null;
      let articleLang = selectedLang;

      if (selectedLang === "zh") {
        const zhRes = await fetch(`/api/wikipedia?title=${encodeURIComponent(selectedTitle)}&lang=zh`);
        if (zhRes.ok) article = await zhRes.json();

        const enRes = await fetch(`/api/wikipedia?title=${encodeURIComponent(selectedTitle)}&lang=en`).catch(() => null);
        if (enRes?.ok) {
          const enArticle = await enRes.json();
          if (enArticle.extract && enArticle.extract.length > (article?.extract?.length || 0)) {
            article = enArticle;
            articleLang = "en";
          }
        }
      } else {
        const res = await fetch(`/api/wikipedia?title=${encodeURIComponent(selectedTitle)}&lang=en`);
        if (res.ok) article = await res.json();
      }

      if (!article?.extract) {
        setAiError("未在 Wikipedia 找到该角色，请尝试其他名字或英文名");
        return;
      }

      const rawExtract = article.extract || "";
      let hasThumbnail = false;

      setWikiImportStep("导入缩略图...");
      if (article.thumbnail?.source) {
        try {
          const imgRes = await fetch(article.thumbnail.source);
          if (imgRes.ok) {
            const blob = await imgRes.blob();
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve) => {
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
            if (base64.startsWith("data:image")) {
              const newEntry = {
                imageUrl: base64,
                label: charName,
                source: "upload" as const,
                versions: [{ imageUrl: base64, createdAt: Date.now() }],
                activeVersionIndex: 0,
                createdAt: Date.now(),
              };
              setEntries((prev) => [...prev, newEntry]);
              hasThumbnail = true;
            }
          }
        } catch {
          // thumbnail fetch failure not blocking
        }
      }

      setWikiImportStep("AI 提取外观特征...");
      const { llmConfig } = getStoredRequestConfigs(selectedLLMId || undefined);
      let enDescription = rawExtract;
      let zhSummary = "";
      let appearanceFieldCount = 0;
      let tagCount = 0;

      if (llmConfig) {
        try {
          const needsSummary = rawExtract.length > 1500;
          const extractForLLM = rawExtract.slice(0, 4000);

          const profile = await generateCharacterProfile(
            charName,
            [
              `Source: Wikipedia (${articleLang})`,
              needsSummary
                ? `The following Wikipedia article is long. Extract ONLY the character-relevant information (appearance, personality, iconic items, key traits). Discard historical background, cultural analysis, and plot summaries.`
                : `Extract character appearance from this Wikipedia article.`,
              `---`,
              extractForLLM,
            ].join("\n"),
            llmConfig,
          );

          if (profile.appearance.gender) {
            setForm((prev) => ({
              ...prev,
              appearance: {
                gender: profile.appearance.gender || prev.appearance.gender,
                age: profile.appearance.age || prev.appearance.age,
                hair: profile.appearance.hair || prev.appearance.hair,
                eyes: profile.appearance.eyes || prev.appearance.eyes,
                clothing: profile.appearance.clothing || prev.appearance.clothing,
                species: profile.appearance.species || prev.appearance.species,
              },
            }));
            appearanceFieldCount = [
              profile.appearance.gender, profile.appearance.age,
              profile.appearance.hair, profile.appearance.eyes,
              profile.appearance.clothing, profile.appearance.species,
            ].filter(Boolean).length;
          }

          if (profile.description && needsSummary) {
            enDescription = profile.description;
          }

          if (profile.tags.length > 0) {
            setTagInput((prev) => {
              const existing = prev ? prev.split(/[,，]+/).map(s => s.trim()) : [];
              const merged = [...new Set([...existing, ...profile.tags])].filter(Boolean);
              return merged.join(", ");
            });
            tagCount = profile.tags.length;
          }
        } catch {
          // LLM failure not blocking
        }

        setWikiImportStep("生成中文摘要...");
        if (articleLang === "en" && enDescription) {
          try {
            const shortExtract = enDescription.slice(0, 1500);
            const translateProfile = await generateCharacterProfile(
              charName,
              `Translate and summarize this English character description into Chinese (中文), keeping it under 300 characters. Focus on appearance and key traits only:\n${shortExtract}`,
              llmConfig,
            );
            if (translateProfile.description) {
              zhSummary = translateProfile.description;
            }
          } catch {
            // translation failure not blocking
          }
        }
      }

      if (enDescription.length > 2000) {
        enDescription = enDescription.slice(0, 2000) + "...";
      }
      updateField("description", enDescription);

      setWikiImportResult({
        enDesc: enDescription,
        zhSummary,
        thumbnail: hasThumbnail,
        appearanceFields: appearanceFieldCount,
        tags: tagCount,
      });
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Wikipedia 导入失败");
    } finally {
      setWikiImporting(false);
      setWikiImportStep("");
      setWikiSearchOpen(false);
    }
  };

  const handleAIProfile = async () => {
    if (!form.name.trim()) {
      setAiError("请先输入角色名");
      return;
    }
    setAiGenerating(true);
    setAiError("");
    try {
      const { llmConfig } = getStoredRequestConfigs(selectedLLMId || undefined);
      if (!llmConfig) throw new Error("请先配置 LLM API");
      const profile = await generateCharacterProfile(form.name.trim(), form.description || undefined, llmConfig);
      if (profile.description) updateField("description", profile.description);
      if (profile.appearance.gender) {
        setForm((prev) => ({
          ...prev,
          appearance: {
            gender: profile.appearance.gender || prev.appearance.gender,
            age: profile.appearance.age || prev.appearance.age,
            hair: profile.appearance.hair || prev.appearance.hair,
            eyes: profile.appearance.eyes || prev.appearance.eyes,
            clothing: profile.appearance.clothing || prev.appearance.clothing,
            species: profile.appearance.species || prev.appearance.species,
          },
        }));
      }
      if (profile.tags.length > 0) {
        setTagInput(profile.tags.join(", "));
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI 生成失败");
    } finally {
      setAiGenerating(false);
    }
  };

  const handleVlmEvaluate = async () => {
    if (entries.length === 0) return;
    setVlmLoading(true);
    setVlmError("");
    try {
      const configs = getStoredConfigs();
      const vlmConfigs = configs.vlmConfigs || [];
      const activeVLM = vlmConfigs.find((c) => c.id === configs.activeVLMId) || vlmConfigs[0];
      let vlmConfig;
      if (activeVLM) {
        vlmConfig = { apiUrl: activeVLM.apiUrl, apiKey: activeVLM.apiKey, model: activeVLM.model, provider: activeVLM.protocolType as "openai-compatible" | "anthropic" };
      } else {
        const activeLLM = configs.llmConfigs.find((c) => c.id === configs.activeLLMId) || configs.llmConfigs[0];
        if (!activeLLM) throw new Error("未配置 VLM 或 LLM");
        vlmConfig = { apiUrl: activeLLM.apiUrl, apiKey: activeLLM.apiKey, model: activeLLM.model, provider: activeLLM.protocolType as "openai-compatible" | "anthropic" };
      }
      const imageUrls = entries.map((e) => e.imageUrl);
      const desc = `${form.name}: ${form.description}. ${form.appearance.gender}, ${form.appearance.age}, hair: ${form.appearance.hair}, eyes: ${form.appearance.eyes}, clothing: ${form.appearance.clothing}`;
      const result = await evaluateCharacterVisual(form.name, desc, imageUrls, vlmConfig);
      const persisted = await onSave({
        ...(isEdit ? { id: character!.id } : {}),
        ...buildCharacterPayload({
          visualScore: result,
          reviewStatus: deriveCharacterReviewStatus(result),
          lastReviewAt: result.evaluatedAt,
        }),
      });
      setVlmScore(persisted.visualScore ?? result);
    } catch (err) {
      setVlmError(err instanceof Error ? err.message : "视觉评分失败");
    } finally {
      setVlmLoading(false);
    }
  };

  const handleVlmRetry = async () => {
    if (!vlmScore || vlmScore.overall >= 7) return;
    setVlmRetrying(true);
    setAiError("");
    try {
      const patch = generateCharacterPromptPatch(vlmScore);
      const vlmFeedback = {
        issues: vlmScore.issues,
        suggestions: vlmScore.suggestions,
        patchPositive: patch.positive,
      };

      const { llmConfig } = getStoredRequestConfigs(selectedLLMId || undefined, undefined);
      const { imageConfig } = getStoredRequestConfigs(undefined, selectedImageId || undefined);
      if (!imageConfig) throw new Error("请先配置文生图 API");

      const { appearance, style: charStyle, name } = form;
      const charForPrompt = { ...form, appearance: { ...appearance } } as import("@/lib/types").Character;

      let prompt: string;
      try {
        if (llmConfig?.apiUrl) {
          prompt = await generateCharacterReferencePrompt(charForPrompt, charStyle, llmConfig, vlmFeedback);
        } else {
          throw new Error("no LLM");
        }
      } catch {
        const parts = [appearance.gender, appearance.age, appearance.hair && `${appearance.hair} hair`, appearance.eyes && `${appearance.eyes} eyes`, appearance.clothing].filter(Boolean);
        prompt = `portrait of ${name || "character"}, ${parts.join(", ")}, character reference sheet, white background, studio lighting`;
        prompt = applyPromptPatch(prompt, patch);
      }

      const adapter = getImageAdapter(imageConfig);
      const imageUrl = await adapter.generate(prompt, charStyle);
      const base64 = await urlToBase64(imageUrl);
      const newEntry = createEntry(base64, name || "", "ai", charStyle, prompt);
      const nextEntries = [...entries, newEntry];
      setEntries(nextEntries);

      const basePersisted = await onSave({
        ...(isEdit ? { id: character!.id } : {}),
        ...buildCharacterPayload({
          avatarUrl: nextEntries[avatarIndex]?.imageUrl ?? newEntry.imageUrl,
          referenceEntries: nextEntries,
          visualScore: undefined,
          reviewStatus: "unreviewed",
          lastReviewAt: undefined,
        }),
      });

      const configs = getStoredConfigs();
      const vlmConfigs = configs.vlmConfigs || [];
      const activeVLM = vlmConfigs.find((c) => c.id === configs.activeVLMId) || vlmConfigs[0];
      let vlmConfig;
      if (activeVLM) {
        vlmConfig = { apiUrl: activeVLM.apiUrl, apiKey: activeVLM.apiKey, model: activeVLM.model, provider: activeVLM.protocolType as "openai-compatible" | "anthropic" };
      } else {
        const activeLLM = configs.llmConfigs.find((c) => c.id === configs.activeLLMId) || configs.llmConfigs[0];
        if (!activeLLM) throw new Error("未配置 VLM 或 LLM");
        vlmConfig = { apiUrl: activeLLM.apiUrl, apiKey: activeLLM.apiKey, model: activeLLM.model, provider: activeLLM.protocolType as "openai-compatible" | "anthropic" };
      }

      const imageUrls = nextEntries.map((entry) => entry.imageUrl);
      const desc = `${form.name}: ${form.description}. ${form.appearance.gender}, ${form.appearance.age}, hair: ${form.appearance.hair}, eyes: ${form.appearance.eyes}, clothing: ${form.appearance.clothing}`;
      const reevaluated = await evaluateCharacterVisual(form.name, desc, imageUrls, vlmConfig);
      const persisted = await onSave({
        id: basePersisted.id,
        ...buildCharacterPayload({
          avatarUrl: nextEntries[avatarIndex]?.imageUrl ?? newEntry.imageUrl,
          referenceEntries: nextEntries,
          visualScore: reevaluated,
          reviewStatus: deriveCharacterReviewStatus(reevaluated),
          lastReviewAt: reevaluated.evaluatedAt,
        }),
      });
      setVlmScore(persisted.visualScore ?? reevaluated);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "VLM 修复重试失败");
    } finally {
      setVlmRetrying(false);
    }
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    const tags = tagInput
      .split(/[,，、；;]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const finalEntries = entries.map((e) => ({
      ...e,
      style: e.style || form.style,
    }));

    onSave({
      ...(isEdit ? { id: character!.id } : {}),
      name: form.name.trim(),
      description: form.description.trim(),
      appearance: form.appearance,
      style: form.style,
      avatarUrl,
      referenceEntries: finalEntries,
      tags,
      variants: (variants?.length ?? 0) > 0
        ? (variants ?? []).map((v) => ({
            label: v.label,
            appearance: v.appearance,
            referenceEntries: [],
            avatarUrl: null,
          }))
        : undefined,
    });
  };

  return {
    // Form state
    form,
    tagInput,
    setTagInput,
    entries,
    avatarIndex,
    avatarUrl,
    aiGenerating,
    aiError,
    regeneratingIndex,
    vlmScore,
    vlmLoading,
    vlmError,
    vlmRetrying,
    selectedLLMId,
    setSelectedLLMId,
    selectedImageId,
    setSelectedImageId,
    previewIndex,
    setPreviewIndex,
    variants,
    setVariants,
    storedConfigs,
    isEdit,
    fileInputRef,

    // Wikipedia state
    wikiImporting,
    wikiSearchOpen,
    setWikiSearchOpen,
    wikiSearchQuery,
    setWikiSearchQuery,
    wikiSearchResults,
    wikiSearching,
    wikiImportStep,
    wikiImportResult,
    setWikiImportResult,

    // Mutations
    updateField,
    updateAppearance,
    addEntries,
    removeEntry,
    setAvatar,
    upsertAIEntry,
    updateEntryStyle,
    downloadEntry,

    // Handlers
    handleFileSelect,
    handleAIGenerate,
    handleAIProfile,
    handleVlmEvaluate,
    handleVlmRetry,
    handleSubmit,
    handleOpenWikiSearch,
    handleWikiImport,
    doWikiSearch,
  };
}
