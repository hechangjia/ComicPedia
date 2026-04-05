"use client";

import { useMemo, useState } from "react";
import { TOPIC_PRESETS, getCategories } from "@/lib/config/topicPresets";
import type { BuiltinContentType } from "@/lib/types";

interface InspirationSquareProps {
  contentType: BuiltinContentType;
  onSelect: (topic: string) => void;
}

const MAX_VISIBLE = 20;

export function InspirationSquare({ contentType, onSelect }: InspirationSquareProps) {
  const [viewState, setViewState] = useState(() => ({
    contentType,
    activeCategory: null as string | null,
    expanded: false,
  }));

  const categories = useMemo(() => getCategories(contentType), [contentType]);
  const presets = useMemo(() => TOPIC_PRESETS[contentType] ?? [], [contentType]);
  const activeCategory = viewState.contentType === contentType ? viewState.activeCategory : null;
  const expanded = viewState.contentType === contentType ? viewState.expanded : false;

  const filtered = useMemo(() => {
    if (!activeCategory) return presets;
    return presets.filter((p) => p.category.split("/")[0] === activeCategory);
  }, [presets, activeCategory]);

  const visible = expanded ? filtered : filtered.slice(0, MAX_VISIBLE);
  const hasMore = filtered.length > MAX_VISIBLE;

  if (presets.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">灵感广场</span>
        <div className="h-px flex-1 bg-border/50" />
      </div>

      {/* Category filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => {
            setViewState({
              contentType,
              activeCategory: null,
              expanded: false,
            });
          }}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
            activeCategory === null
              ? "bg-foreground text-background"
              : "bg-muted/60 text-muted-foreground hover:bg-muted"
          }`}
        >
          全部
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => {
              setViewState({
                contentType,
                activeCategory: cat === activeCategory ? null : cat,
                expanded: false,
              });
            }}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              activeCategory === cat
                ? "bg-foreground text-background"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Topic chips */}
      <div className="flex flex-wrap gap-1.5">
        {visible.map((preset) => (
          <button
            key={`${preset.category}-${preset.label}`}
            onClick={() => onSelect(preset.topic)}
            title={preset.topic}
            className="px-2.5 py-1 rounded-full text-xs border border-border/60 bg-background hover:bg-muted hover:border-border transition-colors text-foreground/80 hover:text-foreground"
          >
            {preset.label}
          </button>
        ))}
        {hasMore && !expanded && (
          <button
            onClick={() => {
              setViewState({
                contentType,
                activeCategory,
                expanded: true,
              });
            }}
            className="px-2.5 py-1 rounded-full text-xs border border-dashed border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
          >
            +{filtered.length - MAX_VISIBLE} 更多
          </button>
        )}
      </div>
    </div>
  );
}
