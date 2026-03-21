"use client";

import { memo } from "react";
import { ComicStyle } from "@/lib/types";
import { STYLE_META, STYLE_ORDER } from "@/lib/config/styles";

interface StyleSwitcherProps {
  currentStyle: ComicStyle;
  generatingAll: boolean;
  onChangeStyle: (style: ComicStyle) => void;
}

export const StyleSwitcher = memo(function StyleSwitcher({ currentStyle, generatingAll, onChangeStyle }: StyleSwitcherProps) {
  return (
    <div className="no-print">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-muted-foreground">画面风格：</span>
        <span className="text-xs text-foreground font-semibold">{STYLE_META[currentStyle]?.label || currentStyle}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {STYLE_ORDER.map((s) => {
          const meta = STYLE_META[s];
          const isActive = s === currentStyle;
          return (
            <button
              key={s}
              onClick={() => !isActive && !generatingAll && onChangeStyle(s)}
              disabled={generatingAll}
              title={meta.description}
              className={`px-2.5 py-1 text-xs rounded-full border transition-all ${
                isActive
                  ? "bg-primary text-primary-foreground border-primary font-medium"
                  : "hover:bg-accent hover:border-primary/30 text-muted-foreground disabled:opacity-40"
              }`}
            >
              {meta.label}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground mt-1.5">
        点击切换风格，将保留脚本内容并用新风格重新生成所有图片。旧图片保留在版本历史中可随时对比。
      </p>
    </div>
  );
});
