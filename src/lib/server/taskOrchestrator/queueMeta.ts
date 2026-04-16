import type { TaskJobRecord } from "@/lib/types";
import { TASK_QUEUE_RUNNING_STATUSES } from "./types";

const REMOTE_PENDING_STATUSES = new Set<TaskJobRecord["status"]>([
  "queued",
  "failed",
  ...TASK_QUEUE_RUNNING_STATUSES,
]);

export function hasReplayableComfyPrompt(job: TaskJobRecord): boolean {
  if (job.kind !== "panel_image" || job.outputFileKey) {
    return false;
  }

  const payload = job.payload as {
    image?: {
      configId?: unknown;
      fallback?: unknown;
      comfyui?: {
        promptId?: unknown;
      };
    };
  };

  const hasReplayableConfig = typeof payload.image?.configId === "string" || !!payload.image?.fallback;
  if (!hasReplayableConfig) {
    return false;
  }

  return typeof payload.image?.comfyui?.promptId === "string" && payload.image.comfyui.promptId.length > 0;
}

export function countRecoverableComfyJobs(jobs: TaskJobRecord[]): number {
  return jobs.filter((job) =>
    REMOTE_PENDING_STATUSES.has(job.status) && hasReplayableComfyPrompt(job),
  ).length;
}
