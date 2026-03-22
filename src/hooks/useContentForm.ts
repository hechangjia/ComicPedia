"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ComicStyle,
  ContentType,
  DifficultyLevel,
  GenerateRequest,
  GenerationQuality,
  ReferenceImageEntry,
  ReferenceGenMode,
  Character,
} from "@/lib/types";
import { useConfigCheck, getStoredRequestConfigs } from "@/hooks/useAPIConfig";
import { startGeneration } from "@/lib/client/generator";
import { generateReferenceImagePrompt, generateCharacterPrompts } from "@/lib/llm";
import { getImageAdapter } from "@/lib/imageGen";
import { extractReferenceEntries } from "@/components/CharacterPicker";
import { urlToBase64, createReferenceEntry } from "@/lib/utils";

// ============================================================
// 类型定义
// ============================================================

/** 各内容类型 Form 需要提供的差异化配置 */
export interface ContentFormConfig {
  /** 内容类型标识 */
  contentType: ContentType;
  /** 默认画风 */
  defaultStyle: ComicStyle;
  /** 面板数上限（传给 PanelCountSelector） */
  maxPanelCount?: number;
  /** 主输入为空时的验证提示文案 */
  emptyInputMessage: string;
}

/** useContentForm 返回的共享状态和方法 */
export interface ContentFormState {
  // 路由/配置
  router: ReturnType<typeof useRouter>;
  configStatus: ReturnType<typeof useConfigCheck>;

  // 共享状态
  style: ComicStyle;
  setStyle: (s: ComicStyle) => void;
  panelCount: number | null;
  setPanelCount: (n: number | null) => void;
  customPanelCount: string;
  setCustomPanelCount: (s: string) => void;
  isLoading: boolean;
  error: string;
  setError: (s: string) => void;
  selectedLLMId: string | null;
  setSelectedLLMId: (s: string | null) => void;
  selectedImageId: string | null;
  setSelectedImageId: (s: string | null) => void;
  quality: GenerationQuality;
  setQuality: (q: GenerationQuality) => void;
  difficulty: DifficultyLevel;
  setDifficulty: (d: DifficultyLevel) => void;

  // 参考图状态
  referenceImage: string | undefined;
  setReferenceImage: (s: string | undefined) => void;
  referenceImages: string[];
  setReferenceImages: React.Dispatch<React.SetStateAction<string[]>>;
  referenceLabels: string[];
  setReferenceLabels: React.Dispatch<React.SetStateAction<string[]>>;
  controlMode: "HED" | "Canny" | "Depth";
  setControlMode: (m: "HED" | "Canny" | "Depth") => void;
  referenceEntries: ReferenceImageEntry[];
  setReferenceEntries: React.Dispatch<React.SetStateAction<ReferenceImageEntry[]>>;
  genMode: ReferenceGenMode;
  setGenMode: (m: ReferenceGenMode) => void;

  // 角色状态
  selectedCharacterIds: string[];
  setSelectedCharacterIds: (ids: string[]) => void;

  // 共享回调
  handleCharacterSelection: (ids: string[], characters: Character[]) => void;
  handleAIGenerateReference: () => Promise<void>;
  handleAIGenerateCharacters: (names: string[]) => Promise<void>;
  handleRegenerateFormRef: (refIndex: number, prompt: string) => Promise<void>;
  handleFormRefVersionChange: (refIndex: number, versionIndex: number) => void;

  /**
   * 通用提交处理器。
   * 调用方提供主输入文本和额外的 payload 字段（content-type 特有部分）。
   */
  handleSubmit: (
    inputText: string,
    extraPayload?: Partial<GenerateRequest>,
  ) => Promise<void>;

  /** 获取草稿中保存的主输入文本 */
  getDraftInputText: () => string;
  /** 清除草稿 */
  clearDraft: () => void;
}

// ============================================================
// Hook 实现
// ============================================================

/**
 * 提取 4 个 Form 组件的共享状态和逻辑。
 *
 * 每个 Form 仅需提供：
 * 1. ContentFormConfig（静态配置）
 * 2. inputText（主输入文本，如 topic/content）
 * 3. extraPayload（提交时的额外字段，如 poetryGenre/novelMeta）
 */
export function useContentForm(
  config: ContentFormConfig,
  /** 主输入文本的实时引用（用于 AI 参考图生成时校验） */
  getInputText: () => string,
): ContentFormState {
  const router = useRouter();
  const configStatus = useConfigCheck();

  // 共享状态
  const [style, setStyle] = useState<ComicStyle>(config.defaultStyle);
  const [panelCount, setPanelCount] = useState<number | null>(null);
  const [customPanelCount, setCustomPanelCount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedLLMId, setSelectedLLMId] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [quality, setQuality] = useState<GenerationQuality>("standard");
  const [difficulty, setDifficulty] = useState<DifficultyLevel>("medium");

  // 参考图状态
  const [referenceImage, setReferenceImage] = useState<string | undefined>();
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [referenceLabels, setReferenceLabels] = useState<string[]>([]);
  const [controlMode, setControlMode] = useState<"HED" | "Canny" | "Depth">("HED");
  const [referenceEntries, setReferenceEntries] = useState<ReferenceImageEntry[]>([]);
  const [genMode, setGenMode] = useState<ReferenceGenMode>("controlnet");

  // 角色状态
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([]);

  // ---- 草稿自动保存/恢复 ----
  const DRAFT_KEY = `comicpedia_draft_${config.contentType}`;
  const draftInitialized = useRef(false);

  // 恢复草稿（仅首次挂载）
  useEffect(() => {
    if (draftInitialized.current) return;
    draftInitialized.current = true;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.style) setStyle(draft.style);
      if (draft.panelCount !== undefined) setPanelCount(draft.panelCount);
      if (draft.quality) setQuality(draft.quality);
      if (draft.difficulty) setDifficulty(draft.difficulty);
    } catch {
      // 草稿损坏，忽略
    }
  }, [DRAFT_KEY]);

  // 保存草稿（节流 1 秒）
  // 用 ref 持有 getInputText 避免它作为 effect 依赖导致频繁触发
  const getInputTextRef = useRef(getInputText);
  getInputTextRef.current = getInputText;
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      try {
        const inputText = getInputTextRef.current();
        const draft = {
          style, panelCount, quality, difficulty,
          inputText: inputText.slice(0, 5000),
          savedAt: Date.now(),
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        // localStorage 满或不可用，忽略
      }
    }, 1000);
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current); };
  }, [style, panelCount, quality, difficulty, DRAFT_KEY]);

  /** 获取已保存的草稿输入文本（供 Form 组件恢复主输入） */
  const getDraftInputText = useCallback((): string => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return "";
      const draft = JSON.parse(raw);
      return draft.inputText || "";
    } catch {
      return "";
    }
  }, [DRAFT_KEY]);

  /** 清除草稿（提交成功后调用） */
  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
  }, [DRAFT_KEY]);

  // ---- 共享回调 ----

  const handleCharacterSelection = useCallback((ids: string[], characters: Character[]) => {
    setSelectedCharacterIds(ids);
    if (characters.length > 0) {
      const entries = extractReferenceEntries(characters);
      setReferenceEntries(entries);
      setReferenceImages(entries.map((e) => e.imageUrl));
      setReferenceLabels(entries.map((e) => e.label));
      setReferenceImage(entries.length > 0 ? entries[0].imageUrl : undefined);

      // Auto-sync character style to form — use first selected character's style
      const primaryChar = characters[0];
      if (primaryChar.style) {
        setStyle(primaryChar.style);
      }
    } else {
      // Reset to default style when all characters are deselected
      setStyle(config.defaultStyle);
    }
  }, [config.defaultStyle]);

  const handleAIGenerateReference = useCallback(async () => {
    const inputText = getInputText();
    if (!inputText.trim()) {
      throw new Error(config.emptyInputMessage);
    }
    const { llmConfig, imageConfig } = getStoredRequestConfigs(
      selectedLLMId ?? undefined,
      selectedImageId ?? undefined,
    );
    if (!llmConfig) throw new Error("请先配置 LLM API");
    if (!imageConfig) throw new Error("请先配置文生图 API");

    const refPrompt = await generateReferenceImagePrompt(inputText, style, llmConfig);
    const adapter = getImageAdapter(imageConfig);
    const imageUrl = await adapter.generate(refPrompt, style);
    const base64 = await urlToBase64(imageUrl);

    setReferenceImages((prev) => [...prev, base64]);
    setReferenceLabels((prev) => [...prev, ""]);
    setReferenceImage(base64);
    setReferenceEntries((prev) => [...prev, createReferenceEntry(base64, refPrompt, "", "ai")]);
  }, [config.emptyInputMessage, getInputText, selectedLLMId, selectedImageId, style]);

  const handleAIGenerateCharacters = useCallback(async (names: string[]) => {
    const inputText = getInputText();
    if (!inputText.trim()) {
      throw new Error(config.emptyInputMessage);
    }
    const { llmConfig, imageConfig } = getStoredRequestConfigs(
      selectedLLMId ?? undefined,
      selectedImageId ?? undefined,
    );
    if (!llmConfig) throw new Error("请先配置 LLM API");
    if (!imageConfig) throw new Error("请先配置文生图 API");

    const characterPrompts = await generateCharacterPrompts(names, inputText, style, llmConfig);
    const adapter = getImageAdapter(imageConfig);
    const newEntries: ReferenceImageEntry[] = [];

    for (const cp of characterPrompts) {
      const imageUrl = await adapter.generate(cp.prompt, style);
      const base64 = await urlToBase64(imageUrl);
      newEntries.push(createReferenceEntry(base64, cp.prompt, cp.name, "ai"));
    }

    setReferenceImages((prev) => [...prev, ...newEntries.map((e) => e.imageUrl)]);
    setReferenceLabels((prev) => [...prev, ...newEntries.map((e) => e.label)]);
    if (newEntries.length > 0) setReferenceImage(newEntries[0].imageUrl);
    setReferenceEntries((prev) => [...prev, ...newEntries]);
  }, [config.emptyInputMessage, getInputText, selectedLLMId, selectedImageId, style]);

  /** 表单页：编辑 prompt 后重新生成参考图（无需已保存任务） */
  const handleRegenerateFormRef = useCallback(async (refIndex: number, prompt: string) => {
    const { imageConfig } = getStoredRequestConfigs(
      selectedLLMId ?? undefined,
      selectedImageId ?? undefined,
    );
    if (!imageConfig) throw new Error("请先配置文生图 API");

    const adapter = getImageAdapter(imageConfig);
    const imageUrl = await adapter.generate(prompt, style);
    const base64 = await urlToBase64(imageUrl);

    setReferenceEntries((prev) => {
      const updated = [...prev];
      const entry = { ...updated[refIndex] };

      // 归档旧版本（避免重复存储相同图片）
      const lastVersion = entry.versions[entry.versions.length - 1];
      if (!lastVersion || lastVersion.imageUrl !== entry.imageUrl) {
        entry.versions = [...entry.versions, { imageUrl: entry.imageUrl, createdAt: Date.now() }];
      }

      // 更新为新图片
      entry.imageUrl = base64;
      entry.prompt = prompt;
      entry.source = "ai";
      entry.versions = [...entry.versions, { imageUrl: base64, createdAt: Date.now() }];
      entry.activeVersionIndex = entry.versions.length - 1;

      updated[refIndex] = entry;
      return updated;
    });

    // 同步旧版字段
    setReferenceImages((prev) => {
      const updated = [...prev];
      updated[refIndex] = base64;
      return updated;
    });
    if (refIndex === 0) setReferenceImage(base64);
  }, [selectedLLMId, selectedImageId, style]);

  /** 表单页：切换参考图版本 */
  const handleFormRefVersionChange = useCallback((refIndex: number, versionIndex: number) => {
    setReferenceEntries((prev) => {
      const updated = [...prev];
      const entry = { ...updated[refIndex] };
      if (versionIndex < 0 || versionIndex >= entry.versions.length) return prev;

      const newImageUrl = entry.versions[versionIndex].imageUrl;
      entry.imageUrl = newImageUrl;
      entry.activeVersionIndex = versionIndex;
      updated[refIndex] = entry;

      // 同步旧版字段（在同一个 updater 中计算后调用）
      setReferenceImages((imgs) => {
        const updatedImgs = [...imgs];
        updatedImgs[refIndex] = newImageUrl;
        return updatedImgs;
      });
      if (refIndex === 0) setReferenceImage(newImageUrl);

      return updated;
    });
  }, []);

  const handleSubmit = useCallback(async (
    inputText: string,
    extraPayload?: Partial<GenerateRequest>,
  ) => {
    if (!inputText.trim()) {
      setError(config.emptyInputMessage);
      return;
    }
    if (!configStatus.hasLLM) {
      setError("请先配置 LLM API，点击上方横幅前往设置页面");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const { llmConfig, imageConfig } = getStoredRequestConfigs(
        selectedLLMId ?? undefined,
        selectedImageId ?? undefined,
      );
      const finalPanelCount = customPanelCount ? parseInt(customPanelCount, 10) : panelCount;

      const payload: GenerateRequest = {
        topic: inputText,
        style,
        contentType: config.contentType,
        quality,
        difficulty,
        ...extraPayload,
      };

      if (finalPanelCount !== null && finalPanelCount > 0) {
        payload.panelCount = finalPanelCount;
      }
      if (llmConfig) payload.llmConfig = llmConfig;
      if (imageConfig) payload.imageConfig = imageConfig;
      if (referenceImage) {
        payload.referenceImage = referenceImage;
        payload.controlMode = controlMode;
      }
      if (referenceImages.length > 0) {
        payload.referenceImages = referenceImages;
      }
      if (referenceEntries.length > 0) {
        payload.referenceEntries = referenceEntries;
      }
      if (selectedCharacterIds.length > 0) {
        payload.characterIds = selectedCharacterIds;
      }

      const taskId = await startGeneration(payload);
      clearDraft();
      router.push(`/result/${taskId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败，请重试");
      setIsLoading(false);
    }
  }, [
    config.contentType, config.emptyInputMessage, configStatus.hasLLM,
    controlMode, customPanelCount, panelCount, referenceImage,
    referenceImages, router, selectedCharacterIds, selectedImageId,
    selectedLLMId, style,
  ]);

  return {
    router, configStatus,
    style, setStyle,
    panelCount, setPanelCount,
    customPanelCount, setCustomPanelCount,
    isLoading, error, setError,
    selectedLLMId, setSelectedLLMId,
    selectedImageId, setSelectedImageId,
    quality, setQuality,
    difficulty, setDifficulty,
    referenceImage, setReferenceImage,
    referenceImages, setReferenceImages,
    referenceLabels, setReferenceLabels,
    controlMode, setControlMode,
    referenceEntries, setReferenceEntries,
    genMode, setGenMode,
    selectedCharacterIds, setSelectedCharacterIds,
    handleCharacterSelection,
    handleAIGenerateReference,
    handleAIGenerateCharacters,
    handleRegenerateFormRef,
    handleFormRefVersionChange,
    handleSubmit,
    getDraftInputText,
    clearDraft,
  };
}
