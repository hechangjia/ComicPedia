import type { HistoryFilterId } from "./historyCardStatus";

const VALID_HISTORY_FILTERS = new Set<HistoryFilterId>([
  "all",
  "image_queue_running",
  "image_queue_paused",
  "comfyui_remote_pending",
]);

export function parseHistoryFilter(value: string | null | undefined): HistoryFilterId {
  if (value && VALID_HISTORY_FILTERS.has(value as HistoryFilterId)) {
    return value as HistoryFilterId;
  }
  return "all";
}

export function buildHistoryHref(filter: HistoryFilterId): string {
  if (filter === "all") {
    return "/history";
  }
  const params = new URLSearchParams({ filter });
  return `/history?${params.toString()}`;
}

export function buildResultHref(taskId: string, filter: HistoryFilterId): string {
  const params = new URLSearchParams({
    returnTo: buildHistoryHref(filter),
  });
  return `/result/${taskId}?${params.toString()}`;
}

export function resolveResultBackHref(returnTo: string | null | undefined): string {
  if (typeof returnTo === "string" && returnTo.startsWith("/history")) {
    return returnTo;
  }
  return "/";
}
