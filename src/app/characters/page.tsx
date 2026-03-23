"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  getAllCharacters,
  saveCharacter,
  deleteCharacter,
  clearAllCharacters,
} from "@/lib/client/db";
import type { Character, ComicStyle, ReferenceImageEntry } from "@/lib/types";
import { STYLE_DESCRIPTIONS } from "@/lib/config/styles";
import { getStoredRequestConfigs, getStoredConfigs } from "@/hooks/useAPIConfig";
import { getImageAdapter } from "@/lib/imageGen";
import { urlToBase64, formatDate } from "@/lib/utils";
import { exportCharactersAsZip, importDataFromFile } from "@/lib/exportImport";
import type { ExportProgress } from "@/lib/exportImport";
import { Spinner } from "@/components/ui/Spinner";
import { CharacterCard } from "@/components/CharacterCard";
import { CHARACTER_PRESETS } from "@/lib/config/characterPresets";
import { generateCharacterProfile, generateCharacterReferencePrompt } from "@/lib/llm";
import { evaluateCharacterVisual, type CharacterVisualScore } from "@/lib/vlmScorer";

// ============================================================
// Constants
// ============================================================

const STYLE_NAMES: Record<ComicStyle, string> = Object.fromEntries(
  (Object.keys(STYLE_DESCRIPTIONS) as ComicStyle[]).map((key) => [
    key,
    STYLE_DESCRIPTIONS[key].split("，")[0].replace(/风格$/, ""),
  ])
) as Record<ComicStyle, string>;

const ALL_STYLES = Object.keys(STYLE_DESCRIPTIONS) as ComicStyle[];

/** Maximum number of image versions to keep per reference entry */
const MAX_VERSIONS = 5;

// ============================================================
// Helpers — entry creation (DRY)
// ============================================================

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

/** Resolve initial avatar index from a loaded character. */
function resolveAvatarIndex(char: Partial<Character> | null): number {
  if (!char?.avatarUrl || !char.referenceEntries?.length) return 0;
  const idx = char.referenceEntries.findIndex((e) => e.imageUrl === char.avatarUrl);
  return idx >= 0 ? idx : 0;
}

/** Empty character template */
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

// ============================================================
// CharacterDialog — refactored with clean data flow
// ============================================================
//
// Data model:
//   entries[]    — single source of truth for all reference images
//   avatarIndex  — which entry is the avatar (integer, NOT url comparison)
//   avatarUrl    — computed at save time: entries[avatarIndex]?.imageUrl ?? null
//
// Mutations:
//   addEntries()   — append new entries (upload / AI generate)
//   removeEntry()  — delete by index, auto-fix avatarIndex
//   setAvatar()    — change avatar to a different index
//
// ============================================================

function CharacterDialog({
  character,
  onSave,
  onClose,
  saveSuccessCount = 0,
}: {
  character: Partial<Character> | null;
  onSave: (data: Omit<Character, "id" | "createdAt" | "updatedAt"> & { id?: string }) => void;
  onClose: () => void;
  saveSuccessCount?: number;
}) {
  const isEdit = !!character?.id;

  // --- Form fields (excluding entries/avatar) ---
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

  // --- Reference images: single source of truth ---
  // Initialize with explicit style on every entry — fills undefined with character's base style
  // so the style filter always has real data to match against.
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
  /** Index of entry being regenerated, or -1 for new generation */
  const [regeneratingIndex, setRegeneratingIndex] = useState(-1);
  // --- VLM evaluation state ---
  const [vlmScore, setVlmScore] = useState<CharacterVisualScore | null>(null);
  const [vlmLoading, setVlmLoading] = useState(false);
  const [vlmError, setVlmError] = useState("");

  // --- Model selection state ---
  const storedConfigs = useMemo(() => getStoredConfigs(), []);
  const [selectedLLMId, setSelectedLLMId] = useState(storedConfigs.activeLLMId ?? "");
  const [selectedImageId, setSelectedImageId] = useState(storedConfigs.activeImageId ?? "");
  /** Index of entry being previewed in lightbox, -1 = closed */
  const [previewIndex, setPreviewIndex] = useState(-1);

  const [variants, setVariants] = useState<Array<{
    label: string;
    appearance: { gender: string; age: string; hair: string; eyes: string; clothing: string };
  }>>(
    (character as Record<string, unknown>)?.variants
      ? ((character as Record<string, unknown>).variants as Array<{ label: string; appearance: { gender: string; age: string; hair: string; eyes: string; clothing: string } }>).map((v) => ({
          label: v.label || "",
          appearance: v.appearance || { gender: "", age: "", hair: "", eyes: "", clothing: "" },
        }))
      : [],
  );

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

  /** Append one or more entries. First entry auto-becomes avatar if none exists. */
  const addEntries = useCallback((newEntries: ReferenceImageEntry[]) => {
    setEntries((prev) => {
      const updated = [...prev, ...newEntries];
      // Auto-set avatar to first entry if no entries existed before
      if (prev.length === 0 && updated.length > 0) {
        setAvatarIndex(0);
      }
      return updated;
    });
  }, []);

  /** Remove entry by index. Avatar index is adjusted automatically. */
  const removeEntry = useCallback((index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
    setAvatarIndex((prev) => {
      if (index < prev) return prev - 1;    // Deleted before avatar → shift left
      if (index === prev) return 0;          // Deleted the avatar → reset to first
      return prev;                           // Deleted after avatar → no change
    });
  }, []);

  /** Set avatar to entry at given index. */
  const setAvatar = useCallback((index: number) => {
    setAvatarIndex(index);
  }, []);

  /** Replace an existing AI entry of the same style, or append as new. */
  const upsertAIEntry = useCallback((entry: ReferenceImageEntry, targetIndex?: number) => {
    setEntries((prev) => {
      if (targetIndex !== undefined && targetIndex >= 0 && targetIndex < prev.length) {
        // Regenerate: replace the specific entry, keep version history (capped)
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
      // New entry — append
      setAvatarIndex(prev.length);
      return [...prev, entry];
    });
  }, []);

  /** Update the style tag on a specific entry. */
  const updateEntryStyle = useCallback((index: number, style: ComicStyle) => {
    setEntries((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], style };
      return updated;
    });
  }, []);

  /** Download an entry's image as file */
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
      // 尝试用 LLM 生成高质量参考图 prompt（如果 LLM 已配置）
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
        // LLM 不可用时降级为直接拼接
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

  // Wikipedia 导入：搜索选择 → 英文优先 → LLM 智能摘要 → 双语对照
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

  // 打开 Wikipedia 搜索面板
  const handleOpenWikiSearch = () => {
    setWikiSearchOpen(true);
    setWikiSearchQuery(form.name.trim());
    setWikiSearchResults([]);
    setWikiImportResult(null);
    // 自动触发搜索
    if (form.name.trim()) {
      doWikiSearch(form.name.trim());
    }
  };

  // 中英双语同时搜索
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
        // 并行搜索中英文
        const [enRes, zhRes] = await Promise.all([
          fetch(`/api/wikipedia?q=${encodeURIComponent(query)}&lang=en`).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(`/api/wikipedia?q=${encodeURIComponent(query)}&lang=zh`).then(r => r.ok ? r.json() : null).catch(() => null),
        ]);

        const results: Array<{ title: string; description?: string; thumbnail?: { source: string }; lang: string }> = [];
        const seen = new Set<string>();

        // 英文结果优先
        for (const r of (enRes?.results || [])) {
          const key = r.title.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            results.push({ ...r, lang: "en" });
          }
        }
        // 中文结果
        for (const r of (zhRes?.results || [])) {
          const key = r.title.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            results.push({ ...r, lang: "zh" });
          }
        }

        setWikiSearchResults(results.slice(0, 10));
      } catch {
        // 静默
      } finally {
        setWikiSearching(false);
      }
    }, 300);
  }, []);

  // 用户选择某篇文章后执行导入
  const handleWikiImport = async (selectedTitle: string, selectedLang: string) => {
    setWikiImporting(true);
    setAiError("");
    setWikiImportResult(null);
    setWikiImportStep("获取文章...");
    const charName = form.name.trim() || selectedTitle;

    try {
      // ── 获取选中文章 ──
      // 英文优先：如果选的是中文结果，也尝试获取英文版
      let article: { extract?: string; thumbnail?: { source: string }; title?: string; pageUrl?: string } | null = null;
      let articleLang = selectedLang;

      if (selectedLang === "zh") {
        // 先获取中文文章
        const zhRes = await fetch(`/api/wikipedia?title=${encodeURIComponent(selectedTitle)}&lang=zh`);
        if (zhRes.ok) article = await zhRes.json();

        // 尝试获取英文版（通常内容更丰富）
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

      // ── 缩略图导入为参考图 ──
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
          // 缩略图获取失败不阻断
        }
      }

      // ── LLM 智能摘要 + 外观提取 + 中文翻译（一次 LLM 调用完成） ──
      setWikiImportStep("AI 提取外观特征...");
      const { llmConfig } = getStoredRequestConfigs(selectedLLMId || undefined);
      let enDescription = rawExtract;
      let zhSummary = "";
      let appearanceFieldCount = 0;
      let tagCount = 0;

      if (llmConfig) {
        try {
          // 当内容过长（>1500字符）时让 LLM 摘要；否则直接提取
          const needsSummary = rawExtract.length > 1500;
          const extractForLLM = rawExtract.slice(0, 4000); // 防止超长

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

          // 填充外观字段
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

          // 使用 LLM 生成的摘要描述（如果比原文短）
          if (profile.description && needsSummary) {
            enDescription = profile.description;
          }

          // 合并 tags
          if (profile.tags.length > 0) {
            setTagInput((prev) => {
              const existing = prev ? prev.split(/[,，]+/).map(s => s.trim()) : [];
              const merged = [...new Set([...existing, ...profile.tags])].filter(Boolean);
              return merged.join(", ");
            });
            tagCount = profile.tags.length;
          }
        } catch {
          // LLM 失败不阻断，使用原始 Wikipedia 文本
        }

        // ── 中文翻译摘要（独立调用，快速生成） ──
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
            // 翻译失败不阻断
          }
        }
      }

      // ── 存储英文描述 ──
      // 截断过长内容
      if (enDescription.length > 2000) {
        enDescription = enDescription.slice(0, 2000) + "...";
      }
      updateField("description", enDescription);

      // ── 显示导入结果摘要 ──
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

  // --- VLM visual evaluation ---
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
        // Fall back to LLM config
        const activeLLM = configs.llmConfigs.find((c) => c.id === configs.activeLLMId) || configs.llmConfigs[0];
        if (!activeLLM) throw new Error("未配置 VLM 或 LLM");
        vlmConfig = { apiUrl: activeLLM.apiUrl, apiKey: activeLLM.apiKey, model: activeLLM.model, provider: activeLLM.protocolType as "openai-compatible" | "anthropic" };
      }
      const imageUrls = entries.map((e) => e.imageUrl);
      const desc = `${form.name}: ${form.description}. ${form.appearance.gender}, ${form.appearance.age}, hair: ${form.appearance.hair}, eyes: ${form.appearance.eyes}, clothing: ${form.appearance.clothing}`;
      const result = await evaluateCharacterVisual(form.name, desc, imageUrls, vlmConfig);
      setVlmScore(result);
    } catch (err) {
      setVlmError(err instanceof Error ? err.message : "视觉评分失败");
    } finally {
      setVlmLoading(false);
    }
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    const tags = tagInput
      .split(/[,，、；;]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // Ensure every entry has an explicit style (fill undefined with form.style)
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
      avatarUrl,                   // ← computed from entries[avatarIndex]
      referenceEntries: finalEntries,   // ← all entries have explicit style
      tags,
      variants: variants.length > 0
        ? variants.map((v) => ({
            label: v.label,
            appearance: v.appearance,
            referenceEntries: [],
            avatarUrl: null,
          }))
        : undefined,
    });
  };

  // --- Save feedback ---
  const [saveSuccess, setSaveSuccess] = useState(false);
  // Show toast when parent increments saveSuccessCount
  useEffect(() => {
    if (saveSuccessCount > 0) {
      setSaveSuccess(true);
      const timer = setTimeout(() => setSaveSuccess(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [saveSuccessCount]);

  // --- Render ---
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={() => { if (previewIndex < 0) onClose(); }}
    >
      <div
        className="bg-background rounded-xl border shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-4">
          <h2 className="text-lg font-bold">{isEdit ? "编辑角色" : "创建角色"}</h2>

          {/* 名称 + 操作按钮 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">角色名 *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="如：林黛玉、Darth Vader"
              className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAIProfile}
                disabled={aiGenerating || wikiImporting || !form.name.trim()}
                className="flex-1 px-3 py-2 text-xs border border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-400 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {aiGenerating ? (
                  <>
                    <Spinner size="sm" />
                    生成中...
                  </>
                ) : (
                  "AI 生成档案"
                )}
              </button>
              <button
                onClick={handleOpenWikiSearch}
                disabled={wikiImporting || aiGenerating}
                className="flex-1 px-3 py-2 text-xs border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {wikiImporting ? (
                  <>
                    <Spinner size="sm" />
                    {wikiImportStep || "导入中..."}
                  </>
                ) : (
                  "Wikipedia 导入"
                )}
              </button>
            </div>

            {/* Wikipedia 搜索选择面板 */}
            {wikiSearchOpen && !wikiImporting && (
              <div className="border rounded-lg bg-muted/30 p-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={wikiSearchQuery}
                    onChange={(e) => {
                      setWikiSearchQuery(e.target.value);
                      doWikiSearch(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setWikiSearchOpen(false);
                    }}
                    placeholder="搜索 Wikipedia 文章..."
                    className="flex-1 px-2.5 py-1.5 text-xs border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    autoFocus
                  />
                  <button
                    onClick={() => setWikiSearchOpen(false)}
                    className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    取消
                  </button>
                </div>

                {wikiSearching && (
                  <div className="flex items-center justify-center py-3 gap-1.5 text-xs text-muted-foreground">
                    <Spinner size="sm" />
                    搜索中...
                  </div>
                )}

                {!wikiSearching && wikiSearchResults.length > 0 && (
                  <div className="max-h-60 overflow-y-auto rounded-lg border divide-y">
                    {wikiSearchResults.map((result) => (
                      <button
                        key={`${result.lang}:${result.title}`}
                        onClick={() => handleWikiImport(result.title, result.lang)}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left hover:bg-accent transition-colors"
                      >
                        {result.thumbnail ? (
                          <img
                            src={result.thumbnail.source}
                            alt=""
                            className="w-8 h-8 rounded object-cover flex-shrink-0 bg-muted"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0 text-xs font-bold text-blue-500">
                            W
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium truncate">
                            {result.title}
                            <span className={`ml-1.5 text-[10px] px-1 py-0.5 rounded ${
                              result.lang === "en"
                                ? "bg-blue-100 dark:bg-blue-900/40 text-blue-500"
                                : "bg-green-100 dark:bg-green-900/40 text-green-600"
                            }`}>
                              {result.lang === "en" ? "EN" : "ZH"}
                            </span>
                          </div>
                          {result.description && (
                            <div className="text-[10px] text-muted-foreground line-clamp-1">{result.description}</div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {!wikiSearching && wikiSearchResults.length === 0 && wikiSearchQuery.trim() && (
                  <div className="text-center py-3 text-xs text-muted-foreground">
                    未找到相关文章，试试英文名或其他关键词
                  </div>
                )}
              </div>
            )}
            {aiError && <p className="text-xs text-red-500">{aiError}</p>}

            {/* Wikipedia 导入结果预览 */}
            {wikiImportResult && (
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Wikipedia 导入成功</span>
                  <button
                    onClick={() => setWikiImportResult(null)}
                    className="text-xs text-blue-400 hover:text-blue-600 transition-colors"
                  >
                    关闭
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 text-[10px] text-blue-600 dark:text-blue-400">
                  <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 rounded">
                    描述 {wikiImportResult.enDesc.length} 字符
                  </span>
                  {wikiImportResult.appearanceFields > 0 && (
                    <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 rounded">
                      外观 {wikiImportResult.appearanceFields} 项
                    </span>
                  )}
                  {wikiImportResult.thumbnail && (
                    <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 rounded">
                      参考图 1 张
                    </span>
                  )}
                  {wikiImportResult.tags > 0 && (
                    <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 rounded">
                      标签 {wikiImportResult.tags} 个
                    </span>
                  )}
                </div>
                {wikiImportResult.zhSummary && (
                  <div className="text-xs text-blue-700 dark:text-blue-300 border-t border-blue-200 dark:border-blue-800 pt-2 mt-1">
                    <span className="text-[10px] text-blue-400 block mb-0.5">中文摘要：</span>
                    {wikiImportResult.zhSummary}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 描述 */}
          <div className="space-y-1">
            <label className="text-sm font-medium">描述</label>
            <textarea
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="角色的简要描述..."
              className="w-full px-3 py-2 text-sm border rounded-lg bg-background resize-none h-16 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* 外观属性 */}
          <div className="space-y-1">
            <label className="text-sm font-medium">外观属性</label>
            <div className="mb-2">
              <input
                type="text"
                value={form.appearance.species || ""}
                onChange={(e) => updateAppearance("species", e.target.value)}
                placeholder="物种/类型（留空=人类，如：penguin, whale, lobster）"
                className="w-full px-3 py-1.5 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["gender", "age", "hair", "eyes", "clothing"] as const).map((key) => {
                const isNonHuman = !!form.appearance.species;
                const humanLabels: Record<string, string> = {
                  gender: "性别", age: "年龄", hair: "发型/发色", eyes: "眼睛", clothing: "服装",
                };
                const mascotLabels: Record<string, string> = {
                  gender: "性别（可填 N/A）", age: "年龄/阶段", hair: "毛发/羽毛/外表特征",
                  eyes: "眼睛特征", clothing: "体表/装饰/配件",
                };
                const labels = isNonHuman ? mascotLabels : humanLabels;
                return (
                  <div key={key} className={key === "clothing" ? "col-span-2" : ""}>
                    <input
                      type="text"
                      value={form.appearance[key]}
                      onChange={(e) => updateAppearance(key, e.target.value)}
                      placeholder={labels[key]}
                      className="w-full px-3 py-1.5 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* 风格 */}
          <div className="space-y-1">
            <label className="text-sm font-medium">绘画风格</label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_STYLES.map((s) => (
                <button
                  key={s}
                  onClick={() => updateField("style", s)}
                  className={`px-2.5 py-1 text-xs rounded-lg border transition-all ${
                    form.style === s
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "hover:border-primary/50"
                  }`}
                >
                  {STYLE_NAMES[s]}
                </button>
              ))}
            </div>
          </div>

          {/* 标签 */}
          <div className="space-y-1">
            <label className="text-sm font-medium">标签（逗号分隔）</label>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="如：古风, 女性, 红楼梦"
              className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* AI 模型选择 */}
          {(storedConfigs.llmConfigs.length > 1 || storedConfigs.imageConfigs.length > 1) && (
            <div className="space-y-1">
              <label className="text-sm font-medium">AI 模型</label>
              <div className="grid grid-cols-2 gap-2">
                {storedConfigs.llmConfigs.length > 0 && (
                  <div>
                    <label className="text-[10px] text-muted-foreground">LLM（档案生成）</label>
                    <select
                      value={selectedLLMId}
                      onChange={(e) => setSelectedLLMId(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {storedConfigs.llmConfigs.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name || c.model}{c.id === storedConfigs.activeLLMId ? " ★" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {storedConfigs.imageConfigs.length > 0 && (
                  <div>
                    <label className="text-[10px] text-muted-foreground">文生图（参考图）</label>
                    <select
                      value={selectedImageId}
                      onChange={(e) => setSelectedImageId(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {storedConfigs.imageConfigs.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name || c.model}{c.id === storedConfigs.activeImageId ? " ★" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 参考图 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              参考图
              {entries.length > 0 && (
                <span className="text-xs text-muted-foreground font-normal ml-1">
                  {entries.length} 张
                </span>
              )}
            </label>

            {/* 缩略图列表 */}
            {entries.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {entries.map((entry, index) => (
                  <div
                    key={`${index}-${entry.createdAt}`}
                    className="relative group/thumb rounded-lg border overflow-hidden bg-white"
                  >
                    {/* Image — clickable */}
                    <button
                      type="button"
                      onClick={() => setPreviewIndex(index)}
                      className="block w-full aspect-square cursor-zoom-in"
                      title="点击预览大图"
                    >
                      <img
                        src={entry.imageUrl}
                        alt={`参考图 ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                    {/* Avatar badge */}
                    {index === avatarIndex && (
                      <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center shadow">
                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      </div>
                    )}
                    {/* Style pill — bottom overlay */}
                    <div className="absolute bottom-0 inset-x-0 bg-black/50 px-1 py-0.5">
                      <select
                        value={entry.style || "anime"}
                        onChange={(e) => updateEntryStyle(index, e.target.value as ComicStyle)}
                        className="w-full text-[10px] text-white text-center bg-transparent border-none outline-none cursor-pointer appearance-none"
                        title="设置此图的风格标签"
                      >
                        {ALL_STYLES.map((s) => (
                          <option key={s} value={s} className="text-black">{STYLE_NAMES[s]}</option>
                        ))}
                      </select>
                    </div>
                    {/* Action buttons — hover */}
                    <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                      {index !== avatarIndex && (
                        <button
                          onClick={() => setAvatar(index)}
                          className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs shadow"
                          title="设为头像"
                        >
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                          </svg>
                        </button>
                      )}
                      {entry.source === "ai" && (
                        <button
                          onClick={() => handleAIGenerate(index)}
                          disabled={aiGenerating}
                          className="w-5 h-5 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs disabled:opacity-50 shadow"
                          title="重新生成"
                        >
                          {regeneratingIndex === index ? (
                            <Spinner size="sm" />
                          ) : (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => removeEntry(index)}
                        className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs shadow"
                        title="删除"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Action buttons row */}
            <div className="flex gap-2 flex-wrap">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 text-xs border rounded-lg hover:bg-accent transition-colors"
              >
                上传参考图
              </button>
              <button
                onClick={() => handleAIGenerate()}
                disabled={aiGenerating}
                className="px-3 py-1.5 text-xs border border-purple-200 text-purple-600 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {aiGenerating && regeneratingIndex === -1 ? (
                  <>
                    <Spinner size="sm" />
                    生成中...
                  </>
                ) : (
                  "AI 生成参考图"
                )}
              </button>
              {entries.length > 0 && (
                <button
                  onClick={handleVlmEvaluate}
                  disabled={vlmLoading}
                  className="px-3 py-1.5 text-xs border border-violet-200 text-violet-600 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {vlmLoading ? (
                    <>
                      <Spinner size="sm" />
                      评估中...
                    </>
                  ) : (
                    <>
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      VLM 视觉评分
                    </>
                  )}
                </button>
              )}
            </div>
            {aiError && (
              <p className="text-xs text-red-500 w-full">{aiError}</p>
            )}
            {vlmError && (
              <p className="text-xs text-red-500 w-full">{vlmError}</p>
            )}

            {/* VLM Score Display */}
            {vlmScore && (
              <div className="w-full p-3 rounded-lg border bg-violet-50/50 dark:bg-violet-900/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-violet-700 dark:text-violet-400">视觉评分</span>
                  <span className="text-sm font-bold text-violet-700 dark:text-violet-400">{vlmScore.overall}/10</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">特征清晰度</span><span>{vlmScore.featureClarity}/10</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">一致性</span><span>{vlmScore.consistency}/10</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">画面质量</span><span>{vlmScore.imageQuality}/10</span></div>
                </div>
                {vlmScore.issues.length > 0 && (
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {vlmScore.issues.map((issue, i) => (
                      <li key={i} className="flex gap-1.5"><span className="text-orange-500 shrink-0">!</span>{issue}</li>
                    ))}
                  </ul>
                )}
                {vlmScore.suggestions.length > 0 && (
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {vlmScore.suggestions.map((s, i) => (
                      <li key={i} className="flex gap-1.5"><span className="text-violet-500 shrink-0">-</span>{s}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="space-y-2 pt-2">
            {/* Success toast */}
            {saveSuccess && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                已保存成功
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleSubmit}
                disabled={!form.name.trim()}
                className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {isEdit ? "保存修改" : "创建角色"}
              </button>
              <button
                onClick={onClose}
                className="px-6 py-2 rounded-lg border hover:bg-accent transition-colors"
              >
                {saveSuccess ? "关闭" : "取消"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Image preview lightbox */}
      {previewIndex >= 0 && previewIndex < entries.length && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center"
          onClick={(e) => { e.stopPropagation(); setPreviewIndex(-1); }}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Image */}
            <img
              src={entries[previewIndex].imageUrl}
              alt={`参考图 ${previewIndex + 1}`}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />

            {/* Bottom toolbar */}
            <div className="mt-3 flex items-center gap-3">
              {/* Prev */}
              <button
                onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
                disabled={previewIndex === 0}
                className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 disabled:opacity-30 transition-colors"
                title="上一张"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              {/* Counter */}
              <span className="text-white/70 text-sm tabular-nums">
                {previewIndex + 1} / {entries.length}
              </span>

              {/* Next */}
              <button
                onClick={() => setPreviewIndex((i) => Math.min(entries.length - 1, i + 1))}
                disabled={previewIndex === entries.length - 1}
                className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 disabled:opacity-30 transition-colors"
                title="下一张"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {/* Divider */}
              <div className="w-px h-5 bg-white/30" />

              {/* Download */}
              <button
                onClick={() => downloadEntry(previewIndex)}
                className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors"
                title="下载图片"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>

              {/* Close */}
              <button
                onClick={() => setPreviewIndex(-1)}
                className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors"
                title="关闭"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// CharactersPage
// ============================================================

export default function CharactersPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStyle, setFilterStyle] = useState<ComicStyle | "">("");
  const [dialogChar, setDialogChar] = useState<Partial<Character> | null | "new">(null);
  /** Incremented after each successful save — dialog observes to show toast */
  const [saveSuccessCount, setSaveSuccessCount] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  // Export selection mode
  const [exportMode, setExportMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Repair state
  const [repairing, setRepairing] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);

  // Drag-and-drop reorder
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  // Auto-scroll during drag — RAF loop for smooth 60fps scrolling
  const scrollSpeedRef = useRef(0);
  const scrollRAFRef = useRef(0);

  useEffect(() => {
    if (dragIndex === null) {
      scrollSpeedRef.current = 0;
      cancelAnimationFrame(scrollRAFRef.current);
      return;
    }
    const tick = () => {
      if (scrollSpeedRef.current !== 0) {
        window.scrollBy(0, scrollSpeedRef.current);
      }
      scrollRAFRef.current = requestAnimationFrame(tick);
    };
    scrollRAFRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(scrollRAFRef.current);
  }, [dragIndex]);

  /** Update auto-scroll speed based on cursor proximity to viewport edges */
  const updateScrollSpeed = useCallback((clientY: number) => {
    const EDGE = 100;
    const MAX_SPEED = 14;
    const vh = window.innerHeight;
    if (clientY < EDGE) {
      scrollSpeedRef.current = -Math.round(MAX_SPEED * (1 - clientY / EDGE));
    } else if (clientY > vh - EDGE) {
      scrollSpeedRef.current = Math.round(MAX_SPEED * (1 - (vh - clientY) / EDGE));
    } else {
      scrollSpeedRef.current = 0;
    }
  }, []);

  useEffect(() => {
    loadCharacters();
  }, []);

  const loadCharacters = async () => {
    try {
      const data = await getAllCharacters();
      // Sort by sortOrder (if present), then by updatedAt descending as fallback
      data.sort((a, b) => {
        const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        return (new Date(b.updatedAt).getTime() || 0) - (new Date(a.updatedAt).getTime() || 0);
      });
      setCharacters(data);
    } catch (e) {
      console.error("Failed to load characters:", e);
    }
  };

  const handleSave = async (
    data: Omit<Character, "id" | "createdAt" | "updatedAt"> & { id?: string },
  ) => {
    const now = new Date().toISOString();
    const existing = data.id ? characters.find((c) => c.id === data.id) : null;
    const character: Character = {
      id: data.id || crypto.randomUUID(),
      name: data.name,
      description: data.description,
      appearance: data.appearance,
      style: data.style,
      avatarUrl: data.avatarUrl,
      referenceEntries: data.referenceEntries,
      tags: data.tags,
      sortOrder: existing?.sortOrder,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    try {
      await saveCharacter(character);
      // Stay open — update dialogChar to reflect saved state (so re-save works)
      setDialogChar(character);
      setSaveSuccessCount((c) => c + 1);
      await loadCharacters();
    } catch (err) {
      console.error("Save character failed:", err);
      alert("保存失败，请重试");
      await loadCharacters();
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`确定删除角色「${name}」？此操作不可撤销。`)) {
      await deleteCharacter(id);
      await loadCharacters();
    }
  };

  const handleClearAll = async () => {
    if (confirmClear) {
      await clearAllCharacters();
      setCharacters([]);
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  };

  // --- Export selection ---

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const enterExportMode = () => {
    setExportMode(true);
    setSelectedIds(new Set());
  };

  const exitExportMode = () => {
    setExportMode(false);
    setSelectedIds(new Set());
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filtered.map((c) => c.id)));
  };

  const handleExportSelected = async () => {
    const selected = characters.filter((c) => selectedIds.has(c.id));
    if (selected.length === 0) return;
    try {
      await exportCharactersAsZip(selected, setExportProgress);
    } catch (err) {
      console.error("Export failed:", err);
      alert("导出失败，请查看控制台日志");
    } finally {
      setExportProgress(null);
    }
    exitExportMode();
  };

  const handleExportAll = async () => {
    if (characters.length === 0) return;
    try {
      await exportCharactersAsZip(characters, setExportProgress);
    } catch (err) {
      console.error("Export failed:", err);
      alert("导出失败，请查看控制台日志");
    } finally {
      setExportProgress(null);
    }
  };

  // --- Data repair: fix missing style + trim version history ---

  const handleRepairData = async () => {
    setRepairing(true);
    try {
      let fixedCount = 0;
      for (const char of characters) {
        let modified = false;
        const updatedEntries = char.referenceEntries.map((entry) => {
          const updated = { ...entry };

          // Fix missing style — use character's default style
          if (!entry.style && char.style) {
            updated.style = char.style;
            modified = true;
          }

          // Trim excess version history
          if (entry.versions && entry.versions.length > MAX_VERSIONS) {
            updated.versions = entry.versions.slice(-MAX_VERSIONS);
            updated.activeVersionIndex = Math.min(
              entry.activeVersionIndex,
              updated.versions.length - 1,
            );
            modified = true;
          }

          return updated;
        });

        if (modified) {
          fixedCount++;
          await saveCharacter({
            ...char,
            referenceEntries: updatedEntries,
            updatedAt: new Date().toISOString(),
          });
        }
      }

      await loadCharacters();
      alert(fixedCount > 0
        ? `已修复 ${fixedCount} 个角色（补全风格标签 + 清理冗余版本）`
        : "所有角色数据正常，无需修复",
      );
    } catch (err) {
      console.error("Repair failed:", err);
      alert("修复失败，请查看控制台日志");
    } finally {
      setRepairing(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setExportProgress({ phase: "collecting", current: 0, total: 0 });
      const result = await importDataFromFile(file, setExportProgress);

      if (result.type !== "characters") {
        alert("该文件包含的是漫画任务数据，请在「历史记录」页面导入");
        return;
      }

      const arr = result.items as Record<string, unknown>[];
      let count = 0;
      for (const item of arr) {
        if (!item.name) continue;
        const now = new Date().toISOString();
        const character: Character = {
          id: (item.id as string) || crypto.randomUUID(),
          name: item.name as string,
          description: (item.description as string) || "",
          appearance: (item.appearance as Character["appearance"]) || { gender: "", age: "", hair: "", eyes: "", clothing: "" },
          style: (item.style as ComicStyle) || "anime",
          avatarUrl: (item.avatarUrl as string) || null,
          referenceEntries: (item.referenceEntries as ReferenceImageEntry[]) || [],
          tags: (item.tags as string[]) || [],
          sortOrder: item.sortOrder as number | undefined,
          createdAt: (item.createdAt as string) || now,
          updatedAt: now,
        };
        await saveCharacter(character);
        count++;
      }

      if (count > 0) {
        await loadCharacters();
      }
      alert(`成功导入 ${count} 个角色` + (result.imageCount > 0 ? `（含 ${result.imageCount} 张图片）` : ""));
    } catch (err) {
      console.error("Import failed:", err);
      alert("导入失败：文件格式不正确");
    } finally {
      setExportProgress(null);
    }

    e.target.value = "";
  };

  // Compute which styles are actually used (with counts) for the dropdown
  const usedStyles = useMemo(() => {
    const counts = new Map<ComicStyle, number>();
    characters.forEach((c) => {
      // Collect all styles: base style + per-entry styles (entry without style inherits base)
      const styles = new Set<ComicStyle>([c.style]);
      c.referenceEntries.forEach((e) => {
        styles.add(e.style || c.style);
      });
      styles.forEach((s) => counts.set(s, (counts.get(s) || 0) + 1));
    });
    return counts;
  }, [characters]);

  const filtered = characters.filter((c) => {
    if (filterStyle) {
      // Match base style, or any entry's style (entries without style inherit base)
      if (c.style === filterStyle) { /* pass */ }
      else if (c.referenceEntries.some((e) => (e.style || c.style) === filterStyle)) { /* pass */ }
      else return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  // Drag-and-drop is only enabled when no filter/search is active and not in export mode
  const canDrag = !exportMode && !searchQuery.trim() && !filterStyle;

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
    // Slightly transparent drag ghost
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, e.currentTarget.offsetWidth / 2, 40);
    }
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIndex !== null && index !== dragIndex) {
      setDropIndex(index);
    }
    updateScrollSpeed(e.clientY);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDropIndex(null);
    scrollSpeedRef.current = 0;
  };

  const handleDrop = async (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      handleDragEnd();
      return;
    }

    const reordered = [...characters];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    // Assign sequential sortOrder, save only changed items
    const toSave: Character[] = [];
    const updated = reordered.map((char, i) => {
      if (char.sortOrder !== i) {
        const c = { ...char, sortOrder: i };
        toSave.push(c);
        return c;
      }
      return char;
    });

    // Optimistic update
    setCharacters(updated);
    handleDragEnd();

    // Persist in background
    Promise.all(toSave.map((c) => saveCharacter(c))).catch((err) => {
      console.error("Failed to save character order:", err);
    });
  };

  return (
    <div
      className="max-w-6xl mx-auto space-y-6"
      onDragOver={dragIndex !== null ? (e) => { e.preventDefault(); updateScrollSpeed(e.clientY); } : undefined}
      onDrop={dragIndex !== null ? (e) => e.preventDefault() : undefined}
    >
      {dialogChar !== null && (
        <CharacterDialog
          character={dialogChar === "new" ? {} : dialogChar}
          onSave={handleSave}
          onClose={() => { setDialogChar(null); setSaveSuccessCount(0); }}
          saveSuccessCount={saveSuccessCount}
        />
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回
          </Link>
          <h1 className="text-2xl font-bold">角色库</h1>
          <span className="text-sm text-muted-foreground">{characters.length} 个角色</span>
        </div>

        {exportMode ? (
          /* ── Export selection toolbar ── */
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              已选 {selectedIds.size} / {filtered.length}
            </span>
            <button
              onClick={selectedIds.size === filtered.length ? () => setSelectedIds(new Set()) : selectAllFiltered}
              className="px-3 py-2 text-sm rounded-lg border hover:bg-accent transition-colors"
            >
              {selectedIds.size === filtered.length ? "取消全选" : "全选"}
            </button>
            <button
              onClick={handleExportSelected}
              disabled={selectedIds.size === 0}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              导出 {selectedIds.size} 个
            </button>
            <button
              onClick={exitExportMode}
              className="px-3 py-2 text-sm rounded-lg border hover:bg-accent transition-colors"
            >
              取消
            </button>
          </div>
        ) : (
          /* ── Normal toolbar ── */
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDialogChar("new")}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              创建角色
            </button>
            {characters.length > 0 && (
              <>
                <button
                  onClick={enterExportMode}
                  className="px-3 py-2 text-sm rounded-lg border hover:bg-accent transition-colors flex items-center gap-1.5"
                  title="选择并导出"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span className="hidden sm:inline">导出</span>
                </button>
                <button
                  onClick={handleExportAll}
                  className="px-3 py-2 text-sm rounded-lg border hover:bg-accent transition-colors"
                  title="一键导出所有角色"
                >
                  <span className="hidden sm:inline">全部导出</span>
                  <span className="sm:hidden text-xs">全部</span>
                </button>
              </>
            )}
            <input ref={importFileRef} type="file" accept=".json,.zip" onChange={handleImport} className="hidden" />
            <button
              onClick={() => importFileRef.current?.click()}
              className="px-3 py-2 text-sm rounded-lg border hover:bg-accent transition-colors flex items-center gap-1.5"
              title="导入角色库"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m4-8l-4-4m0 0L16 8m4-4v12" />
              </svg>
              <span className="hidden sm:inline">导入</span>
            </button>
            {characters.length > 0 && (
              <button
                onClick={handleRepairData}
                disabled={repairing}
                className="px-3 py-2 text-sm rounded-lg border hover:bg-accent transition-colors flex items-center gap-1.5 disabled:opacity-50"
                title="修复风格标签 + 清理冗余版本历史"
              >
                {repairing ? <Spinner size="sm" /> : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
                <span className="hidden sm:inline">修复数据</span>
              </button>
            )}
            {characters.length > 0 && (
              <button
                onClick={handleClearAll}
                className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                  confirmClear
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "border hover:bg-accent"
                }`}
              >
                {confirmClear ? "确认清空？" : "清空全部"}
              </button>
            )}
            <Link
              href="/trash"
              className="px-3 py-2 text-sm rounded-lg border hover:bg-accent transition-colors flex items-center gap-1.5"
              title="回收站"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span className="hidden sm:inline">回收站</span>
            </Link>
          </div>
        )}
      </div>

      {characters.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索角色名、描述或标签..."
            className="flex-1 min-w-[200px] px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <select
            value={filterStyle}
            onChange={(e) => setFilterStyle(e.target.value as ComicStyle | "")}
            className="px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">全部风格 ({characters.length})</option>
            {ALL_STYLES.filter((s) => usedStyles.has(s)).map((s) => (
              <option key={s} value={s}>{STYLE_NAMES[s]} ({usedStyles.get(s)})</option>
            ))}
          </select>
        </div>
      )}

      {characters.length === 0 && (
        <div className="space-y-8">
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center">
              <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-muted-foreground">角色库为空</p>
            <button
              onClick={() => setDialogChar("new")}
              className="inline-block px-6 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium hover:shadow-lg hover:shadow-purple-500/25 active:scale-[0.98] transition-all duration-200"
            >
              创建第一个角色
            </button>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground text-center">或从预设角色开始：</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {CHARACTER_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => setDialogChar({
                    name: preset.name,
                    description: preset.description,
                    appearance: preset.appearance,
                    style: preset.style,
                    tags: preset.tags,
                    avatarUrl: null,
                    referenceEntries: [],
                  })}
                  className="p-3 rounded-lg border text-center hover:bg-accent hover:border-primary/30 transition-all duration-200 hover:shadow-sm"
                >
                  <div className="text-2xl mb-1">
                    {preset.tags.includes("科普") ? "🔬" :
                     preset.tags.includes("古风") ? "⚔️" :
                     preset.tags.includes("诗词") ? "👘" :
                     preset.tags.includes("科幻") ? "🤖" :
                     preset.tags.includes("动物") ? "🐱" :
                     preset.tags.includes("小红书") ? "📱" : "👤"}
                  </div>
                  <div className="font-medium text-xs">{preset.name}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{preset.description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((char, index) => (
            <div
              key={char.id}
              draggable={canDrag}
              onDragStart={canDrag ? (e) => handleDragStart(e, index) : undefined}
              onDragOver={canDrag ? (e) => handleDragOver(e, index) : undefined}
              onDrop={canDrag ? () => handleDrop(index) : undefined}
              onDragEnd={canDrag ? handleDragEnd : undefined}
              onDragLeave={canDrag ? () => setDropIndex(null) : undefined}
              className={`transition-all duration-200 rounded-xl ${
                canDrag ? "cursor-grab active:cursor-grabbing" : ""
              } ${dragIndex === index ? "opacity-30 scale-90" : ""} ${
                dragIndex !== null && dragIndex !== index && dropIndex !== index ? "opacity-60" : ""
              } ${dropIndex === index ? "ring-2 ring-primary ring-offset-2 scale-105 opacity-100" : ""}`}
            >
              <CharacterCard
                char={char}
                onEdit={() => setDialogChar(char)}
                onDelete={() => handleDelete(char.id, char.name)}
                exportMode={exportMode}
                isSelected={selectedIds.has(char.id)}
                onToggleSelect={() => toggleSelect(char.id)}
              />
            </div>
          ))}
        </div>
      )}

      {characters.length > 0 && filtered.length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">没有匹配的角色</p>
        </div>
      )}

      {/* Export/Import progress overlay */}
      {exportProgress && exportProgress.phase !== "done" && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-card rounded-xl p-6 shadow-lg max-w-sm w-full mx-4 space-y-3">
            <div className="flex items-center gap-3">
              <Spinner size="sm" />
              <span className="text-sm font-medium">
                {exportProgress.phase === "collecting" && "正在收集图片引用..."}
                {exportProgress.phase === "fetching" && `正在处理图片 ${exportProgress.current}/${exportProgress.total}...`}
                {exportProgress.phase === "packing" && "正在打包 ZIP..."}
              </span>
            </div>
            {exportProgress.phase === "fetching" && exportProgress.total > 0 && (
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${Math.round((exportProgress.current / exportProgress.total) * 100)}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
