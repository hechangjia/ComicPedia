"use client";

import { useEffect } from "react";

/** 图片灯箱组件 — 全屏预览 */
export function Lightbox({
  src,
  label,
  onClose,
}: {
  src: string;
  label?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <div className="flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <img
          src={src}
          alt={label || "参考图预览"}
          className="max-w-full max-h-[85vh] object-contain rounded-lg"
        />
        {label && (
          <span className="text-white text-sm bg-black/50 px-3 py-1 rounded-full">{label}</span>
        )}
      </div>
    </div>
  );
}

/** 迷你版本切换器 */
export function RefVersionSwitcher({
  versions,
  activeIndex,
  onChange,
}: {
  versions: number;
  activeIndex: number;
  onChange: (newIndex: number) => void;
}) {
  if (versions <= 1) return null;

  return (
    <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
      <button
        onClick={(e) => { e.stopPropagation(); onChange(activeIndex - 1); }}
        disabled={activeIndex <= 0}
        className="w-4 h-4 flex items-center justify-center rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
        title="上一个版本"
      >
        ◀
      </button>
      <span className="min-w-[3ch] text-center tabular-nums">
        v{activeIndex + 1}/{versions}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onChange(activeIndex + 1); }}
        disabled={activeIndex >= versions - 1}
        className="w-4 h-4 flex items-center justify-center rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
        title="下一个版本"
      >
        ▶
      </button>
    </div>
  );
}
