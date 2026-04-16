"use client";

import { memo } from "react";
import type { GenerateTask, ComicPanel, ComicStyle } from "@/lib/types";
import { STYLE_DESCRIPTIONS } from "@/lib/config/styles";
import { formatDate } from "@/lib/utils";
import { Check } from "lucide-react";

const styleNames: Record<string, string> = Object.fromEntries(
  (Object.keys(STYLE_DESCRIPTIONS) as ComicStyle[]).map((key) => [
    key,
    STYLE_DESCRIPTIONS[key].split("，")[0].replace(/风格$/, ""),
  ])
);

export interface GalleryCardProps {
  task: GenerateTask;
  validPanels: ComicPanel[];
  featured: boolean;
  onOpen: (task: GenerateTask) => void;
  batchMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onToggleFavorite?: (e: React.MouseEvent) => void;
}

export const GalleryCard = memo(function GalleryCard({
  task,
  validPanels,
  featured,
  onOpen,
  batchMode,
  selected,
  onToggleSelect,
  onToggleFavorite,
}: GalleryCardProps) {
  const panelCount = validPanels.length;
  const spanClass = featured
    ? "col-span-2 row-span-2 sm:col-span-4 sm:row-span-2 lg:col-span-4 lg:row-span-2"
    : "col-span-2 sm:col-span-2 lg:col-span-2";

  return (
    <div
      className={`rounded-xl overflow-hidden bg-card group cursor-pointer relative transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(0,0,0,0.15)] ${spanClass} ${selected ? "ring-2 ring-primary" : ""}`}
      onClick={() => batchMode && onToggleSelect ? onToggleSelect() : onOpen(task)}
    >
      {batchMode && (
        <div className="absolute top-2 left-2 z-20">
          <div
            className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
              selected ? "bg-primary border-primary" : "bg-white/80 border-white/60"
            }`}
          >
            {selected && <Check className="w-4 h-4 text-primary-foreground" strokeWidth={3} />}
          </div>
        </div>
      )}

      {!batchMode && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(e); }}
          className="absolute top-2 left-2 z-20 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 transition-colors opacity-0 group-hover:opacity-100"
          style={task.favorited ? { opacity: 1 } : undefined}
          title={task.favorited ? "取消收藏" : "收藏"}
        >
          <svg
            className={`w-4 h-4 ${task.favorited ? "text-error" : "text-white"}`}
            viewBox="0 0 24 24"
            fill={task.favorited ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      )}

      <div className={`relative w-full overflow-hidden ${featured ? "aspect-[16/9]" : "aspect-[4/3]"}`}>
        {featured && panelCount >= 2 ? (
          <div className="absolute inset-0 grid grid-cols-2 gap-0.5">
            {validPanels.slice(0, 2).map((p, idx) => (
              <div key={idx} className="overflow-hidden">
                <img src={p.imageUrl} alt={`Panel ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" loading="lazy" />
              </div>
            ))}
          </div>
        ) : (
          <img src={validPanels[0]?.imageUrl} alt={task.script?.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" loading="lazy" />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        <div className="absolute top-2 right-2 px-2 py-0.5 text-[10px] bg-black/60 text-white rounded-full">
          {panelCount} 格
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4">
          <h3 className={`font-bold text-white truncate ${featured ? "text-lg sm:text-xl" : "text-sm"}`}>
            {task.script?.title || "无标题"}
          </h3>
          {featured && task.script?.topic && (
            <p className="text-white/70 text-xs sm:text-sm mt-1 line-clamp-1">{task.script.topic}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`px-1.5 py-0.5 rounded text-white/90 bg-white/25 ${featured ? "text-xs" : "text-[10px]"}`}>
              {task.script?.style ? styleNames[task.script.style] || task.script.style : ""}
            </span>
            <span className={`text-white/50 ${featured ? "text-xs" : "text-[10px]"}`}>
              {formatDate(task.createdAt)}
            </span>
            {task.tags && task.tags.length > 0 && (
              <span className="text-[10px] text-white/60 truncate max-w-[80px]">
                {task.tags.slice(0, 2).join(", ")}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
