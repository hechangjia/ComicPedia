"use client";

import { useEffect, useState, useMemo, useCallback, useRef, memo } from "react";
import Link from "next/link";
import { getAllComics } from "@/lib/client/db";
import { useListCache } from "@/stores/listCache";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { GenerateTask, ComicPanel, ComicStyle } from "@/lib/types";
import { STYLE_DESCRIPTIONS } from "@/lib/config/styles";
import { formatDate } from "@/lib/utils";
import type { Series } from "@/lib/series";
import GalleryFilters, { GalleryFilterValues, DEFAULT_FILTERS } from "@/components/gallery/GalleryFilters";
import TimelineView from "@/components/gallery/TimelineView";
import SeriesView from "@/components/gallery/SeriesView";
import { Check, ChevronLeft, ChevronRight, Image as ImageIcon, Layers, LayoutGrid, List, X } from "lucide-react";


/** 从 STYLE_DESCRIPTIONS 提取简短中文名称 */
const styleNames: Record<string, string> = Object.fromEntries(
  (Object.keys(STYLE_DESCRIPTIONS) as ComicStyle[]).map((key) => [
    key,
    STYLE_DESCRIPTIONS[key].split("，")[0].replace(/风格$/, ""),
  ])
);

type SortBy = "newest" | "oldest" | "panels";
type ViewMode = "grid" | "timeline" | "series";

interface GalleryCardProps {
  task: GenerateTask;
  validPanels: ComicPanel[];
  featured: boolean;
  onOpen: (task: GenerateTask) => void;
  batchMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onToggleFavorite?: (e: React.MouseEvent) => void;
}

const GalleryCard = memo(function GalleryCard({ task, validPanels, featured, onOpen, batchMode, selected, onToggleSelect, onToggleFavorite }: GalleryCardProps) {
  const panelCount = validPanels.length;
  const spanClass = featured
    ? "col-span-2 row-span-2 sm:col-span-4 sm:row-span-2 lg:col-span-4 lg:row-span-2"
    : "col-span-2 sm:col-span-2 lg:col-span-2";

  return (
    <div
      className={`rounded-xl overflow-hidden bg-card group cursor-pointer relative transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(0,0,0,0.15)] ${spanClass} ${selected ? "ring-2 ring-primary" : ""}`}
      onClick={() => batchMode && onToggleSelect ? onToggleSelect() : onOpen(task)}
    >
      {/* 批量选择复选框 */}
      {batchMode && (
        <div className="absolute top-2 left-2 z-20">
          <div
            className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
              selected ? "bg-primary border-primary" : "bg-white/80 border-white/60"
            }`}
          >
            {selected && (
              <Check className="w-4 h-4 text-primary-foreground" strokeWidth={3} />
            )}
          </div>
        </div>
      )}

      {/* Favorite heart */}
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

      <div
        className={`relative w-full overflow-hidden ${
          featured ? "aspect-[16/9]" : "aspect-[4/3]"
        }`}
      >
        {featured && panelCount >= 2 ? (
          <div className="absolute inset-0 grid grid-cols-2 gap-0.5">
            {validPanels.slice(0, 2).map((p, idx) => (
              <div key={idx} className="overflow-hidden">
                <img
                  src={p.imageUrl}
                  alt={`Panel ${idx + 1}`}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        ) : (
          <img
            src={validPanels[0]?.imageUrl}
            alt={task.script?.title}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
            loading="lazy"
          />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        <div className="absolute top-2 right-2 px-2 py-0.5 text-[10px] bg-black/60 text-white rounded-full">
          {panelCount} 格
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4">
          <h3
            className={`font-bold text-white truncate ${
              featured ? "text-lg sm:text-xl" : "text-sm"
            }`}
          >
            {task.script?.title || "无标题"}
          </h3>
          {featured && task.script?.topic && (
            <p className="text-white/70 text-xs sm:text-sm mt-1 line-clamp-1">
              {task.script.topic}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <span
              className={`px-1.5 py-0.5 rounded text-white/90 bg-white/25 ${
                featured ? "text-xs" : "text-[10px]"
              }`}
            >
              {task.script?.style
                ? styleNames[task.script.style] || task.script.style
                : ""}
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

export default function GalleryPage() {
  const { getTasks, setTasks } = useListCache();
  const [allTasks, setAllTasks] = useState<GenerateTask[]>(() => getTasks()?.items ?? []);
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [lightboxTask, setLightboxTask] = useState<GenerateTask | null>(null);
  const [lightboxPanelIndex, setLightboxPanelIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [filters, setFilters] = useState<GalleryFilterValues>(DEFAULT_FILTERS);
  const [seriesList, setSeriesList] = useState<Series[]>([]);

  // 批量操作状态
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const lightboxRef = useRef<HTMLDivElement>(null);

  const loadGallery = useCallback(async (page: number) => {
    try {
      setLoading(true);
      const result = await getAllComics(page, 100);
      if (page === 1) {
        setAllTasks(result.items);
        setTasks(result.items, result.total);
      } else {
        setAllTasks(prev => {
          const merged = [...prev, ...result.items];
          setTasks(merged, result.total);
          return merged;
        });
      }
      setHasMore(result.hasMore);
      setCurrentPage(page);
    } catch (e) {
      console.error("Load gallery failed:", e);
    } finally {
      setLoading(false);
    }
  }, [setTasks]);

  useEffect(() => {
    loadGallery(1);
  }, [loadGallery]);

  // Load series for SeriesView
  useEffect(() => {
    if (viewMode === "series") {
      fetch("/api/series")
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setSeriesList(data);
          else if (data.series) setSeriesList(data.series);
        })
        .catch(() => {});
    }
  }, [viewMode]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      loadGallery(currentPage + 1);
    }
  }, [currentPage, hasMore, loadGallery, loading]);

  const getValidPanels = useCallback((task: GenerateTask): ComicPanel[] => {
    return (
      task.script?.panels.filter(
        (p) =>
          p.status === "completed" &&
          p.imageUrl &&
          !p.imageUrl.startsWith("data:text/plain")
      ) ?? []
    );
  }, []);

  const validPanelsMap = useMemo(() => {
    const map = new Map<string, ComicPanel[]>();
    allTasks.forEach((t) => {
      if (t.status === "completed") {
        map.set(t.id, getValidPanels(t));
      }
    });
    return map;
  }, [allTasks, getValidPanels]);

  const completedTasks = useMemo(() => {
    return allTasks.filter(
      (t) =>
        t.status === "completed" &&
        t.script?.panels.some(
          (p) =>
            p.status === "completed" &&
            p.imageUrl &&
            !p.imageUrl.startsWith("data:text/plain")
        )
    );
  }, [allTasks]);

  // Collect all tags across tasks
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    completedTasks.forEach((t) => {
      t.tags?.forEach((tag) => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [completedTasks]);

  // 统计摘要
  const stats = useMemo(() => {
    const totalPanels = completedTasks.reduce(
      (sum, t) => sum + (validPanelsMap.get(t.id)?.length ?? 0),
      0
    );
    const styleCounts: Record<string, number> = {};
    completedTasks.forEach((t) => {
      const s = t.script?.style;
      if (s) styleCounts[s] = (styleCounts[s] || 0) + 1;
    });
    const topStyle = Object.entries(styleCounts).sort(
      (a, b) => b[1] - a[1]
    )[0];
    return {
      totalWorks: completedTasks.length,
      totalPanels,
      topStyle: topStyle ? styleNames[topStyle[0]] || topStyle[0] : null,
    };
  }, [completedTasks, validPanelsMap]);

  // Apply filters
  const filteredTasks = useMemo(() => {
    let result = [...completedTasks];

    // Content type
    if (filters.contentType !== "all") {
      result = result.filter((t) => {
        // Try to infer content type from generationConfig or script
        const cfg = t.generationConfig;
        // No direct contentType on task — check generationConfig or fallback
        // The task doesn't store contentType directly, so we match on script topic patterns
        // For now: we check if the task's script has metadata matching the type
        // This is a best-effort filter
        return true; // content type filtering needs task-level contentType field
      });
    }

    // Style
    if (filters.style !== "all") {
      result = result.filter((t) => t.script?.style === filters.style);
    }

    // Tags
    if (filters.tags.length > 0) {
      result = result.filter((t) =>
        filters.tags.some((tag) => t.tags?.includes(tag))
      );
    }

    // Date range
    if (filters.dateRange !== "all") {
      const now = new Date();
      let cutoff: Date;
      switch (filters.dateRange) {
        case "week": {
          const d = new Date(now);
          d.setDate(d.getDate() - 7);
          cutoff = d;
          break;
        }
        case "month": {
          cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        }
        case "year": {
          cutoff = new Date(now.getFullYear(), 0, 1);
          break;
        }
        default:
          cutoff = new Date(0);
      }
      result = result.filter((t) => new Date(t.createdAt) >= cutoff);
    }

    // Favorites only
    if (filters.favoritesOnly) {
      result = result.filter((t) => t.favorited);
    }

    // Search (fuzzy includes on lowercased topic + title + tags)
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      result = result.filter((t) => {
        const title = t.script?.title?.toLowerCase() || "";
        const topic = t.script?.topic?.toLowerCase() || "";
        const tags = (t.tags ?? []).join(" ").toLowerCase();
        return title.includes(q) || topic.includes(q) || tags.includes(q);
      });
    }

    // Sort
    switch (sortBy) {
      case "newest":
        result.sort(
          (a, b) =>
            (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0)
        );
        break;
      case "oldest":
        result.sort(
          (a, b) =>
            (new Date(a.createdAt).getTime() || 0) - (new Date(b.createdAt).getTime() || 0)
        );
        break;
      case "panels":
        result.sort(
          (a, b) => (validPanelsMap.get(b.id)?.length ?? 0) - (validPanelsMap.get(a.id)?.length ?? 0)
        );
        break;
    }
    return result;
  }, [completedTasks, filters, sortBy, validPanelsMap]);

  // 计算交错布局
  const isFeatured = (index: number): boolean => {
    return index === 0 || index % 5 === 0;
  };

  // 虚拟滚动
  const VIRTUAL_THRESHOLD = 50;
  const useVirtual = filteredTasks.length > VIRTUAL_THRESHOLD && viewMode === "grid";

  const [colsPerRow, setColsPerRow] = useState(3);
  useEffect(() => {
    if (!useVirtual) return;
    const update = () => {
      const w = window.innerWidth;
      setColsPerRow(w < 640 ? 1 : w < 1024 ? 2 : 3);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [useVirtual]);

  const virtualRows = useMemo(() => {
    if (!useVirtual) return [];
    const rows: GenerateTask[][] = [];
    for (let i = 0; i < filteredTasks.length; i += colsPerRow) {
      rows.push(filteredTasks.slice(i, i + colsPerRow));
    }
    return rows;
  }, [filteredTasks, colsPerRow, useVirtual]);

  const rowVirtualizer = useWindowVirtualizer({
    count: virtualRows.length,
    estimateSize: () => 320,
    overscan: 5,
    enabled: useVirtual,
  });

  // 灯箱
  const lightboxPanels = useMemo(
    () => (lightboxTask ? (validPanelsMap.get(lightboxTask.id) ?? []) : []),
    [lightboxTask, validPanelsMap]
  );
  const handleCloseLightbox = useCallback(() => {
    setLightboxTask(null);
  }, []);
  const handleLightboxPrev = useCallback(() => {
    setLightboxPanelIndex((i) => Math.max(0, i - 1));
  }, []);
  const handleLightboxNext = useCallback(() => {
    setLightboxPanelIndex((i) =>
      Math.min(lightboxPanels.length - 1, i + 1)
    );
  }, [lightboxPanels.length]);

  useEffect(() => {
    if (!lightboxTask || lightboxPanels.length === 0) return;
    const preloadIdx = [lightboxPanelIndex - 1, lightboxPanelIndex + 1];
    preloadIdx.forEach((idx) => {
      if (idx >= 0 && idx < lightboxPanels.length) {
        const img = new Image();
        img.src = lightboxPanels[idx].imageUrl ?? "";
      }
    });
  }, [lightboxPanelIndex, lightboxPanels, lightboxTask]);

  useEffect(() => {
    if (!lightboxTask) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCloseLightbox();
      else if (e.key === "ArrowLeft") handleLightboxPrev();
      else if (e.key === "ArrowRight") handleLightboxNext();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [handleCloseLightbox, handleLightboxNext, handleLightboxPrev, lightboxTask]);

  // Focus trap for lightbox
  useEffect(() => {
    if (!lightboxTask || !lightboxRef.current) return;
    const container = lightboxRef.current;
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const trapFocus = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = container.querySelectorAll(focusableSelector);
      if (focusable.length === 0) return;
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;

      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    // Focus the close button on open
    const closeBtn = container.querySelector("button");
    closeBtn?.focus();

    document.addEventListener("keydown", trapFocus);
    return () => document.removeEventListener("keydown", trapFocus);
  }, [lightboxTask]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredTasks.map((t) => t.id)));
  }, [filteredTasks]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const confirmed = window.confirm(`确定删除 ${selectedIds.size} 部作品？此操作可在回收站恢复。`);
    if (!confirmed) return;

    setBatchDeleting(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch(`/api/tasks/${id}`, { method: "DELETE" })
        )
      );
      setAllTasks((prev) => prev.filter((t) => !selectedIds.has(t.id)));
      setSelectedIds(new Set());
      setBatchMode(false);
    } catch (e) {
      console.error("Batch delete failed:", e);
    } finally {
      setBatchDeleting(false);
    }
  }, [selectedIds]);

  const handleToggleFavorite = useCallback(async (taskId: string) => {
    const task = allTasks.find((t) => t.id === taskId);
    if (!task) return;
    const newFav = !task.favorited;

    // Optimistic update
    setAllTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, favorited: newFav } : t))
    );

    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorited: newFav }),
      });
    } catch {
      // Revert on failure
      setAllTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, favorited: !newFav } : t))
      );
    }
  }, [allTasks]);

  const openLightbox = useCallback((task: GenerateTask) => {
    setLightboxTask(task);
    setLightboxPanelIndex(0);
  }, []);

  const VIEW_ICONS: Record<ViewMode, { label: string; icon: React.ReactNode }> = {
    grid: {
      label: "网格",
      icon: (
        <LayoutGrid className="w-4 h-4" />
      ),
    },
    timeline: {
      label: "时间线",
      icon: (
        <List className="w-4 h-4" />
      ),
    },
    series: {
      label: "系列",
      icon: (
        <Layers className="w-4 h-4" />
      ),
    },
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[44px]"
          >
            <ChevronLeft className="w-4 h-4" />
            返回
          </Link>
          <h1 className="text-2xl font-bold text-foreground">
            作品展示
          </h1>
        </div>

        {/* View toggle + Sort + Batch */}
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex border rounded-lg overflow-hidden">
            {(Object.keys(VIEW_ICONS) as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-2.5 py-1.5 flex items-center gap-1 text-xs transition-colors ${
                  viewMode === mode
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent"
                }`}
                title={VIEW_ICONS[mode].label}
              >
                {VIEW_ICONS[mode].icon}
              </button>
            ))}
          </div>

          {completedTasks.length > 1 && (
            <button
              onClick={() => {
                setBatchMode(!batchMode);
                setSelectedIds(new Set());
              }}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors min-h-[36px] ${
                batchMode
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-accent"
              }`}
            >
              {batchMode ? "取消选择" : "批量操作"}
            </button>
          )}
          {filteredTasks.length > 1 && viewMode === "grid" && (
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="text-xs border rounded-lg px-3 py-1.5 bg-background min-h-[36px]"
            >
              <option value="newest">最新优先</option>
              <option value="oldest">最早优先</option>
              <option value="panels">面板数最多</option>
            </select>
          )}
        </div>
      </div>

      {/* Filters */}
      {completedTasks.length > 0 && (
        <GalleryFilters
          filters={filters}
          onFiltersChange={setFilters}
          availableTags={availableTags}
        />
      )}

      {/* 批量操作栏 */}
      {batchMode && (
        <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30 flex-wrap">
          <span className="text-xs text-muted-foreground">
            已选择 {selectedIds.size}/{filteredTasks.length}
          </span>
          <button
            onClick={selectAll}
            className="px-3 py-1.5 text-xs border rounded-lg hover:bg-accent"
          >
            全选
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1.5 text-xs border rounded-lg hover:bg-accent"
            disabled={selectedIds.size === 0}
          >
            取消全选
          </button>
          <button
            onClick={handleBatchDelete}
            disabled={selectedIds.size === 0 || batchDeleting}
            className="px-3 py-1.5 text-xs border border-error/20 text-error rounded-lg hover:bg-error/5 disabled:opacity-50"
          >
            {batchDeleting ? "删除中..." : `删除 (${selectedIds.size})`}
          </button>
        </div>
      )}

      {/* 统计摘要 */}
      {stats.totalWorks > 0 && (
        <div className="flex gap-4 flex-wrap">
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-soft border">
            <span className="text-2xl font-bold text-teal">
              {stats.totalWorks}
            </span>
            <span className="text-xs text-muted-foreground">部作品</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-soft border">
            <span className="text-2xl font-bold text-sky">
              {stats.totalPanels}
            </span>
            <span className="text-xs text-muted-foreground">张面板</span>
          </div>
          {stats.topStyle && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-ochre-soft border">
              <span className="text-sm font-semibold text-ochre">
                {stats.topStyle}
              </span>
              <span className="text-xs text-muted-foreground">最爱风格</span>
            </div>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && allTasks.length === 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`rounded-xl overflow-hidden bg-white dark:bg-[#221f1c] border border-[#ece8e0] dark:border-[#302d29] animate-pulse ${
                i === 0 ? "col-span-2 row-span-2 sm:col-span-4 sm:row-span-2 lg:col-span-4 lg:row-span-2" : "col-span-2 sm:col-span-2 lg:col-span-2"
              }`}
            >
              <div className={`w-full bg-[#f0ede5] dark:bg-[#2a2724] ${i === 0 ? "aspect-[16/9]" : "aspect-[4/3]"}`} />
              <div className="p-3 space-y-2">
                <div className="h-4 bg-[#f0ede5] dark:bg-[#2a2724] rounded w-2/3" />
                <div className="h-3 bg-[#f0ede5] dark:bg-[#2a2724] rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 空状态 */}
      {filteredTasks.length === 0 && (
        <div className="text-center py-20 space-y-4">
          <div className="w-20 h-20 mx-auto rounded-full bg-muted flex items-center justify-center">
            <ImageIcon className="w-10 h-10 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <p className="text-muted-foreground">
            {completedTasks.length === 0
              ? "还没有完成的作品，去创作第一个吧"
              : filters.search
                ? `未找到与"${filters.search}"相关的作品`
                : "该筛选条件下暂无作品"}
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-2 rounded-lg bg-primary text-primary-foreground min-h-[44px]"
          >
            开始创作
          </Link>
        </div>
      )}

      {/* Grid view */}
      {filteredTasks.length > 0 && viewMode === "grid" && !useVirtual && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {filteredTasks.map((task, taskIndex) => (
            <GalleryCard
              key={task.id}
              task={task}
              validPanels={validPanelsMap.get(task.id) ?? []}
              featured={isFeatured(taskIndex)}
              onOpen={openLightbox}
              batchMode={batchMode}
              selected={selectedIds.has(task.id)}
              onToggleSelect={() => toggleSelect(task.id)}
              onToggleFavorite={() => handleToggleFavorite(task.id)}
            />
          ))}
        </div>
      )}

      {/* Virtual grid */}
      {filteredTasks.length > 0 && viewMode === "grid" && useVirtual && (
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => (
            <div
              key={virtualRow.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 pb-3 sm:pb-4"
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
            >
              {virtualRows[virtualRow.index].map((task) => (
                <GalleryCard
                  key={task.id}
                  task={task}
                  validPanels={validPanelsMap.get(task.id) ?? []}
                  featured={false}
                  onOpen={openLightbox}
                  batchMode={batchMode}
                  selected={selectedIds.has(task.id)}
                  onToggleSelect={() => toggleSelect(task.id)}
                  onToggleFavorite={() => handleToggleFavorite(task.id)}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Timeline view */}
      {filteredTasks.length > 0 && viewMode === "timeline" && (
        <TimelineView
          tasks={filteredTasks}
          onOpen={openLightbox}
          batchMode={batchMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          validPanelsMap={validPanelsMap}
        />
      )}

      {/* Series view */}
      {filteredTasks.length > 0 && viewMode === "series" && (
        <SeriesView
          tasks={filteredTasks}
          series={seriesList}
          onOpen={openLightbox}
          validPanelsMap={validPanelsMap}
        />
      )}

      {/* 加载更多 */}
      {hasMore && filteredTasks.length > 0 && (
        <div className="flex justify-center pt-4">
          <button
            onClick={loadMore}
            disabled={loading}
            className="px-6 py-2 text-sm rounded-lg border hover:bg-accent transition-colors disabled:opacity-50"
          >
            {loading ? "加载中..." : "加载更多"}
          </button>
        </div>
      )}

      {/* 灯箱预览 */}
      {lightboxTask && lightboxPanels.length > 0 && (
        <div
          ref={lightboxRef}
          role="dialog"
          aria-modal="true"
          aria-label="图片预览"
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxTask(null)}
        >
          <button
            onClick={() => setLightboxTask(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors z-10"
          >
            <X className="w-6 h-6" />
          </button>

          <div
            className="flex flex-col items-center gap-4 max-w-4xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-white text-lg font-semibold text-center">
              {lightboxTask.script?.title}
            </h2>

            <div className="relative w-full flex items-center justify-center">
              {lightboxPanelIndex > 0 && (
                <button
                  onClick={handleLightboxPrev}
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors z-10"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}

              <img
                src={lightboxPanels[lightboxPanelIndex].imageUrl}
                alt={lightboxPanels[lightboxPanelIndex].scene}
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />

              {lightboxPanelIndex < lightboxPanels.length - 1 && (
                <button
                  onClick={handleLightboxNext}
                  className="absolute right-0 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors z-10"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              )}
            </div>

            {lightboxPanels[lightboxPanelIndex].dialogue && (
              <div className="bg-black/70 rounded-lg px-4 py-2 max-w-lg text-center">
                <p className="text-white text-sm leading-relaxed">
                  {lightboxPanels[lightboxPanelIndex].dialogue}
                </p>
              </div>
            )}

            <div className="flex items-center gap-3 text-white/70 text-sm">
              <span>
                {lightboxPanelIndex + 1} / {lightboxPanels.length}
              </span>
              <div className="flex gap-1.5">
                {lightboxPanels.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => setLightboxPanelIndex(idx)}
                    className={`w-8 h-8 rounded border-2 overflow-hidden transition-all ${
                      idx === lightboxPanelIndex
                        ? "border-white scale-110"
                        : "border-transparent opacity-60 hover:opacity-100"
                    }`}
                  >
                    <img
                      src={p.imageUrl}
                      alt={`Panel ${idx + 1}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  </button>
                ))}
              </div>
            </div>

            <Link
              href={`/result/${lightboxTask.id}`}
              className="text-white/60 text-xs hover:text-white transition-colors"
            >
              查看完整详情 →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
