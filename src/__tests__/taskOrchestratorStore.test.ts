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
      kind: "panel_image",
      status: "queued",
      panelIndex: 1,
      attemptCount: 0,
      provider: "comfyui",
      model: "sdxl",
      promptSnapshot: "prompt-1",
    });

    await store.createTaskJob({
      taskId: "task-1",
      kind: "panel_image",
      status: "generating",
      panelIndex: 2,
      attemptCount: 1,
      provider: "comfyui",
      model: "sdxl",
      outputFileKey: "task-1/panel-2.png",
      lastError: "transient timeout",
    });

    const jobs = await store.listTaskJobsByTaskId("task-1");
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      taskId: "task-1",
      kind: "panel_image",
      status: "queued",
      panelIndex: 1,
      attemptCount: 0,
      provider: "comfyui",
      model: "sdxl",
      promptSnapshot: "prompt-1",
    });
    expect(jobs[1]).toMatchObject({
      taskId: "task-1",
      kind: "panel_image",
      status: "generating",
      panelIndex: 2,
      attemptCount: 1,
      provider: "comfyui",
      model: "sdxl",
      outputFileKey: "task-1/panel-2.png",
      lastError: "transient timeout",
    });
  });

  it("summarizes queue status buckets", async () => {
    const store = await loadIsolatedStore();

    await store.createTaskJob({ taskId: "task-2", kind: "panel_image", status: "queued" });
    await store.createTaskJob({ taskId: "task-2", kind: "panel_image", status: "calibrating" });
    await store.createTaskJob({ taskId: "task-2", kind: "panel_image", status: "generating" });
    await store.createTaskJob({ taskId: "task-2", kind: "panel_image", status: "persisting" });
    await store.createTaskJob({ taskId: "task-2", kind: "panel_image", status: "light_check" });
    await store.createTaskJob({ taskId: "task-2", kind: "panel_image", status: "paused" });
    await store.createTaskJob({ taskId: "task-2", kind: "panel_image", status: "attach_failed" });
    await store.createTaskJob({ taskId: "task-2", kind: "panel_image", status: "failed" });
    await store.createTaskJob({ taskId: "task-2", kind: "panel_image", status: "completed" });

    const jobs = await store.listTaskJobsByTaskId("task-2");
    const summary = store.summarizeTaskJobs(jobs);

    expect(summary).toEqual({
      queued: 1,
      running: 3,
      paused: 1,
      failed: 1,
      attachFailed: 1,
      completed: 1,
      calibrationPending: 1,
    });
  });
});
