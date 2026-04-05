import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

type OrchestratorStoreModule = typeof import("@/lib/server/taskOrchestrator/store");

let tempDir: string | undefined;
let cwdSpy: ReturnType<typeof vi.spyOn> | undefined;

async function loadIsolatedStore(): Promise<OrchestratorStoreModule> {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "comicpedia-orchestrator-store-test-"));
  vi.resetModules();
  cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);
  return import("@/lib/server/taskOrchestrator/store");
}

afterEach(() => {
  cwdSpy?.mockRestore();
  cwdSpy = undefined;
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("taskOrchestrator store", () => {
  it("round-trips durable panel jobs", async () => {
    const store = await loadIsolatedStore();

    await store.createTaskJob({
      taskId: "task-1",
      kind: "panel",
      status: "queued",
      payload: {
        panelIndex: 1,
        attemptCount: 0,
        provider: "comfyui",
        model: "sdxl",
      },
    });

    await store.createTaskJob({
      taskId: "task-1",
      kind: "panel",
      status: "generating",
      payload: {
        panelIndex: 2,
        attemptCount: 1,
        provider: "comfyui",
        model: "sdxl",
      },
    });

    const jobs = await store.listTaskJobsByTaskId("task-1");
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      taskId: "task-1",
      kind: "panel",
      status: "queued",
      payload: expect.objectContaining({ panelIndex: 1, attemptCount: 0 }),
    });
    expect(jobs[1]).toMatchObject({
      taskId: "task-1",
      kind: "panel",
      status: "generating",
      payload: expect.objectContaining({ panelIndex: 2, attemptCount: 1 }),
    });
  });

  it("summarizes queue status buckets", async () => {
    const store = await loadIsolatedStore();

    await store.createTaskJob({ taskId: "task-2", kind: "panel", status: "queued" });
    await store.createTaskJob({ taskId: "task-2", kind: "panel", status: "calibrating" });
    await store.createTaskJob({ taskId: "task-2", kind: "panel", status: "generating" });
    await store.createTaskJob({ taskId: "task-2", kind: "panel", status: "persisting" });
    await store.createTaskJob({ taskId: "task-2", kind: "panel", status: "light_check" });
    await store.createTaskJob({ taskId: "task-2", kind: "panel", status: "paused" });
    await store.createTaskJob({ taskId: "task-2", kind: "panel", status: "attach_failed" });
    await store.createTaskJob({ taskId: "task-2", kind: "panel", status: "failed" });
    await store.createTaskJob({ taskId: "task-2", kind: "panel", status: "completed" });

    const jobs = await store.listTaskJobsByTaskId("task-2");
    const summary = store.summarizeTaskJobs(jobs);

    expect(summary).toEqual({
      queued: 1,
      running: 4,
      paused: 1,
      completed: 1,
      failed: 2,
      total: 9,
    });
  });
});
