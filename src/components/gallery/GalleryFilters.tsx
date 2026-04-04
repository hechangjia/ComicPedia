"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ComicStyle, ContentType } from "@/lib/types";
import { STYLE_DESCRIPTIONS } from "@/lib/config/styles";
import { Search, X } from "lucide-react";


const CONTENT_TYPE_LABELS: Record<string, string> = {
  all: "全部类型",
  science: "科普",
  poetry: "诗词",
  novel: "小说",
  xiaohongshu: "小红书",
  wikipedia: "百科",
};

const styleNames: Record<string, string> = Object.fromEntries(
  (Object.keys(STYLE_DESCRIPTIONS) as ComicStyle[]).map((key) => [
    key,
    STYLE_DESCRIPTIONS[key].split("，")[0].replace(/风格$/, ""),
  ])
);

type DateRange = "all" | "week" | "month" | "year";

export interface GalleryFilterValues {
  contentType: "all" | ContentType;
  style: "all" | ComicStyle;
  tags: string[];
  dateRange: DateRange;
  favoritesOnly: boolean;
  search: string;
}

interface GalleryFiltersProps {
  filters: GalleryFilterValues;
  onFiltersChange: (filters: GalleryFilterValues) => void;
  availableTags: string[];
}

export const DEFAULT_FILTERS: GalleryFilterValues = {
  contentType: "all",
  style: "all",
  tags: [],
  dateRange: "all",
  favoritesOnly: false,
  search: "",
};

export default function GalleryFilters({ filters, onFiltersChange, availableTags }: GalleryFiltersProps) {
  const [searchInput, setSearchInput] = useState(filters.search);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      if (searchInput !== filters.search) {
        onFiltersChange({ ...filters, search: searchInput });
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback(
    (partial: Partial<GalleryFilterValues>) => {
      onFiltersChange({ ...filters, ...partial });
    },
    [filters, onFiltersChange]
  );

  const toggleTag = useCallback(
    (tag: string) => {
      const next = filters.tags.includes(tag)
        ? filters.tags.filter((t) => t !== tag)
        : [...filters.tags, tag];
      update({ tags: next });
    },
    [filters.tags, update]
  );

  return (
    <div className="space-y-3">
      {/* Row 1: dropdowns + favorites + search */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Content type */}
        <select
          value={filters.contentType}
          onChange={(e) => update({ contentType: e.target.value as GalleryFilterValues["contentType"] })}
          className="text-xs border rounded-lg px-3 py-1.5 bg-background min-h-[36px]"
        >
          {Object.entries(CONTENT_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {/* Style */}
        <select
          value={filters.style}
          onChange={(e) => update({ style: e.target.value as GalleryFilterValues["style"] })}
          className="text-xs border rounded-lg px-3 py-1.5 bg-background min-h-[36px]"
        >
          <option value="all">全部风格</option>
          {(Object.keys(STYLE_DESCRIPTIONS) as ComicStyle[]).map((s) => (
            <option key={s} value={s}>{styleNames[s] || s}</option>
          ))}
        </select>

        {/* Date range */}
        <select
          value={filters.dateRange}
          onChange={(e) => update({ dateRange: e.target.value as DateRange })}
          className="text-xs border rounded-lg px-3 py-1.5 bg-background min-h-[36px]"
        >
          <option value="all">全部时间</option>
          <option value="week">本周</option>
          <option value="month">本月</option>
          <option value="year">今年</option>
        </select>

        {/* Favorites toggle */}
        <button
          onClick={() => update({ favoritesOnly: !filters.favoritesOnly })}
          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors min-h-[36px] flex items-center gap-1 ${
            filters.favoritesOnly
              ? "bg-red-50 border-red-200 text-red-600 dark:bg-red-900/20 dark:border-red-800"
              : "hover:bg-accent"
          }`}
          title="仅显示收藏"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill={filters.favoritesOnly ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          收藏
        </button>

        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="搜索标题、主题、标签..."
            className="w-full pl-10 pr-4 py-1.5 text-xs border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary min-h-[36px]"
          />
          {searchInput && (
            <button
              onClick={() => { setSearchInput(""); update({ search: "" }); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full hover:bg-accent text-muted-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Row 2: tag pills (only if tags exist) */}
      {availableTags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {availableTags.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors ${
                filters.tags.includes(tag)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-accent"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
