import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerateTask, TaskJobRecord, TaskQueueSummary, UserAPIConfigV2 } from "@/lib/types";

const state = vi.hoisted(() => {
  const tasks = new Map<string, GenerateTask>();
  const jobs = new Map<string, TaskJobRecord[]>();
  const persistedImageKeys = new Set<string>();

  const runComfyWorkflowMock = vi.fn();
  const submitComfyWorkflowMock = vi.fn();
  const waitForComfyWorkflowResultMock = vi.fn();
  const forwardImageGenerationRequestMock = vi.fn();
  const saveImageFileAsyncMock = vi.fn();
  const readImageByKeyMock = vi.fn();
  const registerImageMock = vi.fn();

  let jobCounter = 0;
  let failNextTaskAttach = false;
  let config: UserAPIConfigV2 | null = null;

  function clone<T>(value: T): T {
    return structuredClone(value);
  }

  function nextJobId(): string {
    jobCounter += 1;
    return `job-${jobCounter}`;
  }

  function summarize(jobsForTask: TaskJobRecord[]): TaskQueueSummary {
    const summary: TaskQueueSummary = {
      queued: 0,
      running: 0,
      paused: 0,
      failed: 0,
      attachFailed: 0,
      completed: 0,
      calibrationPending: 0,
    };

    for (const job of jobsForTask) {
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

  function setJobs(taskId: string, nextJobs: TaskJobRecord[]): void {
    jobs.set(taskId, nextJobs.map((job) => clone(job)));
  }

  function getJobs(taskId: string): TaskJobRecord[] {
    return (jobs.get(taskId) ?? []).map((job) => clone(job));
  }

  function upsertJob(job: TaskJobRecord): void {
    const currentJobs = jobs.get(job.taskId) ?? [];
    const nextJobs = currentJobs.map((currentJob) => clone(currentJob));
    const existingIndex = nextJobs.findIndex((currentJob) => currentJob.id === job.id);
    if (existingIndex >= 0) {
      nextJobs[existingIndex] = clone(job);
    } else {
      nextJobs.push(clone(job));
    }
    nextJobs.sort((left, right) => {
      if ((left.panelIndex ?? -1) !== (right.panelIndex ?? -1)) {
        return (left.panelIndex ?? -1) - (right.panelIndex ?? -1);
      }
      return left.createdAt.localeCompare(right.createdAt);
    });
    jobs.set(job.taskId, nextJobs);
  }

  function buildCreateTaskJob() {
    return async (input: Omit<TaskJobRecord, "id" | "createdAt" | "updatedAt" | "attemptCount" | "payload"> & {
      attemptCount?: number;
      payload?: Record<string, unknown>;
    }): Promise<TaskJobRecord> => {
      const now = new Date().toISOString();
      const job: TaskJobRecord = {
        id: nextJobId(),
        createdAt: now,
        updatedAt: now,
        attemptCount: input.attemptCount ?? 0,
        payload: input.payload ?? {},
        ...input,
      };
      upsertJob(job);
      return clone(job);
    };
  }

  function reset(): void {
    tasks.clear();
    jobs.clear();
    persistedImageKeys.clear();
    runComfyWorkflowMock.mockReset();
    submitComfyWorkflowMock.mockReset();
    waitForComfyWorkflowResultMock.mockReset();
    saveImageFileAsyncMock.mockReset();
    forwardImageGenerationRequestMock.mockReset();
    readImageByKeyMock.mockReset();
    registerImageMock.mockReset();
    jobCounter = 0;
    failNextTaskAttach = false;
    config = {
      version: 2,
      llmConfigs: [],
      imageConfigs: [
        {
          id: "img-remote-1",
          name: "Remote Image",
          provider: "openai",
          apiUrl: "https://remote.example.com/v1",
          apiKey: "remote-secret",
          model: "gpt-image-1",
          size: "1024x1024",
          endpointType: "images",
        },
      ],
      vlmConfigs: [],
      accuracyConfig: {
        providers: [],
        slots: {
          primarySearch: null,
          fallbackSearch: null,
          primaryFetch: null,
          fallbackFetch: null,
        },
        whitelistDomains: [],
      },
      activeLLMId: null,
      activeImageId: "img-remote-1",
      activeVLMId: null,
      updatedAt: "2026-04-05T00:00:00.000Z",
    };

    saveImageFileAsyncMock.mockImplementation(async (key: string, image: string) => {
      persistedImageKeys.add(key);
      return {
        filePath: `data/images/${key}.png`,
        size: image.length,
      };
    });

    readImageByKeyMock.mockImplementation((key: string) => {
      if (!persistedImageKeys.has(key)) {
        return null;
      }
      return {
        absPath: `/tmp/${key}.png`,
        mime: "image/png",
      };
    });
  }

  return {
    tasks,
    jobs,
    forwardImageGenerationRequestMock,
    runComfyWorkflowMock,
    submitComfyWorkflowMock,
    waitForComfyWorkflowResultMock,
    saveImageFileAsyncMock,
    readImageByKeyMock,
    registerImageMock,
    reset,
    setTask,
    getTask,
    setJobs,
    getJobs,
    upsertJob,
    summarize,
    buildCreateTaskJob,
    get config() {
      return config ? clone(config) : null;
    },
    set config(value: UserAPIConfigV2 | null) {
      config = value ? clone(value) : null;
    },
    get failNextTaskAttach() {
      return failNextTaskAttach;
    },
    set failNextTaskAttach(value: boolean) {
      failNextTaskAttach = value;
    },
  };
});

vi.mock("@/lib/server/db", () => ({
  getTaskById: vi.fn((taskId: string) => state.getTask(taskId)),
  upsertTask: vi.fn((task: GenerateTask) => {
    const attachedFileRef = task.script?.panels.find((panel) => panel.imageUrl?.startsWith("file://"))?.imageUrl;
    if (state.failNextTaskAttach && attachedFileRef?.includes("_job_")) {
      state.failNextTaskAttach = false;
      throw new Error(`attach failed for ${attachedFileRef}`);
    }
    state.setTask(task);
  }),
  upsertTaskJob: vi.fn((job: TaskJobRecord) => {
    state.upsertJob(job);
  }),
  registerImage: state.registerImageMock,
  getAllTasks: vi.fn(() => Array.from(state.tasks.values()).map((task) => structuredClone(task))),
  getConfig: vi.fn(() => state.config),
}));

vi.mock("@/lib/server/taskOrchestrator/store", () => ({
  createTaskJob: state.buildCreateTaskJob(),
  listTaskJobsByTaskId: vi.fn(async (taskId: string) => state.getJobs(taskId)),
  summarizeTaskJobs: vi.fn((jobs: TaskJobRecord[]) => state.summarize(jobs)),
}));

vi.mock("@/lib/server/comfyuiClient", () => ({
  ComfyUIClientError: class ComfyUIClientError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.name = "ComfyUIClientError";
      this.status = status;
    }
  },
  runComfyWorkflow: state.runComfyWorkflowMock,
  submitComfyWorkflow: state.submitComfyWorkflowMock,
  waitForComfyWorkflowResult: state.waitForComfyWorkflowResultMock,
}));

vi.mock("@/lib/server/imageGenerationService", () => ({
  forwardImageGenerationRequest: state.forwardImageGenerationRequestMock,
}));

vi.mock("@/lib/server/imageStorage", () => ({
  saveImageFileAsync: state.saveImageFileAsyncMock,
  readImageByKey: state.readImageByKeyMock,
}));

function makeTask(overrides: Partial<GenerateTask> = {}): GenerateTask {
  return {
    id: "task-image-queue",
    status: "script_ready",
    progress: 30,
    script: {
      title: "Queue Task",
      topic: "Queue Topic",
      style: "anime",
      characterDescription: "hero with blue scarf",
      panels: [
        {
          id: 1,
          scene: "Scene 1",
          dialogue: "Dialogue 1",
          imagePrompt: "Prompt 1",
          status: "pending",
        },
        {
          id: 2,
          scene: "Scene 2",
          dialogue: "Dialogue 2",
          imagePrompt: "Prompt 2",
          status: "pending",
        },
      ],
    },
    createdAt: new Date("2026-04-05T00:00:00.000Z"),
    updatedAt: new Date("2026-04-05T00:00:00.000Z"),
    ...overrides,
  };
}

const comfyImageConfig = {
  apiUrl: "http://127.0.0.1:8188",
  endpointType: "comfyui" as const,
  model: "sdxl",
  size: "1024x1024",
  comfyuiWorkflow: JSON.stringify({
    "1": { class_type: "CLIPTextEncode", inputs: { text: "old prompt" } },
    "2": { class_type: "KSampler", inputs: { seed: 1, positive: ["1", 0] } },
    "3": { class_type: "EmptyLatentImage", inputs: { width: 1024, height: 1024 } },
  }),
};

const remoteImageConfig = {
  apiUrl: "https://remote.example.com/v1",
  apiKey: "remote-secret",
  endpointType: "images" as const,
  model: "gpt-image-1",
  size: "1024x1024",
};

describe("image queue runner", () => {
  beforeEach(() => {
    vi.resetModules();
    state.reset();
  });

  it("enqueues panel jobs for a task and updates the queue summary", async () => {
    state.setTask(makeTask());

    const { enqueuePanelImageJobs } = await import("@/lib/server/taskOrchestrator/imageRunner");
    const result = await enqueuePanelImageJobs("task-image-queue", {
      panelIndices: [0, 1],
      imageConfig: comfyImageConfig,
    });

    expect(result.enqueuedPanelIndices).toEqual([0, 1]);
    expect(state.getJobs("task-image-queue")).toEqual([
      expect.objectContaining({ panelIndex: 0, status: "queued", kind: "panel_image", provider: "comfyui" }),
      expect.objectContaining({ panelIndex: 1, status: "queued", kind: "panel_image", provider: "comfyui" }),
    ]);

    const persistedTask = state.getTask("task-image-queue");
    expect(persistedTask?.status).toBe("image_queue_running");
    expect(persistedTask?.queueSummary).toEqual({
      queued: 2,
      running: 0,
      paused: 0,
      failed: 0,
      attachFailed: 0,
      completed: 0,
      calibrationPending: 0,
    });
  });

  it("pauses remaining ComfyUI jobs for calibration until approval is recorded", async () => {
    state.setTask(makeTask({
      presetSnapshot: {
        presetId: "balanced-auto",
        imageProvider: "comfyui",
        imageModel: "sdxl",
        calibrationRequired: true,
        calibrationApproved: false,
      },
    }));
    state.submitComfyWorkflowMock
      .mockResolvedValueOnce({ promptId: "pid-1", seed: 1 })
      .mockResolvedValueOnce({ promptId: "pid-2", seed: 2 });
    state.waitForComfyWorkflowResultMock
      .mockResolvedValueOnce({ image: "data:image/png;base64,AAA", promptId: "pid-1", seed: 1 })
      .mockResolvedValueOnce({ image: "data:image/png;base64,BBB", promptId: "pid-2", seed: 2 });

    const { approveTaskCalibration, enqueuePanelImageJobs, runTaskImageQueue } = await import("@/lib/server/taskOrchestrator/imageRunner");

    await enqueuePanelImageJobs("task-image-queue", {
      panelIndices: [0, 1],
      imageConfig: comfyImageConfig,
    });
    await runTaskImageQueue("task-image-queue");

    expect(state.submitComfyWorkflowMock).toHaveBeenCalledTimes(1);
    expect(state.waitForComfyWorkflowResultMock).toHaveBeenCalledTimes(1);
    expect(state.getJobs("task-image-queue")).toEqual([
      expect.objectContaining({ panelIndex: 0, status: "completed" }),
      expect.objectContaining({ panelIndex: 1, status: "calibrating" }),
    ]);

    const pausedTask = state.getTask("task-image-queue");
    expect(pausedTask?.status).toBe("calibrating");
    expect(pausedTask?.queueSummary).toEqual({
      queued: 0,
      running: 0,
      paused: 0,
      failed: 0,
      attachFailed: 0,
      completed: 1,
      calibrationPending: 1,
    });

    await approveTaskCalibration("task-image-queue");
    await runTaskImageQueue("task-image-queue");

    expect(state.submitComfyWorkflowMock).toHaveBeenCalledTimes(2);
    expect(state.waitForComfyWorkflowResultMock).toHaveBeenCalledTimes(2);
    expect(state.getJobs("task-image-queue")).toEqual([
      expect.objectContaining({ panelIndex: 0, status: "completed" }),
      expect.objectContaining({ panelIndex: 1, status: "completed" }),
    ]);

    const resumedTask = state.getTask("task-image-queue");
    expect(resumedTask?.presetSnapshot?.calibrationApproved).toBe(true);
    expect(resumedTask?.status).toBe("completed");
    expect(resumedTask?.script?.panels[0].imageUrl).toMatch(/^file:\/\//);
    expect(resumedTask?.script?.panels[1].imageUrl).toMatch(/^file:\/\//);
  });

  it("recovers an attach_failed job by re-attaching the already persisted file before regenerating", async () => {
    const task = makeTask();
    task.script!.panels[0].status = "completed";
    task.script!.panels[0].imageUrl = "file://task-image-queue_panel0_old";
    task.script!.panels[0].imageVersions = [{ imageUrl: "file://task-image-queue_panel0_old", createdAt: Date.now() - 1000 }];
    state.setTask(task);
    state.submitComfyWorkflowMock.mockResolvedValue({
      promptId: "pid-attach",
      seed: 4,
    });
    state.waitForComfyWorkflowResultMock.mockResolvedValue({
      image: "data:image/png;base64,CCC",
      promptId: "pid-attach",
      seed: 4,
    });

    const { enqueuePanelImageJobs, runTaskImageQueue } = await import("@/lib/server/taskOrchestrator/imageRunner");

    await enqueuePanelImageJobs("task-image-queue", {
      panelIndices: [0],
      imageConfig: comfyImageConfig,
    });

    state.failNextTaskAttach = true;
    await runTaskImageQueue("task-image-queue");

    const failedJob = state.getJobs("task-image-queue")[0];
    expect(state.submitComfyWorkflowMock).toHaveBeenCalledTimes(1);
    expect(state.waitForComfyWorkflowResultMock).toHaveBeenCalledTimes(1);
    expect(state.saveImageFileAsyncMock).toHaveBeenCalledTimes(1);
    expect(failedJob.status).toBe("attach_failed");
    expect(failedJob.outputFileKey).toBeTruthy();
    expect(state.getTask("task-image-queue")?.script?.panels[0].imageUrl).toBe("file://task-image-queue_panel0_old");
    expect(state.getTask("task-image-queue")?.script?.panels[0].status).toBe("completed");

    await enqueuePanelImageJobs("task-image-queue", {
      panelIndices: [0],
      imageConfig: comfyImageConfig,
    });
    await runTaskImageQueue("task-image-queue");

    const recoveredTask = state.getTask("task-image-queue");
    expect(state.submitComfyWorkflowMock).toHaveBeenCalledTimes(1);
    expect(state.waitForComfyWorkflowResultMock).toHaveBeenCalledTimes(1);
    expect(recoveredTask?.script?.panels[0].imageUrl).toBe(`file://${failedJob.outputFileKey}`);
    expect(recoveredTask?.script?.panels[0].status).toBe("completed");
    expect(recoveredTask?.script?.panels[0].imageVersions).toEqual([
      expect.objectContaining({ imageUrl: "file://task-image-queue_panel0_old" }),
      expect.objectContaining({ imageUrl: `file://${failedJob.outputFileKey}` }),
    ]);
    expect(state.getJobs("task-image-queue")[0]).toEqual(
      expect.objectContaining({ status: "completed", outputFileKey: failedJob.outputFileKey }),
    );
  });

  it("resumes a submitted ComfyUI prompt from durable job payload instead of re-submitting it", async () => {
    const task = makeTask({
      status: "image_queue_running",
    });
    task.script!.panels[0].status = "generating";
    state.setTask(task);
    state.setJobs("task-image-queue", [{
      id: "job-comfy-remote",
      taskId: "task-image-queue",
      kind: "panel_image",
      status: "generating",
      panelIndex: 0,
      provider: "comfyui",
      model: "sdxl",
      promptSnapshot: "Prompt 1",
      attemptCount: 1,
      payload: {
        image: {
          fallback: {
            apiUrl: "http://127.0.0.1:8188",
            endpointType: "comfyui",
            model: "sdxl",
            size: "1024x1024",
            comfyuiWorkflow: comfyImageConfig.comfyuiWorkflow,
          },
          comfyui: {
            promptId: "pid-resume",
            seed: 77,
            submittedAt: "2026-04-05T00:00:00.000Z",
          },
        },
      },
      createdAt: "2026-04-05T00:00:00.000Z",
      updatedAt: "2026-04-05T00:00:00.000Z",
    }]);
    state.waitForComfyWorkflowResultMock.mockResolvedValue({
      image: "data:image/png;base64,RESUMED",
      promptId: "pid-resume",
      seed: 77,
    });

    const { runTaskImageQueue } = await import("@/lib/server/taskOrchestrator/imageRunner");
    await runTaskImageQueue("task-image-queue");

    expect(state.submitComfyWorkflowMock).not.toHaveBeenCalled();
    expect(state.waitForComfyWorkflowResultMock).toHaveBeenCalledWith(expect.objectContaining({
      comfyuiUrl: "http://127.0.0.1:8188",
      promptId: "pid-resume",
      seed: 77,
    }));
    expect(state.getJobs("task-image-queue")[0]).toEqual(expect.objectContaining({
      status: "completed",
      outputFileKey: expect.any(String),
    }));
    expect(state.getTask("task-image-queue")?.script?.panels[0].imageUrl).toMatch(/^file:\/\//);
  });

  it("persists queue summary as running before waiting on a submitted ComfyUI prompt", async () => {
    state.setTask(makeTask());
    state.submitComfyWorkflowMock.mockResolvedValue({
      promptId: "pid-running-summary",
      seed: 13,
    });
    let taskSnapshotWhileWaiting: GenerateTask | null = null;
    state.waitForComfyWorkflowResultMock.mockImplementation(async () => {
      taskSnapshotWhileWaiting = state.getTask("task-image-queue");
      return {
        image: "data:image/png;base64,RUNNING",
        promptId: "pid-running-summary",
        seed: 13,
      };
    });

    const { enqueuePanelImageJobs, runTaskImageQueue } = await import("@/lib/server/taskOrchestrator/imageRunner");
    await enqueuePanelImageJobs("task-image-queue", {
      panelIndices: [0],
      imageConfig: comfyImageConfig,
    });
    await runTaskImageQueue("task-image-queue");

    expect(taskSnapshotWhileWaiting).toEqual(expect.objectContaining({
      comfyuiRemotePendingCount: 1,
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
      script: expect.objectContaining({
        panels: [
          expect.objectContaining({ status: "generating" }),
          expect.anything(),
        ],
      }),
    }));
  });

  it("keeps a submitted ComfyUI prompt id in generating state after a recoverable wait timeout", async () => {
    state.setTask(makeTask());
    state.submitComfyWorkflowMock.mockResolvedValue({
      promptId: "pid-timeout",
      seed: 99,
    });
    state.waitForComfyWorkflowResultMock.mockRejectedValue(new Error("poll timeout"));

    const { enqueuePanelImageJobs, runTaskImageQueue } = await import("@/lib/server/taskOrchestrator/imageRunner");
    await enqueuePanelImageJobs("task-image-queue", {
      panelIndices: [0],
      imageConfig: comfyImageConfig,
    });
    await runTaskImageQueue("task-image-queue");

    const timedOutJob = state.getJobs("task-image-queue")[0];
    const timedOutTask = state.getTask("task-image-queue");

    expect(timedOutJob).toEqual(expect.objectContaining({
      status: "generating",
      lastError: "poll timeout",
      payload: {
        image: expect.objectContaining({
          comfyui: expect.objectContaining({
            promptId: "pid-timeout",
            seed: 99,
          }),
        }),
      },
    }));
    expect(timedOutTask?.comfyuiRemotePendingCount).toBe(1);
    expect(timedOutTask?.status).toBe("image_queue_running");
    expect(timedOutTask?.script?.panels[0].status).toBe("generating");
  });

  it("replays a recoverable failed ComfyUI job by waiting on the stored prompt id", async () => {
    state.setTask(makeTask({
      status: "image_queue_paused",
      queueSummary: {
        queued: 0,
        running: 0,
        paused: 0,
        failed: 1,
        attachFailed: 0,
        completed: 0,
        calibrationPending: 0,
      },
      script: {
        ...makeTask().script!,
        panels: [
          {
            ...makeTask().script!.panels[0],
            status: "failed",
          },
          {
            ...makeTask().script!.panels[1],
          },
        ],
      },
    }));
    state.setJobs("task-image-queue", [{
      id: "job-recoverable-failed",
      taskId: "task-image-queue",
      kind: "panel_image",
      status: "failed",
      panelIndex: 0,
      provider: "local-comfyui",
      model: "workflow-a",
      attemptCount: 1,
      payload: {
        image: {
          fallback: comfyImageConfig,
          comfyui: {
            promptId: "pid-failed-resume",
            seed: 42,
            submittedAt: "2026-04-05T00:00:00.000Z",
          },
        },
      },
      createdAt: "2026-04-05T00:00:00.000Z",
      updatedAt: "2026-04-05T00:00:00.000Z",
    }]);
    state.waitForComfyWorkflowResultMock.mockResolvedValue({
      image: "data:image/png;base64,RECOVERED",
      promptId: "pid-failed-resume",
      seed: 42,
    });

    const { runTaskImageQueue } = await import("@/lib/server/taskOrchestrator/imageRunner");
    await runTaskImageQueue("task-image-queue");

    expect(state.submitComfyWorkflowMock).not.toHaveBeenCalled();
    expect(state.waitForComfyWorkflowResultMock).toHaveBeenCalledWith(expect.objectContaining({
      comfyuiUrl: "http://127.0.0.1:8188",
      promptId: "pid-failed-resume",
      seed: 42,
    }));
    expect(state.getJobs("task-image-queue")[0]).toEqual(expect.objectContaining({
      status: "completed",
      outputFileKey: expect.any(String),
    }));
    expect(state.getTask("task-image-queue")?.comfyuiRemotePendingCount).toBe(0);
    expect(state.getTask("task-image-queue")?.script?.panels[0].status).toBe("completed");
  });

  it("marks a first-time attach_failed panel as failed instead of leaving it generating", async () => {
    state.setTask(makeTask());
    state.submitComfyWorkflowMock.mockResolvedValue({
      promptId: "pid-first-attach",
      seed: 11,
    });
    state.waitForComfyWorkflowResultMock.mockResolvedValue({
      image: "data:image/png;base64,FIRST",
      promptId: "pid-first-attach",
      seed: 11,
    });

    const { enqueuePanelImageJobs, runTaskImageQueue } = await import("@/lib/server/taskOrchestrator/imageRunner");

    await enqueuePanelImageJobs("task-image-queue", {
      panelIndices: [0],
      imageConfig: comfyImageConfig,
    });

    state.failNextTaskAttach = true;
    await runTaskImageQueue("task-image-queue");

    const failedJob = state.getJobs("task-image-queue")[0];
    const failedTask = state.getTask("task-image-queue");

    expect(failedJob).toEqual(expect.objectContaining({
      status: "attach_failed",
      outputFileKey: expect.any(String),
    }));
    expect(failedTask?.status).toBe("image_queue_paused");
    expect(failedTask?.script?.panels[0].status).toBe("failed");
    expect(failedTask?.script?.panels[0].imageUrl).toBeUndefined();
  });

  it("processes jobs that are enqueued while the queue is already running", async () => {
    state.setTask(makeTask());
    const runner = await import("@/lib/server/taskOrchestrator/imageRunner");
    let enqueuedDuringRun = false;

    state.forwardImageGenerationRequestMock.mockImplementation(async () => {
      if (!enqueuedDuringRun) {
        enqueuedDuringRun = true;
        await runner.enqueuePanelImageJobs("task-image-queue", {
          panelIndices: [1],
          imageConfig: {
            ...remoteImageConfig,
            extraBody: {
              image: "data:image/png;base64,seed-image",
              strength: 0.35,
            },
          },
          imageConfigId: "img-remote-1",
        });
      }
      return {
        data: [{ b64_json: "REMOTE", content_type: "image/png" }],
      };
    });

    await runner.enqueuePanelImageJobs("task-image-queue", {
      panelIndices: [0],
      imageConfig: remoteImageConfig,
      imageConfigId: "img-remote-1",
    });
    await runner.runTaskImageQueue("task-image-queue");

    expect(state.getJobs("task-image-queue")).toEqual([
      expect.objectContaining({ panelIndex: 0, status: "completed" }),
      expect.objectContaining({ panelIndex: 1, status: "completed" }),
    ]);
    expect(state.getTask("task-image-queue")?.script?.panels[0].status).toBe("completed");
    expect(state.getTask("task-image-queue")?.script?.panels[1].status).toBe("completed");
  });

  it("binds each queued panel job to its own durable config and ignores a later shared fallback", async () => {
    state.setTask(makeTask());
    state.forwardImageGenerationRequestMock.mockResolvedValue({
      data: [{ b64_json: "REMOTE", content_type: "image/png" }],
    });
    state.submitComfyWorkflowMock.mockResolvedValue({
      promptId: "pid-local",
      seed: 7,
    });
    state.waitForComfyWorkflowResultMock.mockResolvedValue({
      image: "data:image/png;base64,LOCAL",
      promptId: "pid-local",
      seed: 7,
    });

    const { enqueuePanelImageJobs, runTaskImageQueue } = await import("@/lib/server/taskOrchestrator/imageRunner");

    await enqueuePanelImageJobs("task-image-queue", {
      panelIndices: [0],
      imageConfig: {
        ...remoteImageConfig,
        extraBody: {
          image: "data:image/png;base64,overlay-image",
          strength: 0.42,
        },
      },
      imageConfigId: "img-remote-1",
    });
    await enqueuePanelImageJobs("task-image-queue", {
      panelIndices: [1],
      imageConfig: comfyImageConfig,
    });

    const queuedJobs = state.getJobs("task-image-queue");
    expect(queuedJobs[0].payload).toMatchObject({
      image: {
        configId: "img-remote-1",
        fallback: undefined,
      },
    });
    expect(JSON.stringify(queuedJobs[0].payload)).not.toContain("remote-secret");
    expect(queuedJobs[1].payload).toMatchObject({
      image: {
        fallback: expect.objectContaining({
          apiUrl: "http://127.0.0.1:8188",
          endpointType: "comfyui",
        }),
      },
    });
    expect(queuedJobs[0].payload).toMatchObject({
      image: {
        overlay: expect.objectContaining({
          apiUrl: "https://remote.example.com/v1",
          endpointType: "images",
          extraBody: expect.objectContaining({
            image: "data:image/png;base64,overlay-image",
            strength: 0.42,
          }),
        }),
      },
    });

    await runTaskImageQueue("task-image-queue", {
      imageConfig: {
        apiUrl: "https://wrong.example.com/v1",
        apiKey: "wrong-secret",
        endpointType: "images",
        model: "wrong-model",
        size: "512x512",
      },
    });

    expect(state.forwardImageGenerationRequestMock).toHaveBeenCalledWith(expect.objectContaining({
      targetUrl: "https://remote.example.com/v1/images/generations",
      headers: { Authorization: "Bearer remote-secret" },
      payload: expect.objectContaining({
        model: "gpt-image-1",
        size: "1024x1024",
        image: "data:image/png;base64,overlay-image",
        strength: 0.42,
      }),
    }));
    expect(state.submitComfyWorkflowMock).toHaveBeenCalledWith(expect.objectContaining({
      comfyuiUrl: "http://127.0.0.1:8188",
    }));
  });

  it("requires calibration for the current queued batch even when older panel jobs already completed", async () => {
    const task = makeTask({
      presetSnapshot: {
        presetId: "balanced-auto",
        imageProvider: "comfyui",
        imageModel: "sdxl",
        calibrationRequired: true,
        calibrationApproved: false,
      },
    });
    task.script!.panels.push({
      id: 3,
      scene: "Scene 3",
      dialogue: "Dialogue 3",
      imagePrompt: "Prompt 3",
      status: "pending",
    });
    state.setTask(task);
    state.setJobs("task-image-queue", [{
      id: "job-old-completed",
      taskId: "task-image-queue",
      kind: "panel_image",
      status: "completed",
      panelIndex: 0,
      provider: "comfyui",
      model: "sdxl",
      promptSnapshot: "Old prompt",
      attemptCount: 1,
      payload: {
        image: {
          fallback: {
            apiUrl: "http://127.0.0.1:8188",
            endpointType: "comfyui",
            model: "sdxl",
            size: "1024x1024",
            comfyuiWorkflow: comfyImageConfig.comfyuiWorkflow,
          },
        },
      },
      outputFileKey: "task-image-queue_panel0_old",
      createdAt: "2026-04-04T00:00:00.000Z",
      updatedAt: "2026-04-04T00:00:00.000Z",
    }]);
    state.submitComfyWorkflowMock
      .mockResolvedValueOnce({ promptId: "pid-1", seed: 1 })
      .mockResolvedValueOnce({ promptId: "pid-2", seed: 2 });
    state.waitForComfyWorkflowResultMock
      .mockResolvedValueOnce({ image: "data:image/png;base64,AAA", promptId: "pid-1", seed: 1 })
      .mockResolvedValueOnce({ image: "data:image/png;base64,BBB", promptId: "pid-2", seed: 2 });

    const { enqueuePanelImageJobs, runTaskImageQueue } = await import("@/lib/server/taskOrchestrator/imageRunner");

    await enqueuePanelImageJobs("task-image-queue", {
      panelIndices: [1, 2],
      imageConfig: comfyImageConfig,
    });
    await runTaskImageQueue("task-image-queue");

    const jobs = state.getJobs("task-image-queue");
    expect(jobs.find((job) => job.panelIndex === 1)).toEqual(expect.objectContaining({ status: "completed" }));
    expect(jobs.find((job) => job.panelIndex === 2)).toEqual(expect.objectContaining({ status: "calibrating" }));
    expect(state.submitComfyWorkflowMock).toHaveBeenCalledTimes(1);
    expect(state.waitForComfyWorkflowResultMock).toHaveBeenCalledTimes(1);
    expect(state.getTask("task-image-queue")?.status).toBe("calibrating");
  });

  it("replays authenticated remote jobs from durable config ids without inline secrets", async () => {
    state.setTask(makeTask());
    state.forwardImageGenerationRequestMock.mockResolvedValue({
      data: [{ b64_json: "REMOTE", content_type: "image/png" }],
    });

    const { enqueuePanelImageJobs, listReplayableImageTasks, runTaskImageQueue } = await import("@/lib/server/taskOrchestrator/imageRunner");

    await enqueuePanelImageJobs("task-image-queue", {
      panelIndices: [0],
      imageConfig: {
        ...remoteImageConfig,
        extraBody: {
          control_image: "data:image/png;base64,control",
          control_mode: "Canny",
          strength: 0.6,
        },
      },
      imageConfigId: "img-remote-1",
    });

    const [queuedJob] = state.getJobs("task-image-queue");
    expect(queuedJob.payload).toEqual({
      image: {
        configId: "img-remote-1",
        fallback: undefined,
        overlay: {
          apiUrl: "https://remote.example.com/v1",
          model: "gpt-image-1",
          size: "1024x1024",
          endpointType: "images",
          extraBody: {
            control_image: "data:image/png;base64,control",
            control_mode: "Canny",
            strength: 0.6,
          },
        },
      },
    });
    expect(JSON.stringify(queuedJob.payload)).not.toContain("remote-secret");

    const replayable = await listReplayableImageTasks();
    expect(replayable).toEqual([{ taskId: "task-image-queue" }]);

    await runTaskImageQueue("task-image-queue");

    expect(state.forwardImageGenerationRequestMock).toHaveBeenCalledWith(expect.objectContaining({
      targetUrl: "https://remote.example.com/v1/images/generations",
      headers: { Authorization: "Bearer remote-secret" },
      payload: expect.objectContaining({
        control_image: "data:image/png;base64,control",
        control_mode: "Canny",
        strength: 0.6,
      }),
    }));
  });
});
