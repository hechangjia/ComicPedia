"use client";

import { memo } from "react";

interface VersionSwitcherProps {
  versions: number;
  activeIndex: number;
  onChange: (newIndex: number) => void;
}

/** 版本切换器组件 —— 左下角半透明药丸形 */
export const VersionSwitcher = memo(function VersionSwitcher({
  versions,
  activeIndex,
  onChange,
}: VersionSwitcherProps) {
  if (versions <= 1) return null;

  return (
    <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/60 text-white text-xs rounded-full px-2 py-1 select-none no-print">
      <button
        onClick={(e) => { e.stopPropagation(); onChange(activeIndex - 1); }}
        disabled={activeIndex <= 0}
        className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
        className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="下一个版本"
      >
        ▶
      </button>
    </div>
  );
});
