"use client";

import { useMemo } from "react";
import { GenerateTask, ComicPanel } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { Check } from "lucide-react";


interface TimelineViewProps {
  tasks: GenerateTask[];
  onOpen: (task: GenerateTask) => void;
  batchMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  validPanelsMap: Map<string, ComicPanel[]>;
}

interface DateBucket {
  label: string;
  tasks: GenerateTask[];
}

function getDateBuckets(tasks: GenerateTask[]): DateBucket[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const dayOfWeek = now.getDay() || 7; // Mon=1
  const startOfWeek = new Date(startOfToday.getTime() - (dayOfWeek - 1) * 86400000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const buckets: Record<string, GenerateTask[]> = {
    today: [],
    yesterday: [],
    week: [],
    month: [],
    older: [],
  };

  for (const task of tasks) {
    const d = new Date(task.createdAt);
    if (d >= startOfToday) buckets.today.push(task);
    else if (d >= startOfYesterday) buckets.yesterday.push(task);
    else if (d >= startOfWeek) buckets.week.push(task);
    else if (d >= startOfMonth) buckets.month.push(task);
    else buckets.older.push(task);
  }

  const labels: Record<string, string> = {
    today: "今天",
    yesterday: "昨天",
    week: "本周",
    month: "本月",
    older: "更早",
  };

  return ["today", "yesterday", "week", "month", "older"]
    .filter((k) => buckets[k].length > 0)
    .map((k) => ({ label: labels[k], tasks: buckets[k] }));
}

export default function TimelineView({ tasks, onOpen, batchMode, selectedIds, onToggleSelect, validPanelsMap }: TimelineViewProps) {
  const buckets = useMemo(() => getDateBuckets(tasks), [tasks]);

  if (buckets.length === 0) return null;

  return (
    <div className="space-y-8">
      {buckets.map((bucket) => (
        <div key={bucket.label}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <h3 className="text-sm font-semibold text-muted-foreground">{bucket.label}</h3>
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">{bucket.tasks.length} 部</span>
          </div>
          <div className="ml-6 border-l-2 border-border pl-6 space-y-3">
            {bucket.tasks.map((task) => {
              const panels = validPanelsMap.get(task.id) ?? [];
              const coverUrl = panels[0]?.imageUrl;
              return (
                <div
                  key={task.id}
                  className={`flex gap-4 p-3 rounded-xl bg-card border cursor-pointer transition-all hover:shadow-md ${
                    selectedIds.has(task.id) ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => batchMode ? onToggleSelect(task.id) : onOpen(task)}
                >
                  {/* Batch checkbox */}
                  {batchMode && (
                    <div className="flex items-center">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                        selectedIds.has(task.id) ? "bg-primary border-primary" : "border-muted-foreground/30"
                      }`}>
                        {selectedIds.has(task.id) && (
                          <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />
                        )}
                      </div>
                    </div>
                  )}
                  {/* Thumbnail */}
                  {coverUrl && (
                    <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                      <img src={coverUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </div>
                  )}
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium truncate">{task.script?.title || "无标题"}</h4>
                    {task.script?.topic && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{task.script.topic}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">{panels.length} 格</span>
                      <span className="text-[10px] text-muted-foreground">{formatDate(task.createdAt)}</span>
                      {task.favorited && (
                        <svg className="w-3 h-3 text-error" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        </svg>
                      )}
                      {task.tags && task.tags.length > 0 && task.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full border">{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
