"use client";

import { useState } from "react";
import type { Character, ComicStyle } from "@/lib/types";
import { STYLE_DESCRIPTIONS } from "@/lib/config/styles";
import { formatDate } from "@/lib/utils";
import { Check, ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";


const STYLE_NAMES: Record<ComicStyle, string> = Object.fromEntries(
  (Object.keys(STYLE_DESCRIPTIONS) as ComicStyle[]).map((key) => [
    key,
    STYLE_DESCRIPTIONS[key].split("\uFF0C")[0].replace(/\u98CE\u683C$/, ""),
  ])
) as Record<ComicStyle, string>;

const CHARACTER_REVIEW_LABELS = {
  unreviewed: "未评审",
  reviewed: "已通过",
  needs_repair: "待修复",
} as const;

const CHARACTER_REVIEW_BADGES = {
  unreviewed: "bg-slate-100/90 text-slate-700",
  reviewed: "bg-success/10 text-success",
  needs_repair: "bg-warning/10 text-warning",
} as const;

export function CharacterCard({
  char,
  onEdit,
  onDelete,
  exportMode,
  isSelected,
  onToggleSelect,
}: {
  char: Character;
  onEdit: () => void;
  onDelete: () => void;
  exportMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [imgIndex, setImgIndex] = useState(0);

  const allItems: { url: string; style?: ComicStyle }[] = [];
  if (char.avatarUrl) {
    const matchingEntry = char.referenceEntries.find((e) => e.imageUrl === char.avatarUrl);
    allItems.push({ url: char.avatarUrl, style: matchingEntry?.style });
  }
  for (const entry of char.referenceEntries) {
    if (entry.imageUrl && !allItems.some((item) => item.url === entry.imageUrl)) {
      allItems.push({ url: entry.imageUrl, style: entry.style });
    }
  }

  const hasMultiple = allItems.length > 1;
  const safeIndex = Math.min(imgIndex, Math.max(allItems.length - 1, 0));
  const currentItem = allItems[safeIndex] ?? null;
  const displayStyle = currentItem?.style || char.style;
  const reviewStatus = char.reviewStatus ?? "unreviewed";
  const reviewLabel = CHARACTER_REVIEW_LABELS[reviewStatus];
  const reviewBadgeClass = CHARACTER_REVIEW_BADGES[reviewStatus];
  const reviewScore = char.visualScore ? `${Math.round(char.visualScore.overall * 10) / 10}/10` : null;
  const reviewTime = char.lastReviewAt ? formatDate(char.lastReviewAt) : null;
  const cardDescription = char.description || `视觉评审：${reviewLabel}${reviewScore ? ` · ${reviewScore}` : ""}`;
  const metaLine = reviewTime ? `评审于 ${reviewTime}` : formatDate(char.updatedAt);
  const referenceBadgeText = `${char.referenceEntries.length} 张参考图${reviewScore ? ` · ${reviewScore}` : ""}`;
  const topOffsetClass = char.reviewStatus ? "top-10" : "top-2";
  const bottomOffsetClass = char.reviewStatus ? "bottom-7" : "bottom-2";
  const showReviewBadge = !!char.reviewStatus;
  const reviewSummaryText = reviewTime ? `最近评审：${reviewTime}` : null;


  const goPrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setImgIndex((i) => (i - 1 + allItems.length) % allItems.length);
  };
  const goNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setImgIndex((i) => (i + 1) % allItems.length);
  };

  return (
    <div
      className={`rounded-xl border overflow-hidden bg-card transition-shadow group ${
        exportMode ? "cursor-pointer" : "hover:shadow-lg"
      } ${isSelected ? "ring-2 ring-primary shadow-lg" : ""}`}
      onClick={exportMode ? onToggleSelect : undefined}
    >
      <div className="aspect-square bg-muted relative">
        {currentItem ? (
          <img src={currentItem.url} alt={char.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-6xl text-muted-foreground/30">{char.name[0]}</span>
          </div>
        )}

        {exportMode && (
          <div className={`absolute ${topOffsetClass} left-2 z-20`}>
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
              isSelected ? "bg-primary border-primary text-white" : "border-white/80 bg-black/30"
            }`}>
              {isSelected && (
                <Check className="w-4 h-4" strokeWidth={3} />
              )}
            </div>
          </div>
        )}

        {showReviewBadge && (
          <div className={`absolute top-2 left-2 px-2 py-0.5 text-xs rounded-full ${reviewBadgeClass}`}>
            {reviewLabel}
            {reviewScore ? ` · ${reviewScore}` : ""}
          </div>
        )}

        {hasMultiple && !exportMode && (
          <>
            <button
              onClick={goPrev}
              className="absolute left-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors opacity-0 group-hover:opacity-100"
              title="\u4E0A\u4E00\u5F20"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={goNext}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors opacity-0 group-hover:opacity-100"
              title="\u4E0B\u4E00\u5F20"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className={`absolute ${bottomOffsetClass} left-1/2 -translate-x-1/2 flex gap-1`}>
              {allItems.map((_, i) => (
                <span
                  key={i}
                  className={`block w-1.5 h-1.5 rounded-full transition-colors ${
                    i === safeIndex ? "bg-white" : "bg-white/40"
                  }`}
                />
              ))}
            </div>
          </>
        )}

        {!hasMultiple && char.referenceEntries.length > 0 && (
          <div className={`absolute ${bottomOffsetClass} left-2 px-2 py-0.5 text-xs rounded-full bg-black/60 text-white`}>
            {referenceBadgeText}
          </div>
        )}

        <div className={`absolute ${topOffsetClass} right-2 px-2 py-0.5 text-xs rounded-full bg-black/60 text-white transition-all`}>
          {STYLE_NAMES[displayStyle] || displayStyle}
        </div>

        {!exportMode && (
          <div className={`absolute ${topOffsetClass} left-2 flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity`}>
          <button
            onClick={onEdit}
            className="w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
            title="\u7F16\u8F91"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-error/90 transition-colors"
            title="\u5220\u9664"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          </div>
        )}
      </div>

      <div className="p-3 space-y-1.5">
        <h3 className="font-medium truncate">{char.name}</h3>
        <p className="text-sm text-muted-foreground line-clamp-2">{cardDescription}</p>
        {reviewSummaryText && (
          <p className="text-[11px] text-muted-foreground">{reviewSummaryText}</p>
        )}
        {char.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {char.tags.map((tag) => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {metaLine}
        </p>
      </div>
    </div>
  );
}
