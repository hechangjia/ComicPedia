"use client";

import { useState, useEffect, memo } from "react";
import { ComicPanel, GenerateTask } from "@/lib/types";
import { SinglePanelDownload } from "@/components/DownloadMenu";
import { VersionSwitcher } from "@/components/VersionSwitcher";

interface EditablePanelProps {
  panel: ComicPanel;
  index: number;
  taskId: string;
  taskStatus: GenerateTask["status"];
  onUpdate: (index: number, updatedPanel: ComicPanel) => void;
  onRegenerate: (index: number) => void;
  onCancel: (index: number) => void;
  onVersionChange: (index: number, versionIndex: number) => void;
}

/** Shallow compare panel data fields to avoid re-renders from parent clone */
function arePropsEqual(prev: EditablePanelProps, next: EditablePanelProps): boolean {
  if (prev.index !== next.index) return false;
  if (prev.taskId !== next.taskId) return false;
  if (prev.taskStatus !== next.taskStatus) return false;
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
    pp.imageVersions?.length === np.imageVersions?.length
  );
}

/** Editable panel component */
export const EditablePanel = memo(function EditablePanel({
  panel,
  index,
  taskId,
  taskStatus,
  onUpdate,
  onRegenerate,
  onCancel,
  onVersionChange,
}: EditablePanelProps) {
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    scene: panel.scene,
    dialogue: panel.dialogue,
    imagePrompt: panel.imagePrompt,
  });

  useEffect(() => {
    if (!editing) {
      setEditForm({
        scene: panel.scene,
        dialogue: panel.dialogue,
        imagePrompt: panel.imagePrompt,
      });
    }
  }, [panel.scene, panel.dialogue, panel.imagePrompt, editing]);

  const handleSave = () => {
    onUpdate(index, {
      ...panel,
      scene: editForm.scene,
      dialogue: editForm.dialogue,
      imagePrompt: editForm.imagePrompt,
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="absolute inset-0 animate-shimmer" />
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full z-10" />
            <p className="text-xs text-muted-foreground z-10">生成中...</p>
            <button
              onClick={() => onCancel(index)}
              className="px-3 py-1.5 text-xs bg-red-100 dark:bg-red-900/30 text-red-600 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors z-10"
            >
              取消
            </button>
          </div>
        ) : panel.status === "failed" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <p className="text-red-500 text-sm">生成失败</p>
            <button
              onClick={() => onRegenerate(index)}
              className="px-3 py-1.5 text-xs bg-red-100 dark:bg-red-900/30 text-red-600 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50"
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
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
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
        <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/50 text-white text-xs flex items-center justify-center print-panel-number">
          {index + 1}
        </div>

        {canEdit && !editing && !isRegenerating && (
          <button
            onClick={() => setEditing(true)}
            className="absolute top-2 right-2 w-10 h-10 sm:w-8 sm:h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 no-print"
            title="编辑"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
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
        <div className="p-3 space-y-3 no-print">
          <div>
            <label className="text-xs text-muted-foreground">对话/旁白</label>
            <input
              type="text"
              value={editForm.dialogue}
              onChange={(e) => setEditForm({ ...editForm, dialogue: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded min-h-[44px]"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">场景描述</label>
            <input
              type="text"
              value={editForm.scene}
              onChange={(e) => setEditForm({ ...editForm, scene: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded min-h-[44px]"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">图片提示词 (英文)</label>
            <textarea
              value={editForm.imagePrompt}
              onChange={(e) => setEditForm({ ...editForm, imagePrompt: e.target.value })}
              className="w-full px-3 py-2 text-sm border rounded h-20 resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="flex-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded min-h-[44px]"
            >
              保存
            </button>
            <button
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="flex-1 px-3 py-2 text-sm bg-purple-600 text-white rounded disabled:opacity-50 min-h-[44px]"
            >
              {isRegenerating ? "生成中..." : hasImage ? "重新生成" : "生成图片"}
            </button>
            <button
              onClick={() => {
                setEditForm({ scene: panel.scene, dialogue: panel.dialogue, imagePrompt: panel.imagePrompt });
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
