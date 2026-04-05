import type { GenerateTask } from "@/lib/types";

export interface HistoryOverview {
  total: number;
  completed: number;
  imageQueueRunning: number;
  imageQueuePaused: number;
  comfyuiRemotePending: number;
}

export type HistoryFilterId =
  | "all"
  | "image_queue_running"
  | "image_queue_paused"
  | "comfyui_remote_pending";

export function buildHistoryOverview(
  items: Array<Pick<GenerateTask, "status" | "comfyuiRemotePendingCount">>,
): HistoryOverview {
  return items.reduce<HistoryOverview>((summary, item) => {
    summary.total += 1;
    if (item.status === "completed") {
      summary.completed += 1;
    }
    if (item.status === "image_queue_running") {
      summary.imageQueueRunning += 1;
    }
    if (item.status === "image_queue_paused") {
      summary.imageQueuePaused += 1;
    }
    summary.comfyuiRemotePending += item.comfyuiRemotePendingCount ?? 0;
    return summary;
  }, {
    total: 0,
    completed: 0,
    imageQueueRunning: 0,
    imageQueuePaused: 0,
    comfyuiRemotePending: 0,
  });
}

export function getHistoryAuxStatusLabels(
  item: Pick<GenerateTask, "queueSummary" | "comfyuiRemotePendingCount">,
): string[] {
  const labels: string[] = [];
  if ((item.queueSummary?.queued ?? 0) > 0) {
    labels.push(`排队 ${item.queueSummary?.queued ?? 0}`);
  }
  if ((item.queueSummary?.running ?? 0) > 0) {
    labels.push(`处理中 ${item.queueSummary?.running ?? 0}`);
  }
  if ((item.queueSummary?.paused ?? 0) > 0) {
    labels.push(`已暂停 ${item.queueSummary?.paused ?? 0}`);
  }
  if ((item.comfyuiRemotePendingCount ?? 0) > 0) {
    labels.push(`ComfyUI 回收 ${item.comfyuiRemotePendingCount}`);
  }
  return labels;
}

export function filterHistoryItems(
  items: GenerateTask[],
  filter: HistoryFilterId,
): GenerateTask[] {
  if (filter === "all") {
    return items;
  }
  if (filter === "image_queue_running") {
    return items.filter((item) => item.status === "image_queue_running");
  }
  if (filter === "image_queue_paused") {
    return items.filter((item) => item.status === "image_queue_paused");
  }
  return items.filter((item) => (item.comfyuiRemotePendingCount ?? 0) > 0);
}
