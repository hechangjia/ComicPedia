import type { GenerateTask, GenerateTaskStatus, TaskStateAuthority } from "@/lib/types";

const TASK_STATE_AUTHORITY_BY_STATUS: Record<GenerateTaskStatus, TaskStateAuthority> = {
  pending: "client_local",
  scripting: "client_local",
  generating: "client_local",
  created: "server_durable",
  research_running: "server_durable",
  script_running: "server_durable",
  script_ready: "server_durable",
  calibrating: "server_durable",
  image_queue_running: "server_durable",
  image_queue_paused: "server_durable",
  deep_review_running: "server_durable",
  deep_review_paused: "server_durable",
  completed: "settled",
  failed: "settled",
};

const ZOMBIE_RECOVERY_STATUSES = new Set<GenerateTaskStatus>([
  "scripting",
  "generating",
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
  if (!Object.prototype.hasOwnProperty.call(TASK_STATE_AUTHORITY_BY_STATUS, status)) {
    throw new Error(`Unknown task status authority mapping: ${String(status)}`);
  }
  return TASK_STATE_AUTHORITY_BY_STATUS[status];
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
