import type { GenerateTaskStatus } from "@/lib/types";

export type ResultViewMode = "edit" | "read" | "play";

const DEFAULT_READ_RESULT_STATUSES = new Set<GenerateTaskStatus>([
  "completed",
  "image_queue_paused",
  "deep_review_paused",
]);

const LOCKED_READ_RESULT_STATUSES = new Set<GenerateTaskStatus>([
  "image_queue_paused",
  "deep_review_paused",
]);

export function getDefaultResultViewMode(status: GenerateTaskStatus | undefined): ResultViewMode {
  return status && DEFAULT_READ_RESULT_STATUSES.has(status) ? "read" : "edit";
}

export function resolveResultViewMode(
  viewMode: ResultViewMode,
  status: GenerateTaskStatus | undefined,
): ResultViewMode {
  if (viewMode !== "edit") {
    return viewMode;
  }

  if (status && LOCKED_READ_RESULT_STATUSES.has(status)) {
    return "read";
  }

  return "edit";
}
