"use client";

import { useEffect, useState, useMemo, useCallback, memo } from "react";
import Link from "next/link";
import { getAllComics } from "@/lib/client/db";
import { useListCache } from "@/stores/listCache";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { GenerateTask, ComicPanel, ComicStyle } from "@/lib/types";
import { STYLE_DESCRIPTIONS } from "@/lib/config/styles";
import { formatDate } from "@/lib/utils";

/** 从 STYLE_DESCRIPTIONS 提取简短中文名称 */
const styleNames: Record<string, string> = Object.fromEntries(
  (Object.keys(STYLE_DESCRIPTIONS) as ComicStyle[]).map((key) => [
    key,
    STYLE_DESCRIPTIONS[key].split("，")[0].replace(/风格$/, ""),
  ])
);

type FilterStyle = "all" | ComicStyle;
type SortBy = "newest" | "oldest" | "panels";

interface GalleryCardProps {
  task: GenerateTask;
  validPanels: ComicPanel[];
  featured: boolean;
  onOpen: (task: GenerateTask) => void;
  batchMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

const GalleryCard = memo(function GalleryCard({ task, validPanels, featured, onOpen, batchMode, selected, onToggleSelect }: GalleryCardProps) {
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
              <svg className="w-4 h-4 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>
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
  const [filterStyle, setFilterStyle] = useState<FilterStyle>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [lightboxTask, setLightboxTask] = useState<GenerateTask | null>(null);
  const [lightboxPanelIndex, setLightboxPanelIndex] = useState(0);

  // 批量操作状态
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);

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

  // Memoized valid panels map — avoids N+1 recalculation in render loop
  const validPanelsMap = useMemo(() => {
    const map = new Map<string, ComicPanel[]>();
    allTasks.forEach((t) => {
      if (t.status === "completed") {
        map.set(t.id, getValidPanels(t));
      }
    });
    return map;
  }, [allTasks, getValidPanels]);

  // 仅展示已完成且有图片的作品
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

  // 提取可用风格标签
  const availableStyles = useMemo(() => {
    const styles = new Set<ComicStyle>();
    completedTasks.forEach((t) => {
      if (t.script?.style) styles.add(t.script.style);
    });
    return Array.from(styles);
  }, [completedTasks]);

  // 统计摘要
  const stats = useMemo(() => {
    const totalPanels = completedTasks.reduce(
      (sum, t) => sum + (validPanelsMap.get(t.id)?.length ?? 0),
      0
    );
    // 最常用风格
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

  // 筛选 + 排序
  const filteredTasks = useMemo(() => {
    let result = [...completedTasks];

    // 风格筛选
    if (filterStyle !== "all") {
      result = result.filter((t) => t.script?.style === filterStyle);
    }

    // 文本搜索
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((t) => {
        const title = t.script?.title?.toLowerCase() || "";
        const topic = t.script?.topic?.toLowerCase() || "";
        return title.includes(q) || topic.includes(q);
      });
    }

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
  }, [completedTasks, filterStyle, searchQuery, sortBy, validPanelsMap]);

  // 计算交错布局：第一个和每第 5 个作品为"大卡"
  const isFeatured = (index: number): boolean => {
    return index === 0 || index % 5 === 0;
  };

  // 虚拟滚动：仅在作品数 > 50 时启用
  const VIRTUAL_THRESHOLD = 50;
  const useVirtual = filteredTasks.length > VIRTUAL_THRESHOLD;

  // 响应式列数（虚拟滚动模式使用均匀布局）
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

  // 将任务分组为行（虚拟滚动用）
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

  // Lightbox image preloading — load adjacent panels in background
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

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[44px]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回
          </Link>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            作品展示
          </h1>
        </div>

        {/* 排序 + 批量操作切换 */}
        <div className="flex items-center gap-2">
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
          {filteredTasks.length > 1 && (
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

      {/* 搜索框 */}
      {completedTasks.length > 3 && (
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索标题或主题..."
            className="w-full pl-10 pr-4 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full hover:bg-accent text-muted-foreground"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
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
            className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
          >
            {batchDeleting ? "删除中..." : `删除 (${selectedIds.size})`}
          </button>
        </div>
      )}

      {/* 统计摘要 */}
      {stats.totalWorks > 0 && (
        <div className="flex gap-4 flex-wrap">
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border">
            <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {stats.totalWorks}
            </span>
            <span className="text-xs text-muted-foreground">部作品</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 border">
            <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {stats.totalPanels}
            </span>
            <span className="text-xs text-muted-foreground">张面板</span>
          </div>
          {stats.topStyle && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border">
              <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                {stats.topStyle}
              </span>
              <span className="text-xs text-muted-foreground">最爱风格</span>
            </div>
          )}
        </div>
      )}

      {/* 风格筛选标签 */}
      {availableStyles.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterStyle("all")}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
              filterStyle === "all"
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-accent"
            }`}
          >
            全部
          </button>
          {availableStyles.map((style) => (
            <button
              key={style}
              onClick={() => setFilterStyle(style)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                filterStyle === style
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-accent"
              }`}
            >
              {styleNames[style] || style}
            </button>
          ))}
        </div>
      )}

      {/* 空状态 */}
      {filteredTasks.length === 0 && (
        <div className="text-center py-20 space-y-4">
          <div className="w-20 h-20 mx-auto rounded-full bg-muted flex items-center justify-center">
            <svg className="w-10 h-10 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-muted-foreground">
            {completedTasks.length === 0
              ? "还没有完成的作品，去创作第一个吧"
              : searchQuery
                ? `未找到与"${searchQuery}"相关的作品`
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

      {/* 作品网格 */}
      {filteredTasks.length > 0 && !useVirtual && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {filteredTasks.map((task, taskIndex) => (
            <GalleryCard
              key={task.id}
              task={task}
              validPanels={validPanelsMap.get(task.id) ?? []}
              featured={isFeatured(taskIndex)}
              onOpen={(t) => {
                setLightboxTask(t);
                setLightboxPanelIndex(0);
              }}
              batchMode={batchMode}
              selected={selectedIds.has(task.id)}
              onToggleSelect={() => toggleSelect(task.id)}
            />
          ))}
        </div>
      )}

      {/* 虚拟滚动网格（> 50 作品时启用） */}
      {filteredTasks.length > 0 && useVirtual && (
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
                  onOpen={(t) => {
                    setLightboxTask(t);
                    setLightboxPanelIndex(0);
                  }}
                  batchMode={batchMode}
                  selected={selectedIds.has(task.id)}
                  onToggleSelect={() => toggleSelect(task.id)}
                />
              ))}
            </div>
          ))}
        </div>
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
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxTask(null)}
        >
          <button
            onClick={() => setLightboxTask(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors z-10"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
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
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
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
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
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
