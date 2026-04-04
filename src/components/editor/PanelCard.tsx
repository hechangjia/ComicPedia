"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { ComicPanel, ComicStyle } from "@/lib/types";
import { MoreVertical, X } from "lucide-react";



interface PanelCardProps {
  panel: ComicPanel;
  index: number;
  total: number;
  onUpdate: (index: number, updates: Partial<ComicPanel>) => void;
  onDelete: (index: number) => void;
  onDuplicate: (index: number) => void;
  onReset: (index: number) => void;
  globalStyle: ComicStyle;
  /** drag handlers */
  onDragStart?: (index: number) => void;
  onDragOver?: (e: React.DragEvent, index: number) => void;
  onDrop?: (index: number) => void;
}

const STYLE_OPTIONS: ComicStyle[] = [
  "flat", "anime", "cartoon", "chibi", "manga", "realistic",
  "watercolor", "sketch", "inkwash", "pixel", "infographic", "banana",
];

function AutoTextarea({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [value]);

  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="w-full px-3 py-2 text-sm border rounded-lg bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 overflow-hidden"
      />
    </label>
  );
}

export function PanelCard({
  panel,
  index,
  total,
  onUpdate,
  onDelete,
  onDuplicate,
  onReset,
  globalStyle,
  onDragStart,
  onDragOver,
  onDrop,
}: PanelCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleField = useCallback(
    (field: keyof ComicPanel, value: string) => {
      onUpdate(index, { [field]: value });
    },
    [index, onUpdate],
  );

  return (
    <div
      draggable
      onDragStart={() => onDragStart?.(index)}
      onDragOver={(e) => { e.preventDefault(); onDragOver?.(e, index); }}
      onDrop={() => onDrop?.(index)}
      className="p-4 rounded-xl border bg-card shadow-sm space-y-3 transition-shadow hover:shadow-md"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground cursor-grab">
          面板 {index + 1} / {total}
        </span>
        <div className="flex items-center gap-1">
          {/* Action menu */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
              aria-label="更多操作"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-8 z-20 w-36 py-1 rounded-lg border bg-popover shadow-lg text-sm">
                  <button
                    onClick={() => { onDuplicate(index); setMenuOpen(false); }}
                    className="w-full px-3 py-1.5 text-left hover:bg-muted transition-colors"
                  >
                    复制面板
                  </button>
                  <button
                    onClick={() => { onReset(index); setMenuOpen(false); }}
                    className="w-full px-3 py-1.5 text-left hover:bg-muted transition-colors"
                  >
                    重置为原始
                  </button>
                </div>
              </>
            )}
          </div>
          {/* Delete */}
          {confirmDelete ? (
            <div className="flex items-center gap-1 text-xs">
              <button
                onClick={() => { onDelete(index); setConfirmDelete(false); }}
                className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
              >
                确认
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-1 rounded border hover:bg-muted"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-muted-foreground hover:text-red-600"
              aria-label="删除面板"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Fields */}
      <AutoTextarea label="场景" value={panel.scene} onChange={(v) => handleField("scene", v)} placeholder="描述场景..." />
      <AutoTextarea label="对话" value={panel.dialogue} onChange={(v) => handleField("dialogue", v)} placeholder="对话/旁白..." />
      <AutoTextarea label="图片提示词" value={panel.imagePrompt} onChange={(v) => handleField("imagePrompt", v)} placeholder="Image prompt..." />

      {/* Characters (read-only) */}
      {panel.appearingCharacters && panel.appearingCharacters.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">角色</span>
          <div className="flex flex-wrap gap-1">
            {panel.appearingCharacters.map((c) => (
              <span key={c} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Style override */}
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">风格覆盖</span>
        <select
          value={panel.styleOverride ?? ""}
          onChange={(e) =>
            onUpdate(index, {
              styleOverride: e.target.value ? (e.target.value as ComicStyle) : undefined,
            })
          }
          className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="">使用全局风格 ({globalStyle})</option>
          {STYLE_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
