import type { TaskJobStatus } from "@/lib/types";

export const TASK_QUEUE_RUNNING_STATUSES: TaskJobStatus[] = [
  "calibrating",
  "generating",
  "persisting",
  "light_check",
];

export const TASK_QUEUE_FAILED_STATUSES: TaskJobStatus[] = [
  "attach_failed",
  "failed",
];
