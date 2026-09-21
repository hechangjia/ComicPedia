import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getTaskById,
  deleteTask,
  upsertTask,
  saveConfig,
  listTaskJobsByTaskId,
  patchTask,
  upsertTaskJob,
} from "@/lib/server/db";
import { createEmptyUserConfig } from "@/lib/config/userConfig";
import { startDeepReview } from "@/lib/server/taskOrchestrator/deepReviewRunner";
import { runTaskDeepReviewQueue } from "@/lib/server/taskOrchestrator/reviewRunner";
import {
  pauseTaskJobs,
  resumeTaskJobs,
} from "@/lib/server/taskOrchestrator/reconcile";
import type {
  GenerateTask,
  VisualQualityScore,
  VisualDiagnosisReport,
} from "@/lib/types";
const calls = vi.hoisted(() => ({ score: vi.fn(), diagnosis: vi.fn() }));
vi.mock("@/lib/vlmScorer", () => ({ evaluateVisualQuality: calls.score }));
vi.mock("@/lib/vlmDiagnosis", () => ({
  evaluateVisualDiagnosis: calls.diagnosis,
  summarizeDiagnosisReport: () => ({
    problemPanelCount: 0,
    highSeverityCount: 0,
    actionableCount: 0,
    crossPanelIssueCount: 0,
  }),
}));
function gate<T>() {
  let resolve!: (value: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const score: VisualQualityScore = {
  overall: 8,
  panels: [
    {
      panelIndex: 0,
      overall: 8,
      textImageAlignment: 8,
      styleAdherence: 8,
      artifactScore: 8,
      compositionQuality: 8,
      issues: [],
    },
  ],
  retryRecommendations: [],
  evaluatedAt: "2026-09-20T00:00:00.000Z",
};
const report: VisualDiagnosisReport = {
  schemaVersion: 1,
  generatedAt: "2026-09-20T00:00:00.000Z",
  sourceEvaluatedAt: score.evaluatedAt,
  model: { model: "synthetic", provider: "openai-compatible" },
  summary: {
    problemPanelCount: 0,
    highSeverityCount: 0,
    actionableCount: 0,
    crossPanelIssueCount: 0,
  },
  panels: [],
};
function seed(id: string) {
  const task: GenerateTask = {
    id,
    status: "completed",
    progress: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
    script: {
      title: "synthetic",
      topic: "test",
      style: "flat",
      panels: [
        {
          id: 1,
          scene: "test",
          dialogue: "test",
          imagePrompt: "original",
          imageUrl: "file://original",
          status: "completed",
        },
      ],
    },
  };
  upsertTask(task);
  return task;
}
async function queue(id: string) {
  seed(id);
  await startDeepReview(id, {
    vlmConfig: { configId: "review", configRole: "vlm" },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  calls.score.mockResolvedValue(structuredClone(score));
  calls.diagnosis.mockResolvedValue(structuredClone(report));
  saveConfig({
    ...createEmptyUserConfig(),
    vlmConfigs: [
      {
        id: "review",
        name: "Synthetic",
        provider: "custom",
        protocolType: "openai-compatible",
        apiUrl: "http://127.0.0.1:1234",
        apiKey: "",
        model: "synthetic",
      },
    ],
    activeVLMId: "review",
  });
});
describe("deep review durable lifecycle", () => {
  it("does not resurrect a deletion interleaved with starting a review", async () => {
    seed("start-delete");
    const pending = startDeepReview("start-delete", {
      vlmConfig: { configId: "review", configRole: "vlm" },
    });
    deleteTask("start-delete");
    await pending.catch(() => {});
    expect(getTaskById("start-delete")).toBeNull();
    expect(listTaskJobsByTaskId("start-delete")).toEqual([]);
  });
  it("discards a score when the source image changed", async () => {
    await queue("changed");
    const pending = gate<VisualQualityScore>();
    calls.score.mockReturnValue(pending.promise);
    const running = runTaskDeepReviewQueue("changed");
    await vi.waitFor(() => expect(calls.score).toHaveBeenCalledOnce());
    const task = getTaskById("changed")!;
    task.script!.panels[0].imageUrl = "file://replacement";
    upsertTask(task);
    pending.resolve(score);
    await running;
    expect(getTaskById("changed")?.visualQualityScore).toBeUndefined();
    expect(calls.diagnosis).not.toHaveBeenCalled();
    expect(listTaskJobsByTaskId("changed")[0]).toMatchObject({
      status: "failed",
      lastError: expect.stringContaining("变更"),
    });
  });
  it("does not publish a pending score after pause", async () => {
    await queue("paused");
    const pending = gate<VisualQualityScore>();
    calls.score.mockReturnValue(pending.promise);
    const running = runTaskDeepReviewQueue("paused");
    await vi.waitFor(() => expect(calls.score).toHaveBeenCalledOnce());
    await pauseTaskJobs("paused");
    pending.resolve(score);
    await running;
    expect(getTaskById("paused")?.visualQualityScore).toBeUndefined();
    expect(getTaskById("paused")?.status).toBe("deep_review_paused");
    expect(calls.diagnosis).not.toHaveBeenCalled();
  });
  it("does not mark a restored task failed when an old call rejects", async () => {
    await queue("restored");
    const pending = gate<VisualQualityScore>();
    calls.score.mockReturnValue(pending.promise);
    const running = runTaskDeepReviewQueue("restored");
    await vi.waitFor(() => expect(calls.score).toHaveBeenCalledOnce());
    deleteTask("restored");
    seed("restored");
    pending.reject(new Error("late error"));
    await running;
    expect(getTaskById("restored")).toMatchObject({ status: "completed" });
    expect(getTaskById("restored")?.visualDiagnosisState).toBeUndefined();
    expect(listTaskJobsByTaskId("restored")).toEqual([]);
  });
  it("rejects the older execution after pause/resume and a newer claim", async () => {
    await queue("overlap");
    const pending = gate<VisualQualityScore>();
    calls.score.mockReturnValueOnce(pending.promise);
    const older = runTaskDeepReviewQueue("overlap");
    await vi.waitFor(() => expect(calls.score).toHaveBeenCalledOnce());
    await pauseTaskJobs("overlap");
    await resumeTaskJobs("overlap");
    calls.score.mockResolvedValue({ ...score, overall: 9 });
    await runTaskDeepReviewQueue("overlap");
    pending.resolve({ ...score, overall: 2 });
    await older;
    expect(getTaskById("overlap")?.visualQualityScore?.overall).toBe(9);
    expect(calls.diagnosis).toHaveBeenCalledOnce();
  });
  it("does not recreate deleted tasks or jobs on successful late score", async () => {
    await queue("deleted");
    const pending = gate<VisualQualityScore>();
    calls.score.mockReturnValue(pending.promise);
    const running = runTaskDeepReviewQueue("deleted");
    await vi.waitFor(() => expect(calls.score).toHaveBeenCalledOnce());
    deleteTask("deleted");
    pending.resolve(score);
    await running;
    expect(getTaskById("deleted")).toBeNull();
    expect(listTaskJobsByTaskId("deleted")).toEqual([]);
    expect(calls.diagnosis).not.toHaveBeenCalled();
  });
  it("preserves concurrent tags and does not publish a diagnosis after input edits", async () => {
    await queue("diagnosis-change");
    const pending = gate<VisualDiagnosisReport>();
    calls.diagnosis.mockReturnValue(pending.promise);
    const running = runTaskDeepReviewQueue("diagnosis-change");
    await vi.waitFor(() => expect(calls.diagnosis).toHaveBeenCalledOnce());
    const task = getTaskById("diagnosis-change")!;
    task.script!.panels[0].imagePrompt = "new prompt";
    upsertTask(task);
    patchTask(task.id, { tags: ["keep"], favorited: true });
    pending.resolve(report);
    await running;
    expect(getTaskById(task.id)?.visualDiagnosisReport).toBeUndefined();
    expect(getTaskById(task.id)).toMatchObject({
      tags: ["keep"],
      favorited: true,
    });
  });
});

// Lifecycle tests control model completion; physical images and transport are covered
// without mocks in reviewHttpIntegration.test.ts.
vi.mock("@/lib/server/visionRuntime", () => ({
  createServerVisionRuntime: (checkpoint: () => void) => ({
    checkpoint,
    strict: true,
    captureImages: async () => "synthetic-media",
    verifyImages: async () => {
      checkpoint();
    },
  }),
}));

describe("queue action deletion interleavings", () => {
  it.each(["pause", "resume", "reconcile"] as const)(
    "does not resurrect a deleted task during %s",
    async (action) => {
      const id = `transition-${action}`;
      await queue(id);
      if (action === "resume") await pauseTaskJobs(id);
      const { reconcileTaskJobs } = await import(
        "@/lib/server/taskOrchestrator/reconcile"
      );
      const pending =
        action === "pause"
          ? pauseTaskJobs(id)
          : action === "resume"
            ? resumeTaskJobs(id)
            : reconcileTaskJobs(id);
      deleteTask(id);
      await pending.catch(() => {});
      expect(getTaskById(id)).toBeNull();
      expect(listTaskJobsByTaskId(id)).toEqual([]);
    },
  );
});

it("does not carry unversioned diagnosis panels into a newly verified report", async () => {
  await queue("legacy-report");
  const task = getTaskById("legacy-report")!;
  task.visualDiagnosisReport = {
    ...report,
    panels: [
      {
        panelIndex: 0,
        imageUrl: "file://original",
        promptSnapshot: "original",
        status: "clean",
        topIssueType: "none",
        severity: "low",
        issues: [],
        repair: {
          recommendedMode: "manual",
          rationale: "legacy",
          expectedImprovement: [],
        },
      },
    ],
  };
  upsertTask(task);
  await runTaskDeepReviewQueue(task.id);
  expect(getTaskById(task.id)?.visualDiagnosisReport?.panels).toEqual([]);
});

it("reports queued review as running until execution or pause rather than idle", async () => {
  await queue("queued-state");
  expect(getTaskById("queued-state")?.visualDiagnosisState).toBe("running");
  await pauseTaskJobs("queued-state");
  expect(getTaskById("queued-state")?.visualDiagnosisState).toBe("idle");
});

it("does not revive execution ownership from restored task/job payloads", async () => {
  await queue("restore-with-job");
  const pending = gate<VisualQualityScore>();
  calls.score.mockReturnValue(pending.promise);
  const running = runTaskDeepReviewQueue("restore-with-job");
  await vi.waitFor(() => expect(calls.score).toHaveBeenCalledOnce());
  const task = getTaskById("restore-with-job")!;
  const jobs = listTaskJobsByTaskId(task.id);
  deleteTask(task.id);
  upsertTask(task);
  jobs.forEach(upsertTaskJob);
  pending.resolve(score);
  await running;
  expect(getTaskById(task.id)?.visualQualityScore).toBeUndefined();
  expect(calls.diagnosis).not.toHaveBeenCalled();
});
