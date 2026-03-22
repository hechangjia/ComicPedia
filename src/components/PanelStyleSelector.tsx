"use client";

import { ComicStyle } from "@/lib/types";
import { STYLE_META } from "@/lib/config/styles";

const ALL_STYLES = Object.keys(STYLE_META) as ComicStyle[];

interface PanelStyleSelectorProps {
  globalStyle: ComicStyle;
  overrideStyle: ComicStyle | undefined;
  onOverride: (style: ComicStyle | undefined) => void;
  disabled?: boolean;
}

export function PanelStyleSelector({ globalStyle, overrideStyle, onOverride, disabled }: PanelStyleSelectorProps) {
  const hasOverride = overrideStyle !== undefined;
  const globalMeta = STYLE_META[globalStyle];

  return (
    <div className="space-y-2">
      <label className="text-xs text-muted-foreground">面板风格</label>
      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={() => onOverride(undefined)}
          disabled={disabled}
          className={`px-3 py-1 text-xs rounded-full border transition-colors ${
            !hasOverride
              ? "bg-primary/10 text-primary border-primary/30"
              : "border-border text-muted-foreground hover:border-primary/30"
          }`}
        >
          继承全局: {globalMeta?.icon} {globalMeta?.label}
        </button>
        <button
          type="button"
          onClick={() => !hasOverride && onOverride(globalStyle)}
          disabled={disabled}
          className={`px-3 py-1 text-xs rounded-full border transition-colors ${
            hasOverride
              ? "bg-primary/10 text-primary border-primary/30"
              : "border-border text-muted-foreground hover:border-primary/30"
          }`}
        >
          自定义风格
        </button>
      </div>
      {hasOverride && (
        <div className="flex flex-wrap gap-1.5">
          {ALL_STYLES.map((style) => {
            const meta = STYLE_META[style];
            const isSelected = overrideStyle === style;
            return (
              <button
                key={style}
                type="button"
                onClick={() => onOverride(style)}
                disabled={disabled}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:border-primary/50"
                }`}
              >
                {meta.icon} {meta.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
