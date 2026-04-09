import type { GenerateTask, GenerateTaskStatus, TaskStateAuthority } from "@/lib/types";

const CLIENT_LOCAL_STATUSES = new Set<GenerateTaskStatus>([
  "pending",
  "scripting",
  "generating",
]);

const ZOMBIE_RECOVERY_STATUSES = new Set<GenerateTaskStatus>([
  "scripting",
  "generating",
]);

const SERVER_DURABLE_STATUSES = new Set<GenerateTaskStatus>([
  "created",
  "research_running",
  "script_running",
  "script_ready",
  "calibrating",
  "image_queue_running",
  "image_queue_paused",
  "deep_review_running",
  "deep_review_paused",
]);

const SETTLED_STATUSES = new Set<GenerateTaskStatus>([
  "completed",
  "failed",
]);

const PAGEHIDE_PAUSEABLE_STATUSES = new Set<GenerateTaskStatus>([
  "image_queue_running",
  "deep_review_running",
]);

const OFF_PAGE_RECONCILE_STATUSES = new Set<GenerateTaskStatus>([
  "image_queue_running",
  "deep_review_running",
]);

const IMAGE_RUNTIME_RESUME_STATUSES = new Set<GenerateTaskStatus>([
  "image_queue_running",
  "calibrating",
]);

const DEEP_REVIEW_RUNTIME_RESUME_STATUSES = new Set<GenerateTaskStatus>([
  "deep_review_running",
]);

const OFF_PAGE_RECONCILE_STALE_MS = 5 * 60 * 1000;

export function getTaskStateAuthority(status: GenerateTaskStatus): TaskStateAuthority {
  if (CLIENT_LOCAL_STATUSES.has(status)) {
    return "client_local";
  }
  if (SETTLED_STATUSES.has(status)) {
    return "settled";
  }
  return "server_durable";
}

export function attachTaskStateAuthority<T extends { status: GenerateTaskStatus }>(
  task: T,
): T & { stateAuthority: TaskStateAuthority } {
  return {
    ...task,
    stateAuthority: getTaskStateAuthority(task.status),
  };
}

export function shouldPreferLocalTaskSnapshot(task: Pick<GenerateTask, "status">): boolean {
  return getTaskStateAuthority(task.status) === "client_local";
}

export function shouldAttemptZombieRecovery(task: Pick<GenerateTask, "status">): boolean {
  return ZOMBIE_RECOVERY_STATUSES.has(task.status);
}

export function shouldPollTaskFromServer(task: Pick<GenerateTask, "status">): boolean {
  return getTaskStateAuthority(task.status) === "server_durable";
}

export function shouldPauseTaskOnLeave(task: Pick<GenerateTask, "status" | "presetSnapshot">): boolean {
  return PAGEHIDE_PAUSEABLE_STATUSES.has(task.status)
    && task.presetSnapshot?.leavePagePolicy !== "continue_in_background";
}

function getTaskTimestamp(value: GenerateTask["updatedAt"] | string | undefined): number | null {
  if (!value) {
    return null;
  }

  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function shouldAttemptOffPageTaskReconcile(
  task: Pick<GenerateTask, "status" | "updatedAt">,
  now = Date.now(),
): boolean {
  if (!OFF_PAGE_RECONCILE_STATUSES.has(task.status)) {
    return false;
  }

  const updatedAt = getTaskTimestamp(task.updatedAt);
  if (updatedAt === null) {
    return false;
  }

  return now - updatedAt >= OFF_PAGE_RECONCILE_STALE_MS;
}

export function shouldResumeImageQueueRuntime(status: GenerateTaskStatus): boolean {
  return IMAGE_RUNTIME_RESUME_STATUSES.has(status);
}

export function shouldResumeDeepReviewRuntime(status: GenerateTaskStatus): boolean {
  return DEEP_REVIEW_RUNTIME_RESUME_STATUSES.has(status);
}
