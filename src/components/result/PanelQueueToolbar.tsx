"use client";

import type { GenerateTask, TaskQueueSummary } from "@/lib/types";
import { Image as ImageIcon, PauseCircle, PlayCircle, Rows4 } from "lucide-react";

interface PanelQueueToolbarProps {
  taskStatus: GenerateTask["status"];
  pendingPanels: number;
  selectedCount: number;
  queueSummary?: TaskQueueSummary;
  actionPending: boolean;
  onQueueSelected: () => void;
  onContinueRemaining: () => void;
  onPauseQueue: () => void;
  onResumeQueue: () => void;
}

function renderQueueState(status: GenerateTask["status"]): string {
  if (status === "image_queue_running") return "队列进行中";
  if (status === "image_queue_paused") return "队列已暂停";
  return "等待入队";
}

export function PanelQueueToolbar({
  taskStatus,
  pendingPanels,
  selectedCount,
  queueSummary,
  actionPending,
  onQueueSelected,
  onContinueRemaining,
  onPauseQueue,
  onResumeQueue,
}: PanelQueueToolbarProps) {
  const isQueueRunning = taskStatus === "image_queue_running";
  const isQueuePaused = taskStatus === "image_queue_paused";
  const canEnqueuePanels = taskStatus === "script_ready";

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3 no-print">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-medium">队列摘要</p>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="px-2 py-1 rounded-full bg-muted/70">
              {renderQueueState(taskStatus)}
            </span>
            <span className="px-2 py-1 rounded-full bg-muted/70">
              待处理 {pendingPanels}
            </span>
            <span className="px-2 py-1 rounded-full bg-muted/70">
              已完成 {queueSummary?.completed ?? 0}
            </span>
            {(queueSummary?.queued ?? 0) > 0 && (
              <span className="px-2 py-1 rounded-full bg-info/10 text-info">
                排队中 {queueSummary?.queued ?? 0}
              </span>
            )}
            {(queueSummary?.running ?? 0) > 0 && (
              <span className="px-2 py-1 rounded-full bg-warning/10 text-warning">
                处理中 {queueSummary?.running ?? 0}
              </span>
            )}
            {(queueSummary?.paused ?? 0) > 0 && (
              <span className="px-2 py-1 rounded-full bg-secondary text-secondary-foreground">
                已暂停 {queueSummary?.paused ?? 0}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-label="生成选中"
          onClick={onQueueSelected}
          disabled={actionPending || selectedCount === 0 || !canEnqueuePanels}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2 min-h-[40px]"
        >
          <Rows4 className="w-4 h-4" />
          生成选中
        </button>
        <button
          type="button"
          aria-label="继续剩余"
          onClick={onContinueRemaining}
          disabled={actionPending || pendingPanels === 0 || !canEnqueuePanels}
          className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors disabled:opacity-50 flex items-center gap-2 min-h-[40px]"
        >
          <ImageIcon className="w-4 h-4" />
          继续剩余
        </button>
        {isQueueRunning && (
          <button
            type="button"
            aria-label="暂停队列"
            onClick={onPauseQueue}
            disabled={actionPending}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors disabled:opacity-50 flex items-center gap-2 min-h-[40px]"
          >
            <PauseCircle className="w-4 h-4" />
            暂停队列
          </button>
        )}
        {isQueuePaused && (
          <button
            type="button"
            aria-label="恢复队列"
            onClick={onResumeQueue}
            disabled={actionPending}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors disabled:opacity-50 flex items-center gap-2 min-h-[40px]"
          >
            <PlayCircle className="w-4 h-4" />
            恢复队列
          </button>
        )}
      </div>
    </div>
  );
}
