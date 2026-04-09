import type { GenerateTaskStatus } from "@/lib/types";

export type ResultViewMode = "edit" | "read" | "play";

const READ_ONLY_RESULT_STATUSES = new Set<GenerateTaskStatus>([
  "completed",
  "image_queue_paused",
  "deep_review_paused",
]);

export function getDefaultResultViewMode(status: GenerateTaskStatus | undefined): ResultViewMode {
  return status && READ_ONLY_RESULT_STATUSES.has(status) ? "read" : "edit";
}

export function resolveResultViewMode(
  viewMode: ResultViewMode,
  status: GenerateTaskStatus | undefined,
): ResultViewMode {
  if (viewMode !== "edit") {
    return viewMode;
  }

  return getDefaultResultViewMode(status);
}
