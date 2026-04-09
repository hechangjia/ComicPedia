import { describe, expect, it } from "vitest";
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

describe("taskStateAuthority", () => {
  it("classifies local, server-durable, and settled statuses", () => {
    expect(getTaskStateAuthority("pending")).toBe("client_local");
    expect(getTaskStateAuthority("generating")).toBe("client_local");
    expect(getTaskStateAuthority("script_ready")).toBe("server_durable");
    expect(getTaskStateAuthority("image_queue_running")).toBe("server_durable");
    expect(getTaskStateAuthority("completed")).toBe("settled");
    expect(getTaskStateAuthority("failed")).toBe("settled");
  });

  it("derives behavior helpers from the same contract", () => {
    expect(shouldPreferLocalTaskSnapshot({ status: "scripting" } as never)).toBe(true);
    expect(shouldPreferLocalTaskSnapshot({ status: "image_queue_running" } as never)).toBe(false);

    expect(shouldAttemptZombieRecovery({ status: "generating" } as never)).toBe(true);
    expect(shouldAttemptZombieRecovery({ status: "script_ready" } as never)).toBe(false);

    expect(shouldPollTaskFromServer({ status: "script_ready" } as never)).toBe(true);
    expect(shouldPollTaskFromServer({ status: "pending" } as never)).toBe(false);
    expect(shouldPollTaskFromServer({ status: "completed" } as never)).toBe(false);
  });

  it("keeps pagehide pause and stale reconcile restricted to durable queue states", () => {
    expect(shouldPauseTaskOnLeave({
      status: "image_queue_running",
      presetSnapshot: { presetId: "p1", leavePagePolicy: "finish_inflight_then_pause" },
    } as never)).toBe(true);

    expect(shouldPauseTaskOnLeave({
      status: "image_queue_running",
      presetSnapshot: { presetId: "p1", leavePagePolicy: "continue_in_background" },
    } as never)).toBe(false);

    expect(shouldAttemptOffPageTaskReconcile({
      status: "deep_review_running",
      updatedAt: "2026-04-09T00:00:00.000Z",
    } as never, new Date("2026-04-09T00:06:00.000Z").getTime())).toBe(true);

    expect(shouldAttemptOffPageTaskReconcile({
      status: "generating",
      updatedAt: "2026-04-09T00:00:00.000Z",
    } as never, new Date("2026-04-09T00:06:00.000Z").getTime())).toBe(false);
  });

  it("tags API payloads with an explicit authority field", () => {
    expect(attachTaskStateAuthority({ id: "t1", status: "script_ready" } as never)).toMatchObject({
      id: "t1",
      status: "script_ready",
      stateAuthority: "server_durable",
    });
  });

  it("keeps runtime resume gates aligned with durable queue states", () => {
    expect(shouldResumeImageQueueRuntime("calibrating")).toBe(true);
    expect(shouldResumeImageQueueRuntime("deep_review_running")).toBe(false);
    expect(shouldResumeDeepReviewRuntime("deep_review_running")).toBe(true);
    expect(shouldResumeDeepReviewRuntime("image_queue_running")).toBe(false);
  });
});
