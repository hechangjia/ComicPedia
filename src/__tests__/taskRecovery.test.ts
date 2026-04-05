import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerateTask, TaskJobRecord, TaskQueueSummary } from "@/lib/types";

const state = vi.hoisted(() => {
  const tasks = new Map<string, GenerateTask>();
  const jobs = new Map<string, TaskJobRecord[]>();

  function clone<T>(value: T): T {
    return structuredClone(value);
  }

  function summarize(taskJobs: TaskJobRecord[]): TaskQueueSummary {
    const summary: TaskQueueSummary = {
      queued: 0,
      running: 0,
      paused: 0,
      failed: 0,
      attachFailed: 0,
      completed: 0,
      calibrationPending: 0,
    };

    for (const job of taskJobs) {
      if (job.status === "queued") {
        summary.queued += 1;
      } else if (job.status === "calibrating") {
        summary.calibrationPending += 1;
      } else if (job.status === "generating" || job.status === "persisting" || job.status === "light_check") {
        summary.running += 1;
      } else if (job.status === "paused") {
        summary.paused += 1;
      } else if (job.status === "attach_failed") {
        summary.attachFailed += 1;
      } else if (job.status === "failed") {
        summary.failed += 1;
      } else if (job.status === "completed") {
        summary.completed += 1;
      }
    }

    return summary;
  }

  function setTask(task: GenerateTask): void {
    tasks.set(task.id, clone(task));
  }

  function getTask(taskId: string): GenerateTask | null {
    const task = tasks.get(taskId);
    return task ? clone(task) : null;
  }

  function upsertTask(task: GenerateTask): void {
    tasks.set(task.id, clone(task));
  }

  function setJobs(taskId: string, taskJobs: TaskJobRecord[]): void {
    jobs.set(taskId, taskJobs.map((job) => clone(job)));
  }

  function listJobs(taskId: string): TaskJobRecord[] {
    return (jobs.get(taskId) ?? []).map((job) => clone(job));
  }

  function upsertTaskJob(job: TaskJobRecord): void {
    const taskJobs = jobs.get(job.taskId) ?? [];
    const nextJobs = taskJobs.map((candidate) => clone(candidate));
    const index = nextJobs.findIndex((candidate) => candidate.id === job.id);
    if (index >= 0) {
      nextJobs[index] = clone(job);
    } else {
      nextJobs.push(clone(job));
    }
    jobs.set(job.taskId, nextJobs);
  }

  function reset(): void {
    tasks.clear();
    jobs.clear();
  }

  return {
    getTask,
    listJobs,
    reset,
    setJobs,
    setTask,
    summarize,
    upsertTask,
    upsertTaskJob,
  };
});

vi.mock("@/lib/server/db", () => ({
  getTaskById: vi.fn((taskId: string) => state.getTask(taskId)),
  upsertTask: vi.fn((task: GenerateTask) => state.upsertTask(task)),
  upsertTaskJob: vi.fn((job: TaskJobRecord) => state.upsertTaskJob(job)),
}));

vi.mock("@/lib/server/taskOrchestrator/store", () => ({
  listTaskJobsByTaskId: vi.fn(async (taskId: string) => state.listJobs(taskId)),
  summarizeTaskJobs: vi.fn((taskJobs: TaskJobRecord[]) => state.summarize(taskJobs)),
}));

function makeTask(overrides: Partial<GenerateTask> = {}): GenerateTask {
  return {
    id: "task-recovery",
    status: "image_queue_running",
    progress: 65,
    script: {
      title: "Recovery Task",
      topic: "Recovery",
      style: "anime",
      panels: [
        {
          id: 1,
          scene: "Completed panel",
          dialogue: "Done",
          imagePrompt: "panel-0",
          status: "completed",
          imageUrl: "file://panel-0-complete",
          imageVersions: [{ imageUrl: "file://panel-0-complete", createdAt: 1 }],
          activeVersionIndex: 0,
        },
        {
          id: 2,
          scene: "Regenerating panel",
          dialogue: "Retrying",
          imagePrompt: "panel-1",
          status: "generating",
          imageUrl: "file://panel-1-previous",
          imageVersions: [{ imageUrl: "file://panel-1-previous", createdAt: 2 }],
          activeVersionIndex: 0,
        },
        {
          id: 3,
          scene: "Queued panel",
          dialogue: "Queued",
          imagePrompt: "panel-2",
          status: "pending",
        },
      ],
    },
    createdAt: new Date("2026-04-05T00:00:00.000Z"),
    updatedAt: new Date("2026-04-05T00:00:00.000Z"),
    ...overrides,
  };
}

function makeJob(overrides: Partial<TaskJobRecord>): TaskJobRecord {
  return {
    id: "job-default",
    taskId: "task-recovery",
    kind: "panel_image",
    status: "queued",
    attemptCount: 0,
    payload: {},
    createdAt: "2026-04-05T00:00:00.000Z",
    updatedAt: "2026-04-05T00:00:00.000Z",
    ...overrides,
  };
}

describe("task recovery", () => {
  beforeEach(() => {
    vi.resetModules();
    state.reset();
  });

  it("reconciles orphaned image jobs into paused state without losing completed outputs", async () => {
    state.setTask(makeTask());
    state.setJobs("task-recovery", [
      makeJob({
        id: "job-panel-0",
        panelIndex: 0,
        status: "completed",
        outputFileKey: "task-recovery_panel0_job_0",
      }),
      makeJob({
        id: "job-panel-1",
        panelIndex: 1,
        status: "generating",
      }),
      makeJob({
        id: "job-panel-2",
        panelIndex: 2,
        status: "queued",
      }),
    ]);

    const { reconcileTaskJobs } = await import("@/lib/server/taskOrchestrator/reconcile");
    const reconciledTask = await reconcileTaskJobs("task-recovery");

    expect(reconciledTask.status).toBe("image_queue_paused");
    expect(reconciledTask.queueSummary).toEqual({
      queued: 0,
      running: 0,
      paused: 2,
      failed: 0,
      attachFailed: 0,
      completed: 1,
      calibrationPending: 0,
    });
    expect(reconciledTask.script?.panels[0]).toEqual(expect.objectContaining({
      status: "completed",
      imageUrl: "file://panel-0-complete",
    }));
    expect(reconciledTask.script?.panels[1]).toEqual(expect.objectContaining({
      status: "completed",
      imageUrl: "file://panel-1-previous",
    }));
    expect(reconciledTask.script?.panels[2]).toEqual(expect.objectContaining({
      status: "pending",
    }));
    expect(state.listJobs("task-recovery")).toEqual([
      expect.objectContaining({ id: "job-panel-0", status: "completed" }),
      expect.objectContaining({ id: "job-panel-1", status: "paused" }),
      expect.objectContaining({ id: "job-panel-2", status: "paused" }),
    ]);
  });

  it("prefers active deep review jobs over historical image jobs when reconciling", async () => {
    state.setTask(makeTask({
      status: "deep_review_running",
    }));
    state.setJobs("task-recovery", [
      makeJob({
        id: "job-image-history",
        panelIndex: 0,
        status: "completed",
      }),
      makeJob({
        id: "job-deep-review",
        kind: "deep_review",
        status: "queued",
      }),
    ]);

    const { reconcileTaskJobs } = await import("@/lib/server/taskOrchestrator/reconcile");
    const reconciledTask = await reconcileTaskJobs("task-recovery");

    expect(reconciledTask.status).toBe("deep_review_paused");
    expect(reconciledTask.queueSummary).toEqual({
      queued: 0,
      running: 0,
      paused: 1,
      failed: 0,
      attachFailed: 0,
      completed: 1,
      calibrationPending: 0,
    });
    expect(state.listJobs("task-recovery")).toEqual([
      expect.objectContaining({ id: "job-image-history", kind: "panel_image", status: "completed" }),
      expect.objectContaining({ id: "job-deep-review", kind: "deep_review", status: "paused" }),
    ]);
  });

  it("pauses queue work on pagehide only for pauseable task states", async () => {
    const pauseTask = vi.fn();
    const target = new EventTarget();

    const { bindTaskPageLifecycle } = await import("@/hooks/useTaskPageLifecycle");
    const cleanup = bindTaskPageLifecycle(target, {
      getTask: () => makeTask({ status: "image_queue_running" }),
      pauseTask,
    });

    target.dispatchEvent(new Event("pagehide"));
    cleanup();

    const ignoredTarget = new EventTarget();
    const ignoredCleanup = bindTaskPageLifecycle(ignoredTarget, {
      getTask: () => makeTask({ status: "script_ready" }),
      pauseTask,
    });

    ignoredTarget.dispatchEvent(new Event("pagehide"));
    ignoredCleanup();

    expect(pauseTask).toHaveBeenCalledTimes(1);
    expect(pauseTask).toHaveBeenCalledWith(expect.objectContaining({
      id: "task-recovery",
      status: "image_queue_running",
    }));
  });
});
