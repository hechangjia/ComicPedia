"use client";

import { useEffect, useState, useRef, useCallback, memo, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getAllComics, deleteComic, clearAllComics, saveTask } from "@/lib/client/db";
import { useListCache } from "@/stores/listCache";
import { recoverZombieTask } from "@/lib/client/generator";
import { reconcileTaskLifecycle, shouldAttemptOffPageReconcile } from "@/hooks/useTaskPageLifecycle";
import { GenerateTask, ComicStyle } from "@/lib/types";
import { STYLE_DESCRIPTIONS } from "@/lib/config/styles";
import { exportTasksAsZip, importDataFromFile } from "@/lib/exportImport";
import { formatDate } from "@/lib/utils";
import type { ExportProgress } from "@/lib/exportImport";
import { StorageIndicator } from "@/components/StorageIndicator";
import { Spinner } from "@/components/ui/Spinner";
import { buildHistoryOverview, filterHistoryItems, getHistoryAuxStatusLabels, type HistoryFilterId } from "./historyCardStatus";
import { buildResultHref, parseHistoryFilter } from "./historyNavigation";
import { ChevronLeft, Clock, Download, Image as ImageIcon, Trash2, Upload, X } from "lucide-react";

/** 从 STYLE_DESCRIPTIONS 提取简短中文名称 */
const styleNames: Record<string, string> = Object.fromEntries(
  (Object.keys(STYLE_DESCRIPTIONS) as ComicStyle[]).map((key) => [
    key,
    STYLE_DESCRIPTIONS[key].split("，")[0].replace(/风格$/, ""),
  ])
);

function getHistoryStatusBadgeClass(status: GenerateTask["status"]): string {
  switch (status) {
    case "completed":
      return "bg-success text-white";
    case "script_ready":
      return "bg-info text-white";
    case "generating":
    case "created":
    case "research_running":
    case "script_running":
    case "scripting":
    case "pending":
    case "image_queue_running":
    case "deep_review_running":
      return "bg-warning text-white";
    case "image_queue_paused":
    case "deep_review_paused":
    case "calibrating":
      return "bg-secondary text-secondary-foreground";
    default:
      return "bg-error text-white";
  }
}

function getHistoryStatusLabel(status: GenerateTask["status"]): string {
  switch (status) {
    case "completed":
      return "已完成";
    case "script_ready":
      return "待生成";
    case "generating":
      return "生成中";
    case "created":
      return "已创建";
    case "research_running":
      return "研究中";
    case "script_running":
    case "scripting":
      return "脚本生成中";
    case "pending":
      return "等待中";
    case "image_queue_running":
      return "图片队列中";
    case "image_queue_paused":
      return "图片队列已暂停";
    case "deep_review_running":
      return "深度评审中";
    case "deep_review_paused":
      return "深度评审已暂停";
    case "calibrating":
      return "校准中";
    default:
      return "失败";
  }
}

interface HistoryCardProps {
  item: GenerateTask;
  activeFilter: HistoryFilterId;
  exportMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

const REVIEW_BADGE_STYLES: Record<string, string> = {
  reviewed: "bg-success/10 text-success",
  needs_repair: "bg-warning/10 text-warning",
};

function getHistoryAuxBadgeClass(label: string): string {
  if (label.startsWith("ComfyUI 回收")) {
    return "bg-primary/90 text-primary-foreground";
  }
  if (label.startsWith("处理中")) {
    return "bg-warning text-white";
  }
  if (label.startsWith("排队")) {
    return "bg-info text-white";
  }
  if (label.startsWith("已暂停")) {
    return "bg-secondary text-secondary-foreground";
  }
  return "bg-muted text-muted-foreground";
}

function ReviewBadge({ item }: { item: GenerateTask }) {
  if (item.status !== "completed") return null;
  const rs = item.reviewStatus;
  if (!rs || rs === "unreviewed") return null;
  const score = item.visualQualityScore?.overall;
  const repairCount = item.visualQualityScore?.retryRecommendations?.length ?? 0;
  const label = rs === "reviewed"
    ? `已评审${score ? ` ${Math.round(score * 10) / 10}` : ""}`
    : `待修复${repairCount > 0 ? ` (${repairCount})` : ""}`;
  return (
    <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${REVIEW_BADGE_STYLES[rs]}`}>
      {label}
    </span>
  );
}

const HistoryCard = memo(function HistoryCard({
  item,
  activeFilter,
  exportMode,
  isSelected,
  onToggleSelect,
  onRemove,
}: HistoryCardProps) {
  const auxStatusLabels = getHistoryAuxStatusLabels(item);
  return (
    <div
      className={`rounded-xl border overflow-hidden bg-card transition-shadow group ${
        exportMode ? "cursor-pointer" : "hover:shadow-lg"
      } ${exportMode && isSelected ? "ring-2 ring-primary" : ""}`}
      onClick={exportMode ? () => onToggleSelect(item.id) : undefined}
    >
      {/* 缩略图 */}
      <div className="aspect-video bg-muted relative">
        {item.script?.panels[0]?.imageUrl ? (
          <>
            <img
              src={item.script.panels[0].imageUrl}
              alt={item.script.title || "漫画缩略图"}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <ImageIcon className="w-12 h-12" strokeWidth={1} />
          </div>
        )}
        {/* 选中复选框 */}
        {exportMode && (
          <div className="absolute top-2 left-2">
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
              isSelected
                ? "bg-primary border-primary text-primary-foreground"
                : "border-white/80 bg-black/30"
            }`}>
              {isSelected && (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          </div>
        )}
        {/* 状态标签 */}
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          <div
            className={`px-2 py-0.5 text-xs rounded-full ${getHistoryStatusBadgeClass(item.status)}`}
          >
            {getHistoryStatusLabel(item.status)}
          </div>
          {auxStatusLabels.map((label) => (
            <div
              key={label}
              className={`px-2 py-0.5 text-[10px] rounded-full ${getHistoryAuxBadgeClass(label)}`}
            >
              {label}
            </div>
          ))}
        </div>
        {/* 删除按钮 - 导出模式下隐藏 */}
        {!exportMode && (
          <button
            onClick={(e) => {
              e.preventDefault();
              if (confirm(`确定删除「${item.script?.title || "无标题"}」？`)) {
                onRemove(item.id);
              }
            }}
            className="absolute top-2 left-2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-black/70"
            title="删除"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 信息区 */}
      {exportMode ? (
        <div className="p-3 space-y-1">
          <h3 className="font-medium truncate">{item.script?.title || "无标题"}</h3>
          {auxStatusLabels.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {auxStatusLabels.map((label) => (
                <span
                  key={label}
                  className={`px-1.5 py-0.5 text-[10px] rounded-full ${getHistoryAuxBadgeClass(label)}`}
                >
                  {label}
                </span>
              ))}
            </div>
          )}
          <p className="text-sm text-muted-foreground truncate">{item.script?.topic || "未知主题"}</p>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{item.script?.style ? (styleNames[item.script.style] || item.script.style) : "未知风格"}</span>
            <span>{item.script?.panels?.length || 0} 格</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {formatDate(item.createdAt, { style: "datetime" })}
          </p>
        </div>
      ) : (
        <Link href={buildResultHref(item.id, activeFilter)} className="block p-3 space-y-1">
          <div className="flex items-center gap-1.5">
            <h3 className="font-medium truncate flex-1">{item.script?.title || "无标题"}</h3>
            <ReviewBadge item={item} />
          </div>
          {auxStatusLabels.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {auxStatusLabels.map((label) => (
                <span
                  key={label}
                  className={`px-1.5 py-0.5 text-[10px] rounded-full ${getHistoryAuxBadgeClass(label)}`}
                >
                  {label}
                </span>
              ))}
            </div>
          )}
          <p className="text-sm text-muted-foreground truncate">{item.script?.topic || "未知主题"}</p>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{item.script?.style ? (styleNames[item.script.style] || item.script.style) : "未知风格"}</span>
            <span>{item.script?.panels?.length || 0} 格</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {formatDate(item.createdAt, { style: "datetime" })}
          </p>
        </Link>
      )}
    </div>
  );
});

export default function HistoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getTasks, setTasks, invalidateTasks } = useListCache();
  const [history, setHistory] = useState<GenerateTask[]>(() => getTasks()?.items ?? []);
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const clearConfirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Selective export state
  const [exportMode, setExportMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const urlFilter = useMemo(() => parseHistoryFilter(searchParams.get("filter")), [searchParams]);
  const [activeFilter, setActiveFilter] = useState<HistoryFilterId>(urlFilter);
  const historyOverview = buildHistoryOverview(history);
  const visibleHistory = useMemo(
    () => filterHistoryItems(history, activeFilter),
    [activeFilter, history],
  );

  const loadHistory = useCallback(async (page: number) => {
    try {
      if (page > 1) setLoadingMore(true);
      const result = await getAllComics(page, 50);

      const tasks = result.items;
      const zombieIds = tasks
        .filter((t) => t.status === "generating" || t.status === "scripting")
        .map((t) => t.id);
      const stuckServerTaskIds = tasks
        .filter((t) => shouldAttemptOffPageReconcile(t))
        .map((t) => t.id);

      if (zombieIds.length > 0 || stuckServerTaskIds.length > 0) {
        await Promise.allSettled([
          ...zombieIds.map((id) => recoverZombieTask(id)),
          ...stuckServerTaskIds.map((id) => reconcileTaskLifecycle(id)),
        ]);
        const refreshed = await getAllComics(page, 50);
        if (page === 1) {
          setHistory(refreshed.items);
          setTasks(refreshed.items, refreshed.total);
        } else {
          setHistory((prev) => {
            const merged = [...prev, ...refreshed.items];
            setTasks(merged, refreshed.total);
            return merged;
          });
        }
        setHasMore(refreshed.hasMore);
        setCurrentPage(page);
        return;
      }

      if (page === 1) {
        setHistory(tasks);
        setTasks(tasks, result.total);
      } else {
        setHistory((prev) => {
          const merged = [...prev, ...tasks];
          setTasks(merged, result.total);
          return merged;
        });
      }
      setHasMore(result.hasMore);
      setCurrentPage(page);
    } catch (e) {
      console.error("Load history failed:", e);
    } finally {
      setLoadingMore(false);
    }
  }, [setTasks]);

  useEffect(() => {
    loadHistory(1);
  }, [loadHistory]);

  useEffect(() => {
    setActiveFilter(urlFilter);
  }, [urlFilter]);

  useEffect(() => {
    if (activeFilter === urlFilter) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    if (activeFilter === "all") {
      params.delete("filter");
    } else {
      params.set("filter", activeFilter);
    }

    const query = params.toString();
    router.replace(query ? `/history?${query}` : "/history", { scroll: false });
  }, [activeFilter, router, searchParams, urlFilter]);

  useEffect(() => {
    return () => {
      if (clearConfirmTimeoutRef.current) {
        clearTimeout(clearConfirmTimeoutRef.current);
      }
    };
  }, []);

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      loadHistory(currentPage + 1);
    }
  }, [currentPage, hasMore, loadHistory, loadingMore]);

  const handleRemove = useCallback(async (id: string) => {
    await deleteComic(id);
    invalidateTasks();
    loadHistory(1);
  }, [invalidateTasks, loadHistory]);

  const handleClearAll = useCallback(async () => {
    if (confirmClear) {
      if (clearConfirmTimeoutRef.current) {
        clearTimeout(clearConfirmTimeoutRef.current);
        clearConfirmTimeoutRef.current = null;
      }
      await clearAllComics();
      setHistory([]);
      setHasMore(false);
      setCurrentPage(1);
      setConfirmClear(false);
      invalidateTasks();
      return;
    }

    setConfirmClear(true);
    if (clearConfirmTimeoutRef.current) {
      clearTimeout(clearConfirmTimeoutRef.current);
    }
    clearConfirmTimeoutRef.current = setTimeout(() => {
      setConfirmClear(false);
      clearConfirmTimeoutRef.current = null;
    }, 3000);
  }, [confirmClear, invalidateTasks]);

  // ── Export ──

  const enterExportMode = useCallback(() => {
    setExportMode(true);
    setSelectedIds(new Set());
  }, []);

  const exitExportMode = useCallback(() => {
    setExportMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(visibleHistory.map((t) => t.id)));
  }, [visibleHistory]);

  const handleFilterChange = useCallback((filter: HistoryFilterId) => {
    setActiveFilter(filter);
    setSelectedIds(new Set());
  }, []);

  const handleExportSelected = useCallback(async () => {
    const selected = history.filter((t) => selectedIds.has(t.id));
    if (selected.length === 0) return;
    try {
      await exportTasksAsZip(selected, setExportProgress);
    } catch (err) {
      console.error("Export failed:", err);
      alert("导出失败，请查看控制台日志");
    } finally {
      setExportProgress(null);
    }
    exitExportMode();
  }, [exitExportMode, history, selectedIds]);

  const handleExportAll = useCallback(async () => {
    if (history.length === 0) return;
    try {
      await exportTasksAsZip(history, setExportProgress);
    } catch (err) {
      console.error("Export failed:", err);
      alert("导出失败，请查看控制台日志");
    } finally {
      setExportProgress(null);
    }
  }, [history]);

  // ── Import ──

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setExportProgress({ phase: "collecting", current: 0, total: 0 });
      const result = await importDataFromFile(file, setExportProgress);

      if (result.type !== "tasks") {
        alert("该文件包含的是角色库数据，请在「角色库」页面导入");
        return;
      }

      const arr = result.items as GenerateTask[];
      let count = 0;
      for (const task of arr) {
        if (!task.id) continue;
        // 确保日期字段存在
        if (!task.createdAt) task.createdAt = new Date();
        if (!task.updatedAt) task.updatedAt = new Date();
        await saveTask(task);
        count++;
      }
      if (count > 0) await loadHistory(1);
      alert(`成功导入 ${count} 个漫画任务` + (result.imageCount > 0 ? `（含 ${result.imageCount} 张图片）` : ""));
    } catch (err) {
      console.error("Import failed:", err);
      alert("导入失败：文件格式不正确");
    } finally {
      setExportProgress(null);
    }
    e.target.value = "";
  }, [loadHistory]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-4 h-4" />
            返回
          </Link>
          <h1 className="text-2xl font-bold">历史记录</h1>
        </div>

        {history.length > 0 && exportMode ? (
          /* ── Export selection toolbar ── */
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              已选 {selectedIds.size} / {visibleHistory.length}
            </span>
            <button
              onClick={selectedIds.size === visibleHistory.length ? () => setSelectedIds(new Set()) : selectAll}
              className="px-3 py-2 text-sm rounded-lg border hover:bg-accent transition-colors"
            >
              {selectedIds.size === visibleHistory.length ? "取消全选" : "全选"}
            </button>
            <button
              onClick={handleExportSelected}
              disabled={selectedIds.size === 0}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              导出 {selectedIds.size} 个
            </button>
            <button
              onClick={exitExportMode}
              className="px-3 py-2 text-sm rounded-lg border hover:bg-accent transition-colors"
            >
              取消
            </button>
          </div>
        ) : history.length > 0 ? (
          /* ── Normal toolbar ── */
          <div className="flex items-center gap-2">
            {/* 选择导出 */}
            <button
              onClick={enterExportMode}
              className="px-3 py-2 text-sm rounded-lg border hover:bg-accent transition-colors flex items-center gap-1.5"
              title="选择并导出"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">导出</span>
            </button>
            {/* 全部导出 */}
            <button
              onClick={handleExportAll}
              className="px-3 py-2 text-sm rounded-lg border hover:bg-accent transition-colors"
              title="一键导出所有漫画（含图片）"
            >
              <span className="hidden sm:inline">全部导出</span>
              <span className="sm:hidden text-xs">全部</span>
            </button>
            {/* 导入 */}
            <input ref={importFileRef} type="file" accept=".json,.zip" onChange={handleImport} className="hidden" />
            <button
              onClick={() => importFileRef.current?.click()}
              className="px-3 py-2 text-sm rounded-lg border hover:bg-accent transition-colors flex items-center gap-1.5"
              title="导入漫画数据（支持 ZIP 和 JSON）"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">导入</span>
            </button>
            {/* 清空 */}
            <button
              onClick={handleClearAll}
              className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                confirmClear
                  ? "bg-error text-white hover:bg-error/90"
                  : "border hover:bg-accent"
              }`}
            >
              {confirmClear ? "确认清空？" : "清空全部"}
            </button>
            {/* 回收站 */}
            <Link
              href="/trash"
              className="px-3 py-2 text-sm rounded-lg border hover:bg-accent transition-colors flex items-center gap-1.5"
              title="回收站"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">回收站</span>
            </Link>
          </div>
        ) : null}
      </div>

      {history.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="px-2.5 py-1 text-xs rounded-full bg-muted text-muted-foreground">
            总任务 {historyOverview.total}
          </span>
          <span className="px-2.5 py-1 text-xs rounded-full bg-success/10 text-success">
            已完成 {historyOverview.completed}
          </span>
          {historyOverview.imageQueueRunning > 0 && (
            <span className="px-2.5 py-1 text-xs rounded-full bg-warning text-white">
              图片队列中 {historyOverview.imageQueueRunning}
            </span>
          )}
          {historyOverview.imageQueuePaused > 0 && (
            <span className="px-2.5 py-1 text-xs rounded-full bg-secondary text-secondary-foreground">
              队列已暂停 {historyOverview.imageQueuePaused}
            </span>
          )}
          {historyOverview.comfyuiRemotePending > 0 && (
            <span className="px-2.5 py-1 text-xs rounded-full bg-primary/10 text-primary">
              ComfyUI 回收 {historyOverview.comfyuiRemotePending}
            </span>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {[
            { id: "all" as const, label: "全部", count: historyOverview.total },
            { id: "image_queue_running" as const, label: "图片队列中", count: historyOverview.imageQueueRunning },
            { id: "image_queue_paused" as const, label: "队列已暂停", count: historyOverview.imageQueuePaused },
            { id: "comfyui_remote_pending" as const, label: "ComfyUI 回收中", count: historyOverview.comfyuiRemotePending },
          ].filter((item) => item.id === "all" || item.count > 0 || activeFilter === item.id).map((item) => {
            const isActive = activeFilter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleFilterChange(item.id)}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-accent"
                }`}
              >
                {item.label} {item.count}
              </button>
            );
          })}
        </div>
      )}

      {/* 空状态 */}
      {history.length === 0 && (
        <div className="text-center py-16 space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center">
            <Clock className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">暂无历史记录</p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/"
              className="inline-block px-6 py-2 rounded-lg bg-primary text-primary-foreground"
            >
              生成第一个漫画
            </Link>
            {/* 空状态也允许导入 */}
            <input ref={importFileRef} type="file" accept=".json,.zip" onChange={handleImport} className="hidden" />
            <button
              onClick={() => importFileRef.current?.click()}
              className="px-4 py-2 text-sm rounded-lg border hover:bg-accent transition-colors flex items-center gap-1.5"
            >
              <Upload className="w-4 h-4" />
              导入
            </button>
          </div>
        </div>
      )}

      {/* 历史卡片网格 */}
      {history.length > 0 && visibleHistory.length === 0 && (
        <div className="rounded-xl border bg-card p-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">当前筛选下暂无任务</p>
          <button
            type="button"
            onClick={() => handleFilterChange("all")}
            className="px-4 py-2 text-sm rounded-lg border hover:bg-accent transition-colors"
          >
            查看全部
          </button>
        </div>
      )}

      {visibleHistory.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visibleHistory.map((item) => (
            <HistoryCard
              key={item.id}
              item={item}
              activeFilter={activeFilter}
              exportMode={exportMode}
              isSelected={selectedIds.has(item.id)}
              onToggleSelect={toggleSelect}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}

      {/* 加载更多 */}
      {hasMore && history.length > 0 && (
        <div className="flex justify-center pt-2">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-6 py-2 text-sm rounded-lg border hover:bg-accent transition-colors disabled:opacity-50"
          >
            {loadingMore ? "加载中..." : "加载更多"}
          </button>
        </div>
      )}

      {/* 存储用量 */}
      <div className="flex justify-center pt-4">
        <StorageIndicator />
      </div>

      {/* Export/Import progress overlay */}
      {exportProgress && exportProgress.phase !== "done" && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-card rounded-xl p-6 shadow-lg max-w-sm w-full mx-4 space-y-3">
            <div className="flex items-center gap-3">
              <Spinner size="sm" />
              <span className="text-sm font-medium">
                {exportProgress.phase === "collecting" && "正在收集图片引用..."}
                {exportProgress.phase === "fetching" && `正在处理图片 ${exportProgress.current}/${exportProgress.total}...`}
                {exportProgress.phase === "packing" && "正在打包 ZIP..."}
              </span>
            </div>
            {exportProgress.phase === "fetching" && exportProgress.total > 0 && (
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${Math.round((exportProgress.current / exportProgress.total) * 100)}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
