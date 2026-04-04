"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAllSeries, saveSeries, deleteSeries, getAllComics } from "@/lib/client/db";
import { Series, createSeries } from "@/lib/series";
import type { GenerateTask, ComicStyle, ContentType } from "@/lib/types";
import { STYLE_META } from "@/lib/config/styles";
import { Layers, Plus } from "lucide-react";


export default function SeriesPage() {
  const router = useRouter();
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [tasks, setTasks] = useState<Map<string, GenerateTask>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // 创建表单
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newStyle, setNewStyle] = useState<ComicStyle>("flat");
  const [newContentType, setNewContentType] = useState<ContentType>("science");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [series, comicsResult] = await Promise.all([
        getAllSeries(),
        getAllComics(1, 500),
      ]);
      setSeriesList(series);
      const taskMap = new Map<string, GenerateTask>();
      for (const t of comicsResult.items) {
        taskMap.set(t.id, t);
      }
      setTasks(taskMap);
    } catch (err) {
      console.error("Failed to load series:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    const series = createSeries(newTitle, newContentType, newStyle, newDesc);
    await saveSeries(series);
    setShowCreate(false);
    setNewTitle("");
    setNewDesc("");
    await loadData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个连载系列吗？（不会删除已生成的漫画）")) return;
    await deleteSeries(id);
    await loadData();
  };

  const getEpisodeTask = (taskId: string) => tasks.get(taskId);

  const getCoverImage = (series: Series): string | undefined => {
    if (series.coverUrl) return series.coverUrl;
    for (const ep of series.episodes) {
      const task = getEpisodeTask(ep.taskId);
      const firstPanel = task?.script?.panels?.[0];
      if (firstPanel?.imageUrl && !firstPanel.imageUrl.startsWith("data:text/plain")) {
        return firstPanel.imageUrl;
      }
    }
    return undefined;
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-12 flex justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">连载系列</h1>
          <p className="text-sm text-muted-foreground mt-1">
            将多次生成的漫画组织成连续故事
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2 min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          新建连载
        </button>
      </div>

      {/* 创建表单 */}
      {showCreate && (
        <div className="p-4 rounded-xl border bg-card space-y-3">
          <h3 className="text-sm font-medium">新建连载系列</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">系列标题</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="例：黑洞探秘系列"
                className="w-full px-3 py-2 text-sm border rounded-lg min-h-[44px]"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">描述</label>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="系列简介（可选）"
                className="w-full px-3 py-2 text-sm border rounded-lg min-h-[44px]"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">内容类型</label>
              <select
                value={newContentType}
                onChange={(e) => setNewContentType(e.target.value as ContentType)}
                className="w-full px-3 py-2 text-sm border rounded-lg min-h-[44px] bg-background"
              >
                <option value="science">科普漫画</option>
                <option value="wikipedia">百科漫画</option>
                <option value="poetry">诗词漫画</option>
                <option value="novel">小说漫画</option>
                <option value="xiaohongshu">小红书图文</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">画面风格</label>
              <select
                value={newStyle}
                onChange={(e) => setNewStyle(e.target.value as ComicStyle)}
                className="w-full px-3 py-2 text-sm border rounded-lg min-h-[44px] bg-background"
              >
                {Object.entries(STYLE_META).map(([key, meta]) => (
                  <option key={key} value={key}>{meta.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm border rounded-lg hover:bg-accent min-h-[44px]"
            >
              取消
            </button>
            <button
              onClick={handleCreate}
              disabled={!newTitle.trim()}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 min-h-[44px]"
            >
              创建
            </button>
          </div>
        </div>
      )}

      {/* 连载列表 */}
      {seriesList.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center">
            <Layers className="w-8 h-8 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <p className="text-muted-foreground">还没有连载系列</p>
          <p className="text-xs text-muted-foreground">创建一个系列，将多个漫画组织成连续故事</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {seriesList.map((series) => {
            const cover = getCoverImage(series);
            const validEpisodes = series.episodes.filter(ep => tasks.has(ep.taskId));
            const missingCount = series.episodes.length - validEpisodes.length;
            const completedEps = validEpisodes.filter(ep => ep.status === "completed").length;

            return (
              <div
                key={series.id}
                className="rounded-xl border bg-card hover:shadow-md transition-shadow overflow-hidden"
              >
                <div className="flex">
                  {/* 封面 */}
                  <div className="w-24 h-24 sm:w-32 sm:h-32 bg-muted shrink-0">
                    {cover ? (
                      <img src={cover} alt={series.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-2xl">
                        {STYLE_META[series.style]?.icon || "?"}
                      </div>
                    )}
                  </div>

                  {/* 信息 */}
                  <div className="flex-1 p-3 sm:p-4 flex flex-col justify-between min-w-0">
                    <div>
                      <h3 className="font-medium text-sm sm:text-base truncate">{series.title}</h3>
                      {series.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{series.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {STYLE_META[series.style]?.label || series.style}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {validEpisodes.length} 集
                        </span>
                        {missingCount > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                            {missingCount} 已删除
                          </span>
                        )}
                        {completedEps > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                            {completedEps} 完成
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 操作 */}
                    <div className="flex items-center gap-2 mt-2">
                      <Link
                        href={`/?mode=${series.contentType === "novel" ? "novel" : series.contentType === "poetry" ? "poetry" : series.contentType === "xiaohongshu" ? "xiaohongshu" : series.contentType === "wikipedia" ? "wikipedia" : "science"}&series=${series.id}`}
                        className="text-xs text-primary hover:underline font-medium"
                      >
                        + 新建第 {validEpisodes.length + 1} 集
                      </Link>
                      {validEpisodes.length > 0 && (
                        <Link
                          href={`/result/${validEpisodes[validEpisodes.length - 1].taskId}`}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          查看最新集
                        </Link>
                      )}
                      <button
                        onClick={() => handleDelete(series.id)}
                        className="text-xs text-red-500 hover:text-red-600 ml-auto"
                        aria-label={`删除连载"${series.title}"`}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>

                {/* 集数列表 */}
                {validEpisodes.length > 0 && (
                  <div className="border-t px-3 sm:px-4 py-2 bg-muted/30">
                    <div className="flex gap-2 overflow-x-auto">
                      {validEpisodes.map((ep) => {
                        const epTask = getEpisodeTask(ep.taskId);
                        const epCover = epTask?.script?.panels?.[0]?.imageUrl;
                        const hasImage = epCover && !epCover.startsWith("data:text/plain");

                        return (
                          <Link
                            key={ep.taskId}
                            href={`/result/${ep.taskId}`}
                            className="shrink-0 w-12 h-12 rounded-lg border bg-muted overflow-hidden hover:ring-2 hover:ring-primary transition-all"
                            title={`第 ${ep.episodeNumber} 集: ${ep.title}`}
                          >
                            {hasImage ? (
                              <img src={epCover} alt={ep.title} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                                {ep.episodeNumber}
                              </div>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
