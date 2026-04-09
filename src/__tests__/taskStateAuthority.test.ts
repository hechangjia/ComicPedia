import { describe, expect, it } from "vitest";
import type { GenerateTask, GenerateTaskStatus, TaskStateAuthority } from "@/lib/types";
import {
  attachTaskStateAuthority,
  getTaskStateAuthority,
  shouldAttemptOffPageTaskReconcile,
  shouldAttemptZombieRecovery,
  shouldPauseTaskOnLeave,
  shouldPollTaskFromServer,
  shouldPreferLocalTaskSnapshot,
  shouldResumeDeepReviewRuntime,
  shouldResumeImageQueueRuntime,
} from "@/lib/taskStateAuthority";

const TASK_STATE_AUTHORITY_EXPECTATIONS: Record<GenerateTaskStatus, TaskStateAuthority> = {
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

const STALE_UPDATED_AT = "2026-04-09T00:00:00.000Z";
const STALE_NOW = new Date("2026-04-09T00:06:00.000Z").getTime();
const FRESH_NOW = new Date("2026-04-09T00:04:00.000Z").getTime();

function createStatusTask(status: GenerateTaskStatus): Pick<GenerateTask, "status"> {
  return { status };
}

function createPauseableTask(
  status: GenerateTaskStatus,
  leavePagePolicy?: GenerateTask["presetSnapshot"] extends infer T
    ? T extends { leavePagePolicy?: infer P }
      ? P
      : never
    : never,
): Pick<GenerateTask, "status" | "presetSnapshot"> {
  return {
    status,
    presetSnapshot: leavePagePolicy ? { presetId: "p1", leavePagePolicy } : { presetId: "p1" },
  };
}

function createOffPageTask(
  status: GenerateTaskStatus,
  updatedAt: GenerateTask["updatedAt"] | string,
): Pick<GenerateTask, "status" | "updatedAt"> {
  return { status, updatedAt };
}

describe("taskStateAuthority", () => {
  it("classifies every GenerateTaskStatus exhaustively", () => {
    for (const [status, expectedAuthority] of Object.entries(TASK_STATE_AUTHORITY_EXPECTATIONS)) {
      expect(getTaskStateAuthority(status as GenerateTaskStatus)).toBe(expectedAuthority);
    }
  });

  it("derives behavior helpers from the exhaustive contract", () => {
    for (const [status, expectedAuthority] of Object.entries(TASK_STATE_AUTHORITY_EXPECTATIONS)) {
      const typedStatus = status as GenerateTaskStatus;
      const task = createStatusTask(typedStatus);

      expect(shouldPreferLocalTaskSnapshot(task)).toBe(expectedAuthority === "client_local");
      expect(shouldPollTaskFromServer(task)).toBe(expectedAuthority === "server_durable");
      expect(shouldAttemptZombieRecovery(task)).toBe(ZOMBIE_RECOVERY_STATUSES.has(typedStatus));
    }
  });

  it("restricts pagehide pause to durable running statuses and leave-page policy", () => {
    for (const status of Object.keys(TASK_STATE_AUTHORITY_EXPECTATIONS) as GenerateTaskStatus[]) {
      expect(shouldPauseTaskOnLeave(createPauseableTask(status, "finish_inflight_then_pause")))
        .toBe(PAGEHIDE_PAUSEABLE_STATUSES.has(status));
      expect(shouldPauseTaskOnLeave(createPauseableTask(status, "continue_in_background"))).toBe(false);
    }
  });

  it("restricts off-page reconcile to durable running statuses and stale threshold", () => {
    for (const status of Object.keys(TASK_STATE_AUTHORITY_EXPECTATIONS) as GenerateTaskStatus[]) {
      expect(shouldAttemptOffPageTaskReconcile(createOffPageTask(status, STALE_UPDATED_AT), STALE_NOW))
        .toBe(OFF_PAGE_RECONCILE_STATUSES.has(status));
    }

    expect(shouldAttemptOffPageTaskReconcile(
      createOffPageTask("deep_review_running", STALE_UPDATED_AT),
      FRESH_NOW,
    )).toBe(false);
  });

  it("tags API payloads with an explicit authority field", () => {
    for (const [status, expectedAuthority] of Object.entries(TASK_STATE_AUTHORITY_EXPECTATIONS)) {
      expect(attachTaskStateAuthority({ id: `t-${status}`, status: status as GenerateTaskStatus })).toMatchObject({
        id: `t-${status}`,
        status,
        stateAuthority: expectedAuthority,
      });
    }
  });

  it("keeps runtime resume gates aligned with durable queue statuses", () => {
    for (const status of Object.keys(TASK_STATE_AUTHORITY_EXPECTATIONS) as GenerateTaskStatus[]) {
      expect(shouldResumeImageQueueRuntime(status)).toBe(IMAGE_RUNTIME_RESUME_STATUSES.has(status));
      expect(shouldResumeDeepReviewRuntime(status)).toBe(DEEP_REVIEW_RUNTIME_RESUME_STATUSES.has(status));
    }
  });
});
