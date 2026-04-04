"use client";

import { useMemo } from "react";
import { GenerateTask, ComicPanel } from "@/lib/types";
import type { Series } from "@/lib/series";

interface SeriesViewProps {
  tasks: GenerateTask[];
  series: Series[];
  onOpen: (task: GenerateTask) => void;
  validPanelsMap: Map<string, ComicPanel[]>;
}

export default function SeriesView({ tasks, series, onOpen, validPanelsMap }: SeriesViewProps) {
  const taskMap = useMemo(() => {
    const m = new Map<string, GenerateTask>();
    tasks.forEach((t) => m.set(t.id, t));
    return m;
  }, [tasks]);

  // Tasks that belong to a series
  const seriesTaskIds = useMemo(() => {
    const ids = new Set<string>();
    series.forEach((s) => s.episodes.forEach((ep) => ids.add(ep.taskId)));
    return ids;
  }, [series]);

  // Ungrouped tasks
  const ungrouped = useMemo(
    () => tasks.filter((t) => !seriesTaskIds.has(t.id)),
    [tasks, seriesTaskIds]
  );

  // Only series that have at least one matching task in the filtered list
  const activeSeries = useMemo(
    () => series.filter((s) => s.episodes.some((ep) => taskMap.has(ep.taskId))),
    [series, taskMap]
  );

  return (
    <div className="space-y-8">
      {/* Series groups */}
      {activeSeries.map((s) => {
        const episodes = s.episodes
          .map((ep) => ({ ...ep, task: taskMap.get(ep.taskId) }))
          .filter((ep) => ep.task);
        const coverTask = episodes[0]?.task;
        const coverPanels = coverTask ? (validPanelsMap.get(coverTask.id) ?? []) : [];
        const coverUrl = s.coverUrl || coverPanels[0]?.imageUrl;

        return (
          <div key={s.id} className="rounded-xl border bg-card overflow-hidden">
            {/* Series header */}
            <div className="flex gap-4 p-4 border-b bg-muted/30">
              {coverUrl && (
                <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                  <img src={coverUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold truncate">{s.title}</h3>
                {s.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{s.description}</p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {episodes.length} 集
                  </span>
                </div>
              </div>
            </div>
            {/* Episode list */}
            <div className="divide-y">
              {episodes.map((ep) => {
                const task = ep.task!;
                const panels = validPanelsMap.get(task.id) ?? [];
                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => onOpen(task)}
                  >
                    <span className="text-xs text-muted-foreground w-8 text-center font-mono">
                      #{ep.episodeNumber}
                    </span>
                    {panels[0]?.imageUrl && (
                      <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0">
                        <img src={panels[0].imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm truncate block">{ep.title || task.script?.title || "无标题"}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{panels.length} 格</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Ungrouped tasks */}
      {ungrouped.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-sm font-semibold text-muted-foreground">独立作品</h3>
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">{ungrouped.length} 部</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {ungrouped.map((task) => {
              const panels = validPanelsMap.get(task.id) ?? [];
              return (
                <div
                  key={task.id}
                  className="rounded-xl overflow-hidden bg-card border cursor-pointer hover:shadow-md transition-all"
                  onClick={() => onOpen(task)}
                >
                  <div className="relative aspect-[4/3]">
                    {panels[0]?.imageUrl && (
                      <img src={panels[0].imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-2">
                      <h4 className="text-xs font-medium text-white truncate">{task.script?.title || "无标题"}</h4>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeSeries.length === 0 && ungrouped.length === 0 && (
        <p className="text-center text-muted-foreground py-10">暂无匹配的作品</p>
      )}
    </div>
  );
}
