"use client";

import { useState, memo } from "react";
import { ComicStyle, ContentType, BuiltinContentType } from "@/lib/types";
import {
  STYLE_META,
  STYLE_ORDER,
  STYLE_GROUP_LABELS,
  CONTENT_STYLE_RECOMMENDATIONS,
  StyleGroup,
} from "@/lib/config/styles";

interface StyleSelectorProps {
  value: ComicStyle;
  onChange: (style: ComicStyle) => void;
  disabled?: boolean;
  contentType?: ContentType;
  recommendFor?: string;
}

function getRecommendedStyles(
  contentType?: ContentType,
  recommendFor?: string,
): ComicStyle[] {
  if (contentType) {
    return CONTENT_STYLE_RECOMMENDATIONS[contentType as BuiltinContentType] ?? [];
  }
  if (recommendFor) {
    const legacyMap: Record<string, ComicStyle[]> = {
      shi: ["inkwash", "watercolor", "sketch"],
      ci: ["watercolor", "anime", "inkwash"],
      qu: ["chibi", "inkwash"],
      modern: ["anime", "watercolor", "sketch", "realistic"],
      novel: ["manga", "realistic", "inkwash"],
    };
    return legacyMap[recommendFor] ?? [];
  }
  return [];
}

const GROUP_ORDER: StyleGroup[] = ["cartoon", "realistic", "traditional", "special"];

export const StyleSelector = memo(function StyleSelector({
  value,
  onChange,
  disabled,
  contentType,
  recommendFor,
}: StyleSelectorProps) {
  const recommended = getRecommendedStyles(contentType, recommendFor);
  const [activeGroup, setActiveGroup] = useState<StyleGroup | "recommended">(
    recommended.length > 0 ? "recommended" : "cartoon"
  );

  // 按分组聚合
  const groups = new Map<StyleGroup, ComicStyle[]>();
  for (const style of STYLE_ORDER) {
    const group = STYLE_META[style].group;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(style);
  }

  // 当前展示的风格列表
  const displayStyles: ComicStyle[] =
    activeGroup === "recommended"
      ? recommended
      : groups.get(activeGroup) ?? [];

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium">画面风格</label>

      {/* 分组标签页 */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
        {recommended.length > 0 && (
          <button
            onClick={() => setActiveGroup("recommended")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              activeGroup === "recommended"
                ? "bg-success/10 text-success ring-1 ring-success/30"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            ✨ 推荐
          </button>
        )}
        {GROUP_ORDER.map((group) => (
          <button
            key={group}
            onClick={() => setActiveGroup(group)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              activeGroup === group
                ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {STYLE_GROUP_LABELS[group]}
          </button>
        ))}
      </div>

      {/* 风格卡片网格 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {displayStyles.map((s) => {
          const meta = STYLE_META[s];
          const isRecommended = recommended.includes(s);
          const isSelected = value === s;
          return (
            <button
              key={s}
              onClick={() => onChange(s)}
              disabled={disabled}
              className={`p-3 rounded-lg border text-left transition-all duration-200 ${
                isSelected
                  ? "border-primary bg-primary/10 ring-2 ring-primary shadow-sm"
                  : "hover:border-primary/50 hover:bg-muted/30 hover:shadow-sm"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-lg">{meta.icon}</span>
                <span className="font-medium text-sm">{meta.label}</span>
                {isRecommended && activeGroup !== "recommended" && (
                  <span className="text-[10px] text-success bg-success/5 px-1 py-0.5 rounded">
                    荐
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{meta.desc}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
});
