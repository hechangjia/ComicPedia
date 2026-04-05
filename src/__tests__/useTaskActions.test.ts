import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerateTask, VisualDiagnosisReport, VisualQualityScore } from "@/lib/types";
const {
  cancelGenerationMock,
  changeStyleAndRegenerateMock,
  generateAllImagesMock,
  getStoredRequestConfigsMock,
  getTaskMock,
  img2imgGenerateMock,
  notifyListenersMock,
  regeneratePanelMock,
  regenerateRefImageMock,
  regenerateScriptMock,
  reorderPanelsMock,
  saveTaskMock,
  setActiveVersionMock,
  setRefActiveVersionMock,
  updateControlModeMock,
  updatePanelMock,
  updateReferenceEntriesMock,
  updateReferenceImageMock,
  updateReferenceImagesMock,
} = vi.hoisted(() => ({
  cancelGenerationMock: vi.fn(),
  changeStyleAndRegenerateMock: vi.fn(),
  generateAllImagesMock: vi.fn(),
  getStoredRequestConfigsMock: vi.fn(),
  getTaskMock: vi.fn(),
  img2imgGenerateMock: vi.fn(),
  notifyListenersMock: vi.fn(),
  regeneratePanelMock: vi.fn(),
  regenerateRefImageMock: vi.fn(),
  regenerateScriptMock: vi.fn(),
  reorderPanelsMock: vi.fn(),
  saveTaskMock: vi.fn(),
  setActiveVersionMock: vi.fn(),
  setRefActiveVersionMock: vi.fn(),
  updateControlModeMock: vi.fn(),
  updatePanelMock: vi.fn(),
  updateReferenceEntriesMock: vi.fn(),
  updateReferenceImageMock: vi.fn(),
  updateReferenceImagesMock: vi.fn(),
}));

vi.mock("@/lib/client/generator", () => ({
  regeneratePanel: regeneratePanelMock,
  generateAllImages: generateAllImagesMock,
  updatePanel: updatePanelMock,
  cancelGeneration: cancelGenerationMock,
  setActiveVersion: setActiveVersionMock,
  reorderPanels: reorderPanelsMock,
  updateReferenceImage: updateReferenceImageMock,
  updateReferenceImages: updateReferenceImagesMock,
  updateControlMode: updateControlModeMock,
  regenerateRefImage: regenerateRefImageMock,
  img2imgGenerate: img2imgGenerateMock,
  setRefActiveVersion: setRefActiveVersionMock,
  updateReferenceEntries: updateReferenceEntriesMock,
  regenerateScript: regenerateScriptMock,
  changeStyleAndRegenerate: changeStyleAndRegenerateMock,
}));

vi.mock("@/lib/client/db", () => ({
  getTask: getTaskMock,
  saveTask: saveTaskMock,
}));

vi.mock("@/lib/client/eventBus", () => ({
  notifyListeners: notifyListenersMock,
}));

vi.mock("@/hooks/useAPIConfig", () => ({
  getStoredRequestConfigs: getStoredRequestConfigsMock,
}));

import {
  applyDiagnosisInvalidation,
  applyVisualDiagnosisFailureUpdate,
  applyVisualDiagnosisReportUpdate,
  applyVisualQualityScoreUpdate,
  beginVisualRepairExecution,
  completeVisualRepairExecution,
  failVisualRepairExecution,
  useTaskActions,
} from "@/hooks/useTaskActions";

const originalFetch = globalThis.fetch;
const fetchMock = vi.fn();

function makeTask(): GenerateTask {
  return {
    id: "task-actions-diagnosis",
    status: "completed",
    progress: 100,
    script: {
      title: "Diagnosis Task",
      topic: "VLM",
      style: "anime",
      panels: [
        {
          id: 1,
          scene: "Scene 1",
          dialogue: "Dialogue 1",
          imagePrompt: "Prompt 1",
          imageUrl: "data:image/png;base64,panel-1",
          status: "completed",
        },
      ],
    },
    createdAt: new Date("2026-03-27T00:00:00.000Z"),
    updatedAt: new Date("2026-03-27T00:00:00.000Z"),
  };
}

function makeQueueTask(status: GenerateTask["status"] = "image_queue_running"): GenerateTask {
  return {
    ...makeTask(),
    id: "task-actions-queue",
    status,
    queueSummary: {
      queued: 1,
      running: status === "image_queue_running" ? 1 : 0,
      paused: status === "image_queue_paused" ? 1 : 0,
      failed: 0,
      attachFailed: 0,
      completed: 0,
      calibrationPending: 0,
    },
  };
}

function makeActionResponse(
  payload: unknown,
  init: { ok?: boolean; status?: number } = {},
): { ok: boolean; status: number; json: ReturnType<typeof vi.fn> } {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: vi.fn().mockResolvedValue(payload),
  };
}

function renderTaskActionsHook(options: {
  selectedImageId?: string | null;
  selectedLLMId?: string | null;
} = {}) {
  const captureHook = vi.fn();
  const setTask = vi.fn();

  function Harness() {
    captureHook(useTaskActions(
      "task-actions-queue",
      setTask as React.Dispatch<React.SetStateAction<GenerateTask | null>>,
      options.selectedImageId ?? "img-1",
      options.selectedLLMId ?? "llm-1",
    ));
    return null;
  }

  renderToStaticMarkup(React.createElement(Harness));
  const currentHook = captureHook.mock.calls.at(-1)?.[0] as ReturnType<typeof useTaskActions> | undefined;

  if (!currentHook) {
    throw new Error("useTaskActions did not render");
  }

  return { hook: currentHook, setTask };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as typeof fetch;
  saveTaskMock.mockResolvedValue(undefined);
  getStoredRequestConfigsMock.mockImplementation((llmId?: string, imageId?: string) => ({
    llmConfig: llmId ? { model: `${llmId}-model`, temperature: 0.2 } : undefined,
    imageConfig: imageId ? { model: `${imageId}-model`, quality: "fine" } : undefined,
  }));
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

function makeDiagnosisReport(): VisualDiagnosisReport {
  return {
    schemaVersion: 1,
    generatedAt: "2026-03-27T01:10:00.000Z",
    sourceEvaluatedAt: "2026-03-27T01:00:00.000Z",
    model: {
      provider: "openai-compatible",
      model: "gpt-4o",
    },
    summary: {
      problemPanelCount: 1,
      highSeverityCount: 1,
      actionableCount: 1,
      crossPanelIssueCount: 0,
    },
    panels: [
      {
        panelIndex: 0,
        imageUrl: "data:image/png;base64,panel-1",
        promptSnapshot: "Prompt 1",
        status: "issues_found",
        topIssueType: "composition_mismatch",
        severity: "high",
        issues: [
          {
            issueType: "composition_mismatch",
            severity: "high",
            affectedDimensions: ["compositionQuality"],
            evidence: "Main subject is cropped out of frame",
            confidence: "high",
            evidenceStrength: "strong",
            falsePositiveRisk: "low",
            actionability: "confirm_first",
          },
        ],
        repair: {
          recommendedMode: "rewrite",
          rationale: "The framing needs a wider layout.",
          expectedImprovement: ["Keeps the main subject fully visible"],
        },
      },
    ],
  };
}

function makeVisualQualityScore(): VisualQualityScore {
  return {
    overall: 6,
    panels: [
      {
        panelIndex: 0,
        textImageAlignment: 6,
        styleAdherence: 6,
        artifactScore: 5,
        compositionQuality: 6,
        overall: 6,
        issues: ["clarity"],
      },
    ],
    retryRecommendations: [
      {
        panelIndex: 0,
        reason: "clarity",
        suggestedFix: "Increase detail",
      },
    ],
    evaluatedAt: "2026-03-27T02:05:00.000Z",
  };
}

describe("applyVisualDiagnosisReportUpdate", () => {
  it("persists a diagnosis report and marks diagnosis as succeeded", () => {
    const task = makeTask();

    applyVisualDiagnosisReportUpdate(task, makeDiagnosisReport());

    expect(task.visualDiagnosisReport).toBeDefined();
    expect(task.visualDiagnosisState).toBe("succeeded");
    expect(task.visualDiagnosisStale).toBe(false);
    expect(task.lastDiagnosisAt).toBe("2026-03-27T01:10:00.000Z");
  });
});

describe("applyDiagnosisInvalidation", () => {
  it("marks diagnosis stale after a panel edit", () => {
    const task = makeTask();
    applyVisualDiagnosisReportUpdate(task, makeDiagnosisReport());

    task.script!.panels[0].imagePrompt = "Prompt 1 updated";
    applyDiagnosisInvalidation(task);

    expect(task.visualDiagnosisStale).toBe(true);
  });

  it("marks diagnosis stale before regenerate", () => {
    const task = makeTask();
    applyVisualDiagnosisReportUpdate(task, makeDiagnosisReport());

    applyDiagnosisInvalidation(task);

    expect(task.visualDiagnosisStale).toBe(true);
  });

  it("marks diagnosis stale before reorder", () => {
    const task = makeTask();
    applyVisualDiagnosisReportUpdate(task, makeDiagnosisReport());

    applyDiagnosisInvalidation(task);

    expect(task.visualDiagnosisStale).toBe(true);
  });

  it("marks diagnosis stale before style change", () => {
    const task = makeTask();
    applyVisualDiagnosisReportUpdate(task, makeDiagnosisReport());

    task.script!.style = "manga";
    applyDiagnosisInvalidation(task);

    expect(task.visualDiagnosisStale).toBe(true);
  });

  it("marks diagnosis stale before VLM retry", () => {
    const task = makeTask();
    applyVisualDiagnosisReportUpdate(task, makeDiagnosisReport());

    task.script!.panels[0].imagePrompt = "Prompt 1 patched";
    applyDiagnosisInvalidation(task);

    expect(task.visualDiagnosisStale).toBe(true);
  });
});

describe("applyVisualDiagnosisFailureUpdate", () => {
  it("marks diagnosis state as failed without deleting the last report", () => {
    const task = makeTask();
    applyVisualDiagnosisReportUpdate(task, makeDiagnosisReport());

    applyVisualDiagnosisFailureUpdate(task);

    expect(task.visualDiagnosisState).toBe("failed");
    expect(task.visualDiagnosisReport).toBeDefined();
  });
});

describe("applyVisualQualityScoreUpdate", () => {
  it("still preserves the existing visual score projection behavior", () => {
    const task = makeTask();

    applyVisualQualityScoreUpdate(task, {
      overall: 5,
      panels: [
        {
          panelIndex: 0,
          textImageAlignment: 5,
          styleAdherence: 5,
          artifactScore: 4,
          compositionQuality: 5,
          overall: 5,
          issues: ["blurry image"],
        },
      ],
      retryRecommendations: [
        {
          panelIndex: 0,
          reason: "blurry image",
          suggestedFix: "add sharper detail guidance",
        },
      ],
      evaluatedAt: "2026-03-27T01:00:00.000Z",
    });

    expect(task.reviewStatus).toBe("needs_repair");
    expect(task.panelReview?.[0].status).toBe("needs_repair");
    expect(task.lastReviewAt).toBe("2026-03-27T01:00:00.000Z");
  });
});

describe("visual repair execution helpers", () => {
  it("marks execution as running when a repair starts", () => {
    const task = makeTask();
    applyVisualDiagnosisReportUpdate(task, makeDiagnosisReport());

    beginVisualRepairExecution(task, {
      panelIndices: [0],
      mode: "rewrite",
      startedAt: "2026-03-27T02:00:00.000Z",
    });

    expect(task.visualRepairExecution?.status).toBe("running");
    expect(task.visualRepairExecution?.panelIndices).toEqual([0]);
    expect(task.visualRepairExecution?.mode).toBe("rewrite");
    expect(task.visualRepairExecution?.startedAt).toBe("2026-03-27T02:00:00.000Z");
    expect(task.visualDiagnosisStale).toBe(true);
  });

  it("records scores/outcome on success while keeping diagnosis stale", () => {
    const task = makeTask();
    applyVisualDiagnosisReportUpdate(task, makeDiagnosisReport());
    applyVisualQualityScoreUpdate(task, makeVisualQualityScore());

    beginVisualRepairExecution(task, {
      panelIndices: [0],
      mode: "rewrite",
      startedAt: "2026-03-27T02:00:00.000Z",
    });

    const improvedScore: VisualQualityScore = {
      ...makeVisualQualityScore(),
      overall: 8,
      panels: [
        {
          ...makeVisualQualityScore().panels[0],
          artifactScore: 8,
          overall: 8,
          issues: [],
        },
      ],
      evaluatedAt: "2026-03-27T02:10:00.000Z",
    };

    completeVisualRepairExecution(task, improvedScore, "improved", "2026-03-27T02:15:00.000Z");

    expect(task.visualRepairExecution?.status).toBe("completed");
    expect(task.visualRepairExecution?.scoreBefore).toBe(6);
    expect(task.visualRepairExecution?.scoreAfter).toBe(8);
    expect(task.visualRepairExecution?.outcome).toBe("improved");
    expect(task.visualRepairExecution?.finishedAt).toBe("2026-03-27T02:15:00.000Z");
    expect(task.visualDiagnosisStale).toBe(true);
  });

  it("records failed execution state without clearing diagnosis staleness", () => {
    const task = makeTask();
    applyVisualDiagnosisReportUpdate(task, makeDiagnosisReport());

    beginVisualRepairExecution(task, {
      panelIndices: [0],
      mode: "rewrite",
      startedAt: "2026-03-27T02:00:00.000Z",
    });

    failVisualRepairExecution(task, "2026-03-27T02:05:00.000Z");

    expect(task.visualRepairExecution?.status).toBe("failed");
    expect(task.visualRepairExecution?.finishedAt).toBe("2026-03-27T02:05:00.000Z");
    expect(task.visualDiagnosisStale).toBe(true);
  });
});

describe("useTaskActions queue helpers", () => {
  it("posts queue_panel_images with selected indices and syncs the returned task snapshot", async () => {
    const returnedTask = makeQueueTask("image_queue_running");
    fetchMock.mockResolvedValueOnce(makeActionResponse({ success: true, task: returnedTask }));

    const { hook, setTask } = renderTaskActionsHook();
    await hook.handleQueueSelectedPanels([2, 0]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/task-actions-queue/actions",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      action: "queue_panel_images",
      panelIndices: [2, 0],
      imageConfigId: "img-1",
      imageConfig: { model: "img-1-model", quality: "fine" },
      llmConfig: { model: "llm-1-model", temperature: 0.2 },
    });
    expect(saveTaskMock).toHaveBeenCalledWith(returnedTask);
    expect(notifyListenersMock).toHaveBeenCalledWith(returnedTask);
    expect(setTask).toHaveBeenCalledWith(returnedTask);
  });

  it("posts generate_all_images when continuing the remaining queue", async () => {
    fetchMock.mockResolvedValueOnce(makeActionResponse({ success: true, task: makeQueueTask("image_queue_running") }));

    const { hook } = renderTaskActionsHook();
    await hook.handleContinueRemaining();

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      action: "generate_all_images",
      forceAll: false,
      imageConfigId: "img-1",
      imageConfig: { model: "img-1-model", quality: "fine" },
      llmConfig: { model: "llm-1-model", temperature: 0.2 },
    });
  });

  it("posts start_deep_review with the selected VLM config and syncs the returned task snapshot", async () => {
    const returnedTask = makeQueueTask("deep_review_running");
    fetchMock.mockResolvedValueOnce(makeActionResponse({ success: true, task: returnedTask }));

    const { hook, setTask } = renderTaskActionsHook();
    await hook.handleStartDeepReview({
      apiUrl: "https://vlm.example.com/v1",
      apiKey: "secret",
      model: "gpt-4o-mini",
      provider: "openai-compatible",
    }, [0]);

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      action: "start_deep_review",
      panelIndices: [0],
      vlmConfig: {
        apiUrl: "https://vlm.example.com/v1",
        apiKey: "secret",
        model: "gpt-4o-mini",
        provider: "openai-compatible",
      },
    });
    expect(saveTaskMock).toHaveBeenCalledWith(returnedTask);
    expect(notifyListenersMock).toHaveBeenCalledWith(returnedTask);
    expect(setTask).toHaveBeenCalledWith(returnedTask);
  });

  it.each([
    ["pause", "handlePauseQueue"],
    ["resume", "handleResumeQueue"],
  ] as const)("posts %s through the task action route", async (action, handlerName) => {
    fetchMock.mockResolvedValueOnce(makeActionResponse({ success: true, task: makeQueueTask("image_queue_paused") }));

    const { hook } = renderTaskActionsHook();
    await hook[handlerName]();

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ action });
  });

  it("avoids task snapshot sync when queueing a single panel fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(makeActionResponse({ error: "无有效面板" }, { ok: false, status: 400 }));

    const { hook, setTask } = renderTaskActionsHook();
    await hook.handleQueuePanel(1);
    vi.runOnlyPendingTimers();
    vi.useRealTimers();

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      action: "queue_panel_images",
      panelIndices: [1],
      imageConfigId: "img-1",
      imageConfig: { model: "img-1-model", quality: "fine" },
      llmConfig: { model: "llm-1-model", temperature: 0.2 },
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith("Queue single panel failed:", expect.any(Error));
    expect(saveTaskMock).not.toHaveBeenCalled();
    expect(notifyListenersMock).not.toHaveBeenCalled();
    expect(setTask).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("returns false when queueing selected panels fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(makeActionResponse({ error: "队列不可用" }, { ok: false, status: 503 }));

    const { hook } = renderTaskActionsHook();
    await expect(hook.handleQueueSelectedPanels([0, 1])).resolves.toBe(false);
    vi.runOnlyPendingTimers();
    vi.useRealTimers();

    expect(consoleErrorSpy).toHaveBeenCalledWith("Queue selected panels failed:", expect.any(Error));
    consoleErrorSpy.mockRestore();
  });
});
