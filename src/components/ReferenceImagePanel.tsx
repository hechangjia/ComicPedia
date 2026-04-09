"use client";

import { useState } from "react";
import type { ReferenceImageEntry, ReferenceGenMode, Character } from "@/lib/types";
import { persistClientImage } from "@/lib/client/persistedImage";
import { ChevronRight, Paperclip, Users, Save } from "lucide-react";
import { Lightbox } from "./ref/RefShared";
import { RefImageCard } from "./ref/RefImageCard";
import { RefEditor } from "./ref/RefEditor";
import { RefImg2Img } from "./ref/RefImg2Img";
import { RefAIGenerator, RefAIGenerateButton, parseCharacterNames } from "./ref/RefAIGenerator";
import { RefCharacterPicker } from "./ref/RefCharacterPicker";
import { RefUploader } from "./ref/RefUploader";


/** 参考图面板组件 Props */
interface ReferenceImagePanelProps {
  // === 新增 Props ===
  /** 结构化参考图数据 */
  referenceEntries?: ReferenceImageEntry[];
  /** 更新整个 entries 数组 */
  onEntriesChange?: (entries: ReferenceImageEntry[]) => void;
  /** 重新生成某张参考图 */
  onRegenerateRef?: (refIndex: number, prompt: string) => Promise<void>;
  /** 图生图生成 */
  onImg2Img?: (refIndex: number, sourceImage: string, prompt: string, strength: number) => Promise<void>;
  /** 切换版本 */
  onRefVersionChange?: (refIndex: number, versionIndex: number) => void;
  /** 生成模式：controlnet / img2img */
  genMode?: ReferenceGenMode;
  onGenModeChange?: (mode: ReferenceGenMode) => void;

  // === 保留现有 Props（向后兼容）===
  /** 单张参考图（向后兼容） */
  referenceImage?: string;
  /** 多张参考图 */
  referenceImages?: string[];
  /** 每张参考图的标签/角色名 */
  referenceLabels?: string[];
  controlMode?: "HED" | "Canny" | "Depth";
  /** 单图变更回调（向后兼容） */
  onImageChange: (base64: string | undefined) => void;
  /** 多图变更回调 */
  onImagesChange?: (images: string[]) => void;
  /** 标签变更回调 */
  onLabelsChange?: (labels: string[]) => void;
  onControlModeChange: (mode: "HED" | "Canny" | "Depth") => void;
  /** 可选：AI 生成单张参考图回调（无角色名时使用） */
  onAIGenerate?: () => Promise<void>;
  /** 可选：AI 按角色批量生成参考图回调 */
  onAIGenerateCharacters?: (names: string[]) => Promise<void>;
  /** 可选：作品标题，用于保存参考图到文件系统 */
  title?: string;
}

/** 参考图面板组件（支持多张 + 角色名称 + prompt 编辑 + 版本管理 + img2img） */
export function ReferenceImagePanel(props: ReferenceImagePanelProps) {
  const {
    referenceEntries,
    onEntriesChange,
    onRegenerateRef,
    onImg2Img,
    onRefVersionChange,
    genMode,
    onGenModeChange,
    referenceImage,
    referenceImages,
    referenceLabels,
    controlMode,
    onImageChange,
    onImagesChange,
    onLabelsChange,
    onControlModeChange,
    onAIGenerate,
    onAIGenerateCharacters,
    title,
  } = props;

  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [lightboxLabel, setLightboxLabel] = useState<string | undefined>();
  const [characterInput, setCharacterInput] = useState("");

  // 参考图编辑状态
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);

  // img2img 状态
  const [img2imgIndex, setImg2imgIndex] = useState<number | null>(null);
  const [img2imgPrompt, setImg2imgPrompt] = useState("");
  const [img2imgStrength, setImg2imgStrength] = useState(0.65);
  const [img2imgGenerating, setImg2imgGenerating] = useState(false);

  // 角色库选择状态
  const [showCharacterPicker, setShowCharacterPicker] = useState(false);

  // 使用新版 entries 还是旧版字段
  const useEntries = !!referenceEntries && referenceEntries.length > 0;

  // 合并单图和多图为统一的图片列表（旧模式）
  const legacyImages: string[] = referenceImages && referenceImages.length > 0
    ? referenceImages
    : referenceImage
      ? [referenceImage]
      : [];

  const legacyLabels: string[] = referenceLabels || [];

  // 统一的图片列表（从 entries 或旧字段）
  const images: string[] = useEntries
    ? referenceEntries.map(e => e.imageUrl)
    : legacyImages;
  const labels: string[] = useEntries
    ? referenceEntries.map(e => e.label)
    : legacyLabels;
  const hasImages = images.length > 0;

  const getEntrySourceImage = (entry: ReferenceImageEntry) => {
    const activeIndex = entry.activeVersionIndex ?? (entry.versions.length - 1);
    const activeVersion = entry.versions[activeIndex];
    if (activeVersion?.imageUrl?.startsWith("data:image")) {
      return activeVersion.imageUrl;
    }
    return entry.imageUrl;
  };

  const applyPersistedImageUrls = (persisted: Array<{ index: number; url: string }>) => {
    if (persisted.length === 0) return;

    const persistedMap = new Map(persisted.map((item) => [item.index, item.url]));

    if (onEntriesChange && referenceEntries) {
      const updated = referenceEntries.map((entry, index) => {
        const url = persistedMap.get(index);
        return url ? { ...entry, imageUrl: url } : entry;
      });
      onEntriesChange(updated);

      const allImages = updated.map((entry) => entry.imageUrl);
      if (onImagesChange) onImagesChange(allImages);
      if (onLabelsChange) onLabelsChange(updated.map((entry) => entry.label));
      if (allImages.length > 0) onImageChange(allImages[0]);
      return;
    }

    const updatedImages = legacyImages.map((img, index) => persistedMap.get(index) ?? img);
    if (onImagesChange) onImagesChange(updatedImages);
    if (onLabelsChange) onLabelsChange(legacyLabels);
    if (updatedImages.length > 0) onImageChange(updatedImages[0]);
  };

  /** 添加图片（支持多选） - 同时更新 entries 和旧字段 */
  const addImages = (newImages: string[], newLabels?: string[]) => {
    if (onEntriesChange) {
      const newEntries: ReferenceImageEntry[] = newImages.map((img, i) => ({
        imageUrl: img,
        label: newLabels?.[i] || "",
        source: "upload" as const,
        versions: [{ imageUrl: img, createdAt: Date.now() }],
        activeVersionIndex: 0,
        createdAt: Date.now(),
      }));
      const updated = [...(referenceEntries || []), ...newEntries];
      onEntriesChange(updated);
      // 同步旧字段
      const allImages = updated.map(e => e.imageUrl);
      if (onImagesChange) onImagesChange(allImages);
      if (onLabelsChange) onLabelsChange(updated.map(e => e.label));
      if (allImages.length > 0) onImageChange(allImages[0]);
    } else {
      const updatedImages = [...legacyImages, ...newImages];
      const updatedLabels = [...legacyLabels, ...(newLabels || newImages.map(() => ""))];
      if (onImagesChange) onImagesChange(updatedImages);
      if (onLabelsChange) onLabelsChange(updatedLabels);
      if (updatedImages.length > 0) {
        onImageChange(updatedImages[0]);
      }
    }
  };

  /** 移除指定索引的图片 */
  const removeImage = (index: number) => {
    if (onEntriesChange && referenceEntries) {
      const updated = referenceEntries.filter((_, i) => i !== index);
      onEntriesChange(updated);
      const allImages = updated.map(e => e.imageUrl);
      if (onImagesChange) onImagesChange(allImages);
      if (onLabelsChange) onLabelsChange(updated.map(e => e.label));
      onImageChange(allImages.length > 0 ? allImages[0] : undefined);
    } else {
      const updatedImages = legacyImages.filter((_, i) => i !== index);
      const updatedLabels = legacyLabels.filter((_, i) => i !== index);
      if (onImagesChange) onImagesChange(updatedImages);
      if (onLabelsChange) onLabelsChange(updatedLabels);
      onImageChange(updatedImages.length > 0 ? updatedImages[0] : undefined);
    }
    // 清理编辑状态
    if (editingIndex === index) setEditingIndex(null);
    if (img2imgIndex === index) setImg2imgIndex(null);
  };

  /** 清除所有图片 */
  const clearAll = () => {
    if (onEntriesChange) onEntriesChange([]);
    if (onImagesChange) onImagesChange([]);
    if (onLabelsChange) onLabelsChange([]);
    onImageChange(undefined);
    setEditingIndex(null);
    setImg2imgIndex(null);
  };

  const handleAIGenerate = async () => {
    const names = parseCharacterNames(characterInput);

    setAiGenerating(true);
    setAiError("");
    try {
      if (names.length > 0 && onAIGenerateCharacters) {
        await onAIGenerateCharacters(names);
      } else if (onAIGenerate) {
        await onAIGenerate();
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI 生成失败");
    } finally {
      setAiGenerating(false);
    }
  };

  /** 开始编辑参考图 prompt */
  const startEditing = (index: number) => {
    const entry = referenceEntries?.[index];
    setEditingIndex(index);
    setEditPrompt(entry?.prompt || "");
  };

  /** 保存 prompt 编辑 */
  const savePromptEdit = (index: number) => {
    if (!referenceEntries || !onEntriesChange) return;
    const updated = [...referenceEntries];
    updated[index] = { ...updated[index], prompt: editPrompt };
    onEntriesChange(updated);
    setEditingIndex(null);
  };

  /** 重新生成参考图 */
  const handleRegenerateRef = async (index: number) => {
    if (!onRegenerateRef) return;
    const entry = referenceEntries?.[index];
    const prompt = editingIndex === index ? editPrompt : (entry?.prompt || "");
    if (!prompt) {
      setAiError("无可用 prompt，请先编辑提示词");
      return;
    }

    // 如果在编辑模式，先保存
    if (editingIndex === index && referenceEntries && onEntriesChange) {
      const updated = [...referenceEntries];
      updated[index] = { ...updated[index], prompt: editPrompt };
      onEntriesChange(updated);
      setEditingIndex(null);
    }

    setRegeneratingIndex(index);
    setAiError("");
    try {
      await onRegenerateRef(index, prompt);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "重新生成失败");
    } finally {
      setRegeneratingIndex(null);
    }
  };

  /** 以图生图 */
  const handleImg2ImgGenerate = async () => {
    if (img2imgIndex === null || !onImg2Img || !referenceEntries) return;
    const entry = referenceEntries[img2imgIndex];
    if (!entry) return;

    setImg2imgGenerating(true);
    setAiError("");
    try {
      await onImg2Img(img2imgIndex, getEntrySourceImage(entry), img2imgPrompt, img2imgStrength);
      setImg2imgIndex(null);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "图生图失败");
    } finally {
      setImg2imgGenerating(false);
    }
  };

  /** 保存参考图到文件系统 */
  const saveToFileSystem = async (base64: string, index: number) => {
    if (!base64.startsWith("data:image")) return null;
    try {
      return await persistClientImage({
        base64Data: base64,
        type: "reference",
        refIndex: index,
        title,
        taskId: title || "reference",
      });
    } catch {
      // 非关键操作，静默失败
      return null;
    }
  };

  /** 从角色库导入参考图 */
  const importFromCharacter = (char: Character) => {
    const charImages = char.referenceEntries
      .filter((e) => e.imageUrl)
      .map((e) => e.imageUrl);
    const charLabels = char.referenceEntries
      .filter((e) => e.imageUrl)
      .map((e) => e.label || char.name);

    if (charImages.length === 0 && char.avatarUrl) {
      addImages([char.avatarUrl], [char.name]);
    } else if (charImages.length > 0) {
      addImages(charImages, charLabels);
    }
  };

  const canAIGenerate = !!(onAIGenerate || onAIGenerateCharacters);
  const currentGenMode = genMode || "controlnet";

  return (
    <>
      {lightboxSrc && (
        <Lightbox
          src={lightboxSrc}
          label={lightboxLabel}
          onClose={() => { setLightboxSrc(null); setLightboxLabel(undefined); }}
        />
      )}

      <details className="p-4 rounded-xl border bg-muted/30 no-print group">
        <summary className="flex items-center gap-2 text-sm font-medium cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <ChevronRight className={`w-3 h-3 text-muted-foreground transition-transform group-open:rotate-90`} />
          <Paperclip className="w-4 h-4 text-muted-foreground" />
          参考图（可选，支持多张）
          {hasImages && (
            <span className="text-xs text-muted-foreground font-normal">
              {images.length} 张
            </span>
          )}
          <span className="ml-auto text-[10px] text-muted-foreground font-normal">高级选项</span>
        </summary>

        <div className="mt-3 space-y-3">
        {/* API 能力提示 */}
        <div className="text-[10px] text-muted-foreground bg-muted/50 px-2 py-1.5 rounded">
          参考图通过 ControlNet/img2img 影响图片生成。如果您的图片 API 不支持 control_image 参数，参考图仅作为 prompt 描述辅助，不会直接影响生成结果。
        </div>

        {/* 角色名称输入 */}
        <RefAIGenerator
          characterInput={characterInput}
          onCharacterInputChange={setCharacterInput}
          canAIGenerate={canAIGenerate}
        />

        {/* 缩略图列表 */}
        {hasImages && (
          <div className="flex gap-2 flex-wrap">
            {images.map((img, index) => (
              <RefImageCard
                key={index}
                img={img}
                label={labels[index] || ""}
                index={index}
                entry={referenceEntries?.[index]}
                isEditing={editingIndex === index}
                isRegenerating={regeneratingIndex === index}
                canEdit={!!(referenceEntries?.[index] && onEntriesChange)}
                onClickImage={() => {
                  setLightboxSrc(img);
                  setLightboxLabel(labels[index] || undefined);
                }}
                onToggleEdit={() => {
                  if (editingIndex === index) {
                    setEditingIndex(null);
                  } else {
                    startEditing(index);
                  }
                }}
                onDelete={() => removeImage(index)}
                onRefVersionChange={onRefVersionChange ? (vi) => onRefVersionChange(index, vi) : undefined}
              />
            ))}
          </div>
        )}

        {/* Prompt 编辑区 */}
        {editingIndex !== null && referenceEntries?.[editingIndex] && (
          <RefEditor
            label={labels[editingIndex] || `参考图 ${editingIndex + 1}`}
            source={referenceEntries[editingIndex].source}
            editPrompt={editPrompt}
            onEditPromptChange={setEditPrompt}
            onSave={() => savePromptEdit(editingIndex)}
            onRegenerate={onRegenerateRef ? () => handleRegenerateRef(editingIndex) : undefined}
            regenerating={regeneratingIndex === editingIndex}
            onStartImg2Img={
              onImg2Img && getEntrySourceImage(referenceEntries[editingIndex]).startsWith("data:image")
                ? () => {
                    setImg2imgIndex(editingIndex);
                    setImg2imgPrompt(editPrompt);
                    setEditingIndex(null);
                  }
                : undefined
            }
            onCancel={() => setEditingIndex(null)}
          />
        )}

        {/* img2img 面板 */}
        {img2imgIndex !== null && referenceEntries?.[img2imgIndex] && onImg2Img && (
          <RefImg2Img
            label={labels[img2imgIndex] || `参考图 ${img2imgIndex + 1}`}
            sourceImageUrl={getEntrySourceImage(referenceEntries[img2imgIndex])}
            prompt={img2imgPrompt}
            onPromptChange={setImg2imgPrompt}
            strength={img2imgStrength}
            onStrengthChange={setImg2imgStrength}
            generating={img2imgGenerating}
            onGenerate={handleImg2ImgGenerate}
            onCancel={() => setImg2imgIndex(null)}
          />
        )}

        <div className="flex items-center gap-3 flex-wrap">
          {/* 上传按钮 */}
          <RefUploader hasImages={hasImages} onFilesSelected={(imgs) => addImages(imgs)} />

          {/* 从角色库选择 */}
          <button
            onClick={() => setShowCharacterPicker(!showCharacterPicker)}
            className={`px-3 py-1.5 text-xs border rounded-lg transition-colors min-h-[36px] flex items-center gap-1.5 ${
              showCharacterPicker
                ? "border-primary bg-primary/10 text-primary"
                : "border-info/20 text-info hover:bg-info/5"
            }`}
          >
            <Users className="w-3 h-3" />
            角色库
          </button>

          {/* AI 生成按钮 */}
          {canAIGenerate && (
            <RefAIGenerateButton
              characterInput={characterInput}
              aiGenerating={aiGenerating}
              onGenerate={handleAIGenerate}
            />
          )}

          {/* 保存到文件系统 */}
          {hasImages && (
            <button
              onClick={() => {
                void (async () => {
                  const persisted = await Promise.all(images.map(async (img, index) => {
                    const result = await saveToFileSystem(img, index);
                    return result?.url ? { index, url: result.url } : null;
                  }));
                  applyPersistedImageUrls(
                    persisted.filter((item): item is { index: number; url: string } => item !== null),
                  );
                })();
              }}
              className="px-3 py-1.5 text-xs border border-success/20 text-success rounded-lg hover:bg-success/5 transition-colors min-h-[36px] flex items-center gap-1.5"
            >
              <Save className="w-3 h-3" />
              保存
            </button>
          )}

          {/* 清除所有 */}
          {hasImages && (
            <button
              onClick={clearAll}
              className="px-3 py-1.5 text-xs border border-error/20 text-error rounded-lg hover:bg-error/5 transition-colors min-h-[36px]"
            >
              清除全部
            </button>
          )}

          {/* 生成模式 + control_mode 选择器 */}
          {hasImages && (
            <div className="flex items-center gap-3 ml-auto flex-wrap">
              {/* 生成模式选择 — user-friendly labels with tooltips */}
              {onGenModeChange && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Reference mode:</span>
                  <select
                    value={currentGenMode}
                    onChange={(e) => onGenModeChange(e.target.value as ReferenceGenMode)}
                    className="text-xs border rounded px-2 py-1 bg-background min-h-[36px]"
                    title="ControlNet: keep structure/pose from reference image. img2img: use reference as starting point with creative variation."
                  >
                    <option value="controlnet">Structure guide (ControlNet)</option>
                    <option value="img2img">Creative variation (img2img)</option>
                  </select>
                </div>
              )}

              {/* ControlNet 模式下显示控制模式选择 */}
              {currentGenMode === "controlnet" && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Detection:</span>
                  <select
                    value={controlMode ?? "HED"}
                    onChange={(e) => onControlModeChange(e.target.value as "HED" | "Canny" | "Depth")}
                    className="text-xs border rounded px-2 py-1 bg-background min-h-[36px]"
                    title="HED: soft edge detection (best for general use). Canny: precise line detection (best for architecture/mechanical). Depth: 3D depth estimation (best for spatial composition)."
                  >
                    <option value="HED">Soft edges (HED) - recommended</option>
                    <option value="Canny">Precise lines (Canny)</option>
                    <option value="Depth">Depth map (Depth)</option>
                  </select>
                </div>
              )}

              {/* Mode description hint */}
              <span className="text-[10px] text-muted-foreground/60 max-w-[200px] leading-tight hidden sm:inline">
                {currentGenMode === "controlnet"
                  ? "Preserves composition & pose from reference"
                  : "Uses reference as starting canvas, allows more creative freedom"}
              </span>
            </div>
          )}
        </div>

        {/* 角色库选择面板 */}
        <RefCharacterPicker
          show={showCharacterPicker}
          onClose={() => setShowCharacterPicker(false)}
          onImport={importFromCharacter}
        />

        {/* AI 生成错误提示 */}
        {aiError && (
          <p className="text-xs text-error">{aiError}</p>
        )}
        </div>
      </details>
    </>
  );
}
