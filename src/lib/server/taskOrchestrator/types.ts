import type { TaskJobStatus } from "@/lib/types";

export const TASK_QUEUE_RUNNING_STATUSES: TaskJobStatus[] = [
  "generating",
  "persisting",
  "light_check",
];
