"use client";

import { useState } from "react";
import type { Character, ComicStyle } from "@/lib/types";
import { STYLE_DESCRIPTIONS } from "@/lib/config/styles";
import { formatDate } from "@/lib/utils";

const STYLE_NAMES: Record<ComicStyle, string> = Object.fromEntries(
  (Object.keys(STYLE_DESCRIPTIONS) as ComicStyle[]).map((key) => [
    key,
    STYLE_DESCRIPTIONS[key].split("\uFF0C")[0].replace(/\u98CE\u683C$/, ""),
  ])
) as Record<ComicStyle, string>;

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
          <div className="absolute top-2 left-2 z-20">
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
              isSelected ? "bg-primary border-primary text-white" : "border-white/80 bg-black/30"
            }`}>
              {isSelected && (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          </div>
        )}

        {hasMultiple && !exportMode && (
          <>
            <button
              onClick={goPrev}
              className="absolute left-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors opacity-0 group-hover:opacity-100"
              title="\u4E0A\u4E00\u5F20"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={goNext}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors opacity-0 group-hover:opacity-100"
              title="\u4E0B\u4E00\u5F20"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
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
          <div className="absolute bottom-2 left-2 px-2 py-0.5 text-xs rounded-full bg-black/60 text-white">
            {char.referenceEntries.length} \u5F20\u53C2\u8003\u56FE
          </div>
        )}

        <div className="absolute top-2 right-2 px-2 py-0.5 text-xs rounded-full bg-black/60 text-white transition-all">
          {STYLE_NAMES[displayStyle] || displayStyle}
        </div>

        {!exportMode && (
          <div className="absolute top-2 left-2 flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
            title="\u7F16\u8F91"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
            title="\u5220\u9664"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          </div>
        )}
      </div>

      <div className="p-3 space-y-1.5">
        <h3 className="font-medium truncate">{char.name}</h3>
        {char.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{char.description}</p>
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
          {formatDate(char.updatedAt)}
        </p>
      </div>
    </div>
  );
}
