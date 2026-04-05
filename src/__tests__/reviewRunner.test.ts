import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerateTask, TaskJobRecord, TaskQueueSummary, UserAPIConfigV2, VisualDiagnosisReport } from "@/lib/types";

const {
  getConfigMock,
  evaluateVisualDiagnosisMock,
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  evaluateVisualDiagnosisMock: vi.fn(),
}));

const state = vi.hoisted(() => {
  const tasks = new Map<string, GenerateTask>();
  const jobs = new Map<string, TaskJobRecord[]>();
  let onUpsertTaskJob: ((job: TaskJobRecord) => void) | undefined;

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

  function getAllTasks(): GenerateTask[] {
    return Array.from(tasks.values()).map((task) => clone(task));
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
    onUpsertTaskJob?.(clone(job));
  }

  function setJobUpsertHook(hook?: (job: TaskJobRecord) => void): void {
    onUpsertTaskJob = hook;
  }

  function reset(): void {
    tasks.clear();
    jobs.clear();
    onUpsertTaskJob = undefined;
  }

  return {
    getAllTasks,
    getTask,
    listJobs,
    reset,
    setJobUpsertHook,
    setJobs,
    setTask,
    summarize,
    upsertTask,
    upsertTaskJob,
  };
});

vi.mock("@/lib/server/db", () => ({
  getAllTasks: vi.fn(() => state.getAllTasks()),
  getConfig: getConfigMock,
  getTaskById: vi.fn((taskId: string) => state.getTask(taskId)),
  upsertTask: vi.fn((task: GenerateTask) => state.upsertTask(task)),
  upsertTaskJob: vi.fn((job: TaskJobRecord) => state.upsertTaskJob(job)),
}));

vi.mock("@/lib/server/taskOrchestrator/store", () => ({
  listTaskJobsByTaskId: vi.fn(async (taskId: string) => state.listJobs(taskId)),
  summarizeTaskJobs: vi.fn((taskJobs: TaskJobRecord[]) => state.summarize(taskJobs)),
}));

vi.mock("@/lib/vlmDiagnosis", () => ({
  evaluateVisualDiagnosis: evaluateVisualDiagnosisMock,
  summarizeDiagnosisReport: vi.fn((panels: VisualDiagnosisReport["panels"]) => ({
    problemPanelCount: panels.filter((panel) => panel.status !== "clean").length,
    highSeverityCount: panels.filter((panel) => panel.severity === "high").length,
    actionableCount: panels.filter((panel) =>
      panel.issues.some((issue) => issue.actionability !== "manual_only")).length,
    crossPanelIssueCount: 0,
  })),
}));

function makeConfig(): UserAPIConfigV2 {
  return {
    version: 2,
    llmConfigs: [],
    imageConfigs: [],
    vlmConfigs: [{
      id: "vlm-1",
      name: "Vision Reviewer",
      provider: "custom",
      apiUrl: "http://127.0.0.1:11434/v1",
      model: "vision-model",
      protocolType: "openai-compatible",
    }],
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
    activeImageId: null,
    activeVLMId: "vlm-1",
    updatedAt: "2026-04-05T00:00:00.000Z",
  };
}

function makeTask(overrides: Partial<GenerateTask> = {}): GenerateTask {
  return {
    id: "task-review",
    status: "deep_review_paused",
    progress: 100,
    script: {
      title: "Review Task",
      topic: "Review",
      style: "anime",
      panels: [
        {
          id: 1,
          scene: "Panel 1",
          dialogue: "Dialog 1",
          imagePrompt: "prompt-0",
          imageUrl: "file://panel-0",
          status: "completed",
        },
        {
          id: 2,
          scene: "Panel 2",
          dialogue: "Dialog 2",
          imagePrompt: "prompt-1",
          imageUrl: "file://panel-1",
          status: "completed",
        },
      ],
    },
    visualQualityScore: {
      overall: 6.5,
      panels: [
        {
          panelIndex: 0,
          textImageAlignment: 7,
          styleAdherence: 7,
          artifactScore: 7,
          compositionQuality: 7,
          overall: 7,
          issues: [],
        },
        {
          panelIndex: 1,
          textImageAlignment: 5,
          styleAdherence: 6,
          artifactScore: 5,
          compositionQuality: 5,
          overall: 5.25,
          issues: ["composition mismatch"],
        },
      ],
      retryRecommendations: [
        {
          panelIndex: 1,
          reason: "composition mismatch",
          suggestedFix: "tighten framing",
        },
      ],
      evaluatedAt: "2026-04-05T00:00:00.000Z",
    },
    createdAt: new Date("2026-04-05T00:00:00.000Z"),
    updatedAt: new Date("2026-04-05T00:00:00.000Z"),
    ...overrides,
  };
}

function makeJob(overrides: Partial<TaskJobRecord> = {}): TaskJobRecord {
  return {
    id: "job-review",
    taskId: "task-review",
    kind: "deep_review",
    status: "queued",
    attemptCount: 0,
    payload: {},
    createdAt: "2026-04-05T00:00:00.000Z",
    updatedAt: "2026-04-05T00:00:00.000Z",
    ...overrides,
  };
}

function makeReport(panelIndex: number): VisualDiagnosisReport {
  return {
    schemaVersion: 1,
    generatedAt: "2026-04-05T01:00:00.000Z",
    sourceEvaluatedAt: "2026-04-05T00:00:00.000Z",
    model: {
      provider: "openai-compatible",
      model: "vision-model",
    },
    summary: {
      problemPanelCount: 1,
      highSeverityCount: 1,
      actionableCount: 1,
      crossPanelIssueCount: 0,
    },
    panels: [{
      panelIndex,
      imageUrl: `file://panel-${panelIndex}`,
      promptSnapshot: `prompt-${panelIndex}`,
      status: "issues_found",
      topIssueType: "composition_mismatch",
      severity: "high",
      issues: [{
        issueType: "composition_mismatch",
        severity: "high",
        affectedDimensions: ["compositionQuality"],
        evidence: "Subject is cropped on the left edge.",
        confidence: "high",
        evidenceStrength: "strong",
        falsePositiveRisk: "low",
        actionability: "apply_directly",
      }],
      repair: {
        recommendedMode: "patch",
        rationale: "Tighten framing around the subject.",
        patchPositive: ["tight framing"],
        expectedImprovement: ["better composition"],
      },
    }],
  };
}

describe("reviewRunner", () => {
  beforeEach(() => {
    vi.resetModules();
    state.reset();
    getConfigMock.mockReset();
    evaluateVisualDiagnosisMock.mockReset();
  });

  it("runs queued deep-review jobs and merges targeted reports back into the task", async () => {
    state.setTask(makeTask({
      visualDiagnosisReport: makeReport(0),
      visualDiagnosisState: "succeeded",
      visualDiagnosisStale: true,
    }));
    state.setJobs("task-review", [
      makeJob({
        payload: {
          review: {
            targetPanels: [1],
          },
        },
      }),
    ]);
    getConfigMock.mockReturnValue(makeConfig());
    evaluateVisualDiagnosisMock.mockResolvedValue(makeReport(1));

    const { runTaskDeepReviewQueue } = await import("@/lib/server/taskOrchestrator/reviewRunner");
    await runTaskDeepReviewQueue("task-review");

    const updatedTask = state.getTask("task-review");
    expect(evaluateVisualDiagnosisMock).toHaveBeenCalledWith(
      expect.objectContaining({ panels: expect.any(Array) }),
      expect.objectContaining({ overall: 6.5 }),
      expect.objectContaining({
        apiUrl: "http://127.0.0.1:11434/v1",
        model: "vision-model",
        provider: "openai-compatible",
      }),
      [1],
    );
    expect(updatedTask?.status).toBe("completed");
    expect(updatedTask?.visualDiagnosisState).toBe("succeeded");
    expect(updatedTask?.visualDiagnosisStale).toBe(false);
    expect(updatedTask?.visualDiagnosisReport?.panels.map((panel) => panel.panelIndex)).toEqual([0, 1]);
    expect(updatedTask?.queueSummary).toEqual({
      queued: 0,
      running: 0,
      paused: 0,
      failed: 0,
      attachFailed: 0,
      completed: 1,
      calibrationPending: 0,
    });
    expect(state.listJobs("task-review")).toEqual([
      expect.objectContaining({ id: "job-review", status: "completed" }),
    ]);
  });

  it("lists tasks with replayable deep-review jobs only", async () => {
    state.setTask(makeTask({ id: "task-replayable" }));
    state.setTask(makeTask({ id: "task-paused" }));
    state.setJobs("task-replayable", [
      makeJob({
        taskId: "task-replayable",
        id: "job-replayable",
        status: "queued",
      }),
    ]);
    state.setJobs("task-paused", [
      makeJob({
        taskId: "task-paused",
        id: "job-paused",
        status: "paused",
      }),
    ]);

    const { listReplayableDeepReviewTasks } = await import("@/lib/server/taskOrchestrator/reviewRunner");
    const replayable = await listReplayableDeepReviewTasks();

    expect(replayable).toEqual([{ taskId: "task-replayable" }]);
  });

  it("does not continue already-loaded queued review jobs after pause flips them in storage", async () => {
    state.setTask(makeTask({
      id: "task-review-batch",
      status: "deep_review_running",
    }));
    state.setJobs("task-review-batch", [
      makeJob({
        id: "job-review-1",
        taskId: "task-review-batch",
        panelIndex: 0,
      }),
      makeJob({
        id: "job-review-2",
        taskId: "task-review-batch",
        panelIndex: 1,
      }),
    ]);
    getConfigMock.mockReturnValue(makeConfig());
    evaluateVisualDiagnosisMock.mockImplementationOnce(async () => {
      state.upsertTaskJob({
        ...state.listJobs("task-review-batch")[1],
        status: "paused",
      });
      return makeReport(0);
    });

    const { runTaskDeepReviewQueue } = await import("@/lib/server/taskOrchestrator/reviewRunner");
    await runTaskDeepReviewQueue("task-review-batch");

    expect(evaluateVisualDiagnosisMock).toHaveBeenCalledTimes(1);
    expect(state.listJobs("task-review-batch")).toEqual([
      expect.objectContaining({ id: "job-review-1", status: "completed" }),
      expect.objectContaining({ id: "job-review-2", status: "paused" }),
    ]);
    expect(state.getTask("task-review-batch")).toEqual(expect.objectContaining({
      status: "deep_review_paused",
      queueSummary: expect.objectContaining({ paused: 1, completed: 1 }),
    }));
  });

  it("skips the diagnosis call when pause lands after the runner marks a job active but before evaluation starts", async () => {
    state.setTask(makeTask({
      id: "task-review-race",
      status: "deep_review_running",
    }));
    state.setJobs("task-review-race", [
      makeJob({
        id: "job-review-race",
        taskId: "task-review-race",
        panelIndex: 0,
      }),
    ]);
    getConfigMock.mockReturnValue(makeConfig());
    state.setJobUpsertHook((job) => {
      if (job.id !== "job-review-race" || job.status !== "light_check") {
        return;
      }
      state.setJobUpsertHook(undefined);
      state.upsertTaskJob({
        ...job,
        status: "paused",
      });
    });

    const { runTaskDeepReviewQueue } = await import("@/lib/server/taskOrchestrator/reviewRunner");
    await runTaskDeepReviewQueue("task-review-race");

    expect(evaluateVisualDiagnosisMock).not.toHaveBeenCalled();
    expect(state.listJobs("task-review-race")).toEqual([
      expect.objectContaining({ id: "job-review-race", status: "paused" }),
    ]);
    expect(state.getTask("task-review-race")).toEqual(expect.objectContaining({
      status: "deep_review_paused",
      visualDiagnosisState: "idle",
    }));
  });
});
