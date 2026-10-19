import type { GenerateTaskStatus } from "@/lib/types";

export type ResultViewMode = "edit" | "read" | "play";
export type ResultContentSurface = "play" | "script-editor" | "panel-grid";

const DEFAULT_READ_RESULT_STATUSES = new Set<GenerateTaskStatus>([
  "completed",
  "image_queue_paused",
  "deep_review_paused",
]);

const LOCKED_READ_RESULT_STATUSES = new Set<GenerateTaskStatus>([
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

export function getResultContentSurface(
  viewMode: ResultViewMode,
  status: GenerateTaskStatus | undefined,
): ResultContentSurface {
  if (viewMode === "play") {
    return "play";
  }

  if (viewMode === "edit" && status === "script_ready") {
    return "script-editor";
  }

  return "panel-grid";
}

/** Ignore a stale completed flag until every panel has a persisted image reference. */
export function getResultDisplayStatus(task: {
  status: GenerateTaskStatus;
  script?: { panels: { status: string; imageUrl?: string }[] };
}): GenerateTaskStatus {
  if (task.status !== "completed") return task.status;
  const panels = task.script?.panels ?? [];
  return panels.length > 0 && panels.every(panel => panel.status === "completed" && panel.imageUrl)
    ? "completed" : "script_ready";
}
