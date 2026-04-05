import { describe, expect, it } from "vitest";
import type { GenerateTask } from "@/lib/types";
import { buildHistoryOverview, filterHistoryItems, getHistoryAuxStatusLabels } from "@/app/history/historyCardStatus";

function makeTask(overrides: Partial<GenerateTask> = {}): GenerateTask {
  return {
    id: "task-history",
    status: "script_ready",
    progress: 30,
    createdAt: new Date("2026-04-05T00:00:00.000Z"),
    updatedAt: new Date("2026-04-05T00:00:00.000Z"),
    ...overrides,
  };
}

describe("history page status helpers", () => {
  it("filters history items by queue and ComfyUI recovery states", () => {
    const items = [
      makeTask({ id: "task-all", status: "completed" }),
      makeTask({ id: "task-running", status: "image_queue_running" }),
      makeTask({ id: "task-paused", status: "image_queue_paused" }),
      makeTask({ id: "task-recovery", status: "image_queue_running", comfyuiRemotePendingCount: 2 }),
    ];

    expect(filterHistoryItems(items, "all").map((item) => item.id)).toEqual([
      "task-all",
      "task-running",
      "task-paused",
      "task-recovery",
    ]);
    expect(filterHistoryItems(items, "image_queue_running").map((item) => item.id)).toEqual([
      "task-running",
      "task-recovery",
    ]);
    expect(filterHistoryItems(items, "image_queue_paused").map((item) => item.id)).toEqual([
      "task-paused",
    ]);
    expect(filterHistoryItems(items, "comfyui_remote_pending").map((item) => item.id)).toEqual([
      "task-recovery",
    ]);
  });

  it("builds history overview counts for queue activity and ComfyUI recovery", () => {
    expect(buildHistoryOverview([
      makeTask({ status: "completed" }),
      makeTask({ status: "image_queue_running", comfyuiRemotePendingCount: 2 }),
      makeTask({ status: "image_queue_running" }),
      makeTask({ status: "image_queue_paused", comfyuiRemotePendingCount: 1 }),
    ])).toEqual({
      total: 4,
      completed: 1,
      imageQueueRunning: 2,
      imageQueuePaused: 1,
      comfyuiRemotePending: 3,
    });
  });

  it("returns no auxiliary labels when there is no recoverable ComfyUI work", () => {
    expect(getHistoryAuxStatusLabels(makeTask())).toEqual([]);
  });

  it("surfaces active queue counters as auxiliary labels", () => {
    expect(getHistoryAuxStatusLabels(makeTask({
      queueSummary: {
        queued: 1,
        running: 2,
        paused: 1,
        failed: 0,
        attachFailed: 0,
        completed: 0,
        calibrationPending: 0,
      },
    }))).toEqual(["排队 1", "处理中 2", "已暂停 1"]);
  });

  it("shows the ComfyUI recovery badge label when remote recovery work exists", () => {
    expect(getHistoryAuxStatusLabels(makeTask({
      status: "image_queue_running",
      queueSummary: {
        queued: 0,
        running: 1,
        paused: 0,
        failed: 0,
        attachFailed: 0,
        completed: 0,
        calibrationPending: 0,
      },
      comfyuiRemotePendingCount: 2,
    }))).toEqual(["处理中 1", "ComfyUI 回收 2"]);
  });
});
