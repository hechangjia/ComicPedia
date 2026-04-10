"use client";

import { useState, useEffect, memo } from "react";
import { ComicPanel, ComicStyle, GenerateTask } from "@/lib/types";
import { SinglePanelDownload } from "@/components/DownloadMenu";
import { VersionSwitcher } from "@/components/VersionSwitcher";
import { PanelStyleSelector } from "@/components/PanelStyleSelector";
import { AIEditAssistant } from "@/components/AIEditAssistant";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { Image as ImageIcon, Pencil, Redo2, Undo2 } from "lucide-react";


interface EditablePanelProps {
  panel: ComicPanel;
  index: number;
  taskId: string;
  taskStatus: GenerateTask["status"];
  defaultEditing?: boolean;
  /** 全局风格（风格混搭用） */
  globalStyle?: ComicStyle;
  /** 完整脚本（AI 编辑助手需要上下文） */
  script?: import("@/lib/types").ComicScript;
  /** LLM 配置（AI 编辑助手需要） */
  llmConfig?: import("@/lib/types").PartialLLMConfig;
  onUpdate: (index: number, updatedPanel: ComicPanel) => void;
  onRegenerate: (index: number, seedOverride?: number) => void;
  onCancel: (index: number) => void;
  onVersionChange: (index: number, versionIndex: number) => void;
}

/** Shallow compare panel data fields to avoid re-renders from parent clone */
function arePropsEqual(prev: EditablePanelProps, next: EditablePanelProps): boolean {
  if (prev.index !== next.index) return false;
  if (prev.taskId !== next.taskId) return false;
  if (prev.taskStatus !== next.taskStatus) return false;
  if (prev.defaultEditing !== next.defaultEditing) return false;
  // Compare panel fields that actually affect rendering
  const pp = prev.panel;
  const np = next.panel;
  return (
    pp.id === np.id &&
    pp.status === np.status &&
    pp.imageUrl === np.imageUrl &&
    pp.scene === np.scene &&
    pp.dialogue === np.dialogue &&
    pp.imagePrompt === np.imagePrompt &&
    pp.activeVersionIndex === np.activeVersionIndex &&
    pp.imageVersions?.length === np.imageVersions?.length &&
    pp.styleOverride === np.styleOverride
  );
}

/** Editable panel component */
export const EditablePanel = memo(function EditablePanel({
  panel,
  index,
  taskId,
  taskStatus,
  defaultEditing = false,
  globalStyle,
  script,
  llmConfig,
  onUpdate,
  onRegenerate,
  onCancel,
  onVersionChange,
}: EditablePanelProps) {
  const [editing, setEditing] = useState(defaultEditing);

  // Undo/Redo 支持的编辑状态
  const {
    state: editForm,
    pushState: pushEditForm,
    undo,
    redo,
    canUndo,
    canRedo,
    reset: resetEditForm,
    handleKeyDown: handleUndoRedoKeyDown,
  } = useUndoRedo({
    scene: panel.scene,
    dialogue: panel.dialogue,
    imagePrompt: panel.imagePrompt,
    styleOverride: panel.styleOverride,
  });

  /** 更新编辑表单字段（自动推入 undo 栈） */
  const setEditField = (field: string, value: string | ComicStyle | undefined) => {
    pushEditForm({ ...editForm, [field]: value });
  };

  useEffect(() => {
    if (!editing) {
      resetEditForm({
        scene: panel.scene,
        dialogue: panel.dialogue,
        imagePrompt: panel.imagePrompt,
        styleOverride: panel.styleOverride,
      });
    }
  }, [panel.scene, panel.dialogue, panel.imagePrompt, panel.styleOverride, editing, resetEditForm]);

  const handleSave = () => {
    onUpdate(index, {
      ...panel,
      scene: editForm.scene,
      dialogue: editForm.dialogue,
      imagePrompt: editForm.imagePrompt,
      styleOverride: editForm.styleOverride,
    });
    setEditing(false);
  };

  const handleRegenerate = () => {
    if (editing) {
      onUpdate(index, {
        ...panel,
        scene: editForm.scene,
        dialogue: editForm.dialogue,
        imagePrompt: editForm.imagePrompt,
        styleOverride: editForm.styleOverride,
      });
      setEditing(false);
    }
    onRegenerate(index);
  };

  const isScriptReady = taskStatus === "script_ready";
  const isCompleted = taskStatus === "completed";
  const canEdit = isScriptReady || isCompleted;
  const isRegenerating = panel.status === "generating";
  const hasImage = panel.status === "completed" && panel.imageUrl && !panel.imageUrl.startsWith("data:text/plain");

  return (
    <div className="rounded-xl border overflow-hidden bg-card print-panel">
      {/* 图片区域 */}
      <div className="aspect-square bg-muted relative print-panel-image">
        {panel.status === "completed" && panel.imageUrl ? (
          panel.imageUrl.startsWith("data:text/plain") ? (
            <div className="absolute inset-0 p-4 flex items-center justify-center">
              <div className="text-center space-y-2">
                <p className="text-xs text-muted-foreground">图片 Prompt:</p>
                <p className="text-sm font-mono bg-muted p-2 rounded">
                  {decodeURIComponent(escape(atob(panel.imageUrl.split(",")[1])))}
                </p>
              </div>
            </div>
          ) : (
            <img
              src={panel.imageUrl}
              alt={panel.scene}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
          )
        ) : isRegenerating ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" role="status" aria-label="图片生成中">
            <div className="absolute inset-0 animate-shimmer" />
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full z-10" aria-hidden="true" />
            <p className="text-xs text-muted-foreground z-10">生成中...</p>
            <button
              onClick={() => onCancel(index)}
              className="px-3 py-1.5 text-xs bg-error/10 text-error rounded-lg transition-colors z-10"
              aria-label={`取消第 ${index + 1} 格图片生成`}
            >
              取消
            </button>
          </div>
        ) : panel.status === "failed" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <p className="text-error text-sm">生成失败</p>
            <button
              onClick={() => onRegenerate(index)}
              className="px-3 py-1.5 text-xs bg-error/10 text-error rounded-lg"
              aria-label={`重试第 ${index + 1} 格图片生成`}
            >
              重试
            </button>
          </div>
        ) : panel.status === "pending" ? (
          <div className="absolute inset-0 p-3 flex flex-col items-center justify-center gap-3">
            <div className="w-full max-h-[60%] overflow-y-auto">
              <p className="text-[11px] leading-relaxed text-muted-foreground font-mono break-all">
                {panel.imagePrompt.length > 200
                  ? panel.imagePrompt.slice(0, 200) + "..."
                  : panel.imagePrompt}
              </p>
            </div>
            {isScriptReady && (
              <button
                onClick={() => onRegenerate(index)}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1.5 min-h-[40px]"
              >
                <ImageIcon className="w-4 h-4" />
                生成图片
              </button>
            )}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            等待生成...
          </div>
        )}

        {/* 面板编号 */}
        <div className="absolute top-2 left-2 flex items-center gap-1">
          <div className="w-6 h-6 rounded-full bg-black/50 text-white text-xs flex items-center justify-center print-panel-number">
            {index + 1}
          </div>
          {panel.styleOverride && globalStyle && panel.styleOverride !== globalStyle && (
            <span className="text-[10px] bg-black/50 text-white px-2 py-0.5 rounded-full">
              {panel.styleOverride}
            </span>
          )}
        </div>

        {canEdit && !editing && !isRegenerating && (
          <button
            onClick={() => setEditing(true)}
            className="absolute top-2 right-2 w-10 h-10 sm:w-8 sm:h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 no-print"
            title="编辑"
            aria-label={`编辑第 ${index + 1} 格`}
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}

        {hasImage && !editing && (
          <SinglePanelDownload panel={panel} index={index} />
        )}

        {hasImage && !editing && !isRegenerating && panel.imageVersions && panel.imageVersions.length > 1 && (
          <VersionSwitcher
            versions={panel.imageVersions.length}
            activeIndex={panel.activeVersionIndex ?? panel.imageVersions.length - 1}
            onChange={(versionIndex) => onVersionChange(index, versionIndex)}
          />
        )}
      </div>

      {/* 文字区域 / 编辑表单 */}
      {editing ? (
        <div className="p-3 space-y-3 no-print" onKeyDown={handleUndoRedoKeyDown}>
          <div>
            <label className="text-xs text-muted-foreground">对话/旁白</label>
            <input
              type="text"
              value={editForm.dialogue}
              onChange={(e) => setEditField("dialogue", e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded min-h-[44px]"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">场景描述</label>
            <input
              type="text"
              value={editForm.scene}
              onChange={(e) => setEditField("scene", e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded min-h-[44px]"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">图片提示词 (英文)</label>
            <textarea
              value={editForm.imagePrompt}
              onChange={(e) => setEditField("imagePrompt", e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded h-20 resize-none"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              提示：添加 <code className="bg-muted px-1 rounded">solo, single character</code> 限制只出现一个角色；
              添加 <code className="bg-muted px-1 rounded">close-up</code> / <code className="bg-muted px-1 rounded">wide shot</code> 控制构图
            </p>
          </div>
          {/* 风格混搭 (P3) */}
          {globalStyle && (
            <PanelStyleSelector
              globalStyle={globalStyle}
              overrideStyle={editForm.styleOverride}
              onOverride={(s) => setEditField("styleOverride", s)}
            />
          )}
          {/* AI 编辑助手 (P1-B) */}
          {script && (
            <AIEditAssistant
              panel={panel}
              script={script}
              panelIndex={index}
              llmConfig={llmConfig}
              onApply={(field, value) => setEditField(field, value)}
            />
          )}
          <div className="flex gap-2">
            {/* Undo/Redo */}
            <button
              onClick={undo}
              disabled={!canUndo}
              className="px-2 py-2 text-sm border rounded min-h-[44px] disabled:opacity-30"
              title="撤销 (Ctrl+Z)"
              aria-label="撤销"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className="px-2 py-2 text-sm border rounded min-h-[44px] disabled:opacity-30"
              title="重做 (Ctrl+Shift+Z)"
              aria-label="重做"
            >
              <Redo2 className="w-4 h-4" />
            </button>

            <button
              onClick={handleSave}
              className="flex-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded min-h-[44px]"
            >
              保存
            </button>
            <button
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="flex-1 px-3 py-2 text-sm bg-[#3d8b84] text-white rounded disabled:opacity-50 min-h-[44px]"
            >
              {isRegenerating ? "生成中..." : hasImage ? "重新生成" : "生成图片"}
            </button>
            {hasImage && (
              <button
                onClick={() => {
                  if (editing) {
                    onUpdate(index, { ...panel, scene: editForm.scene, dialogue: editForm.dialogue, imagePrompt: editForm.imagePrompt, styleOverride: editForm.styleOverride });
                    setEditing(false);
                  }
                  onRegenerate(index, Math.floor(Math.random() * 1000000));
                }}
                disabled={isRegenerating}
                title="保持提示词不变，换随机种子生成不同构图"
                className="px-3 py-2 text-sm border border-[#3d8b84]/30 text-[#3d8b84] dark:text-[#5cb8ae] rounded disabled:opacity-50 min-h-[44px] hover:bg-[#e8f4f2] dark:hover:bg-[#3d8b84]/10"
              >
                🎲
              </button>
            )}
            <button
              onClick={() => {
                resetEditForm({ scene: panel.scene, dialogue: panel.dialogue, imagePrompt: panel.imagePrompt, styleOverride: panel.styleOverride });
                setEditing(false);
              }}
              className="px-3 py-2 text-sm border rounded min-h-[44px]"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3 space-y-1 print-panel-text">
          <p className="text-sm font-medium dialogue">{panel.dialogue}</p>
          <p className="text-xs text-muted-foreground scene">{panel.scene}</p>
        </div>
      )}
    </div>
  );
}, arePropsEqual);
