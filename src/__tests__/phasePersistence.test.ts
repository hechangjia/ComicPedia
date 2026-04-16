import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerateTask, VisualQualityScore } from "@/lib/types";

const {
  getTaskMock,
  saveTaskMock,
  notifyListenersMock,
  saveTaskThrottledMock,
  flushThrottledSaveMock,
  cleanupTaskStateMock,
  withConcurrencyMock,
  getImageAdapterMock,
  urlToBase64Mock,
  withRetryMock,
  mergeReferenceImageMock,
  buildEnhancedPromptMock,
  buildEnhancedPromptWithLogMock,
  pushImageVersionMock,
  fetchMock,
} = vi.hoisted(() => ({
  getTaskMock: vi.fn(),
  saveTaskMock: vi.fn(),
  notifyListenersMock: vi.fn(),
  saveTaskThrottledMock: vi.fn(),
  flushThrottledSaveMock: vi.fn(),
  cleanupTaskStateMock: vi.fn(),
  withConcurrencyMock: vi.fn(),
  getImageAdapterMock: vi.fn(),
  urlToBase64Mock: vi.fn(),
  withRetryMock: vi.fn(),
  mergeReferenceImageMock: vi.fn(),
  buildEnhancedPromptMock: vi.fn(),
  buildEnhancedPromptWithLogMock: vi.fn(),
  pushImageVersionMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("@/lib/client/db", () => ({
  getTask: getTaskMock,
  saveTask: saveTaskMock,
  getCharacter: vi.fn(),
}));

vi.mock("@/lib/client/eventBus", () => ({
  notifyListeners: notifyListenersMock,
  saveTaskThrottled: saveTaskThrottledMock,
  flushThrottledSave: flushThrottledSaveMock,
  cleanupTaskState: cleanupTaskStateMock,
}));

vi.mock("@/lib/concurrency", () => ({
  withConcurrency: withConcurrencyMock,
}));

vi.mock("@/lib/imageGen", () => ({
  getImageAdapter: getImageAdapterMock,
}));

vi.mock("@/lib/utils", () => ({
  urlToBase64: urlToBase64Mock,
}));

vi.mock("@/lib/retryQueue", () => ({
  withRetry: withRetryMock,
}));

vi.mock("@/lib/client/abortManager", () => ({
  abortControllers: new Map(),
  abortKey: vi.fn((taskId: string, panelIndex: number) => `${taskId}:${panelIndex}`),
}));

vi.mock("@/lib/client/panelManager", () => ({
  pushImageVersion: pushImageVersionMock,
}));

vi.mock("@/lib/client/promptEnhancer", () => ({
  buildEnhancedPrompt: buildEnhancedPromptMock,
  buildEnhancedPromptWithLog: buildEnhancedPromptWithLogMock,
  mergeReferenceImage: mergeReferenceImageMock,
}));

const originalFetch = globalThis.fetch;

function mockJsonResponse(body: unknown, ok: boolean = true) {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function makeImageGenTask(): GenerateTask {
  return {
    id: "task-image-phase",
    status: "script_ready",
    progress: 30,
    createdAt: new Date("2026-04-08T00:00:00.000Z"),
    updatedAt: new Date("2026-04-08T00:00:00.000Z"),
    script: {
      title: "Image Task",
      topic: "Topic",
      style: "anime",
      characterDescription: "hero",
      panels: [
        {
          id: 1,
          scene: "Scene 1",
          dialogue: "Dialogue 1",
          imagePrompt: "Prompt 1",
          status: "pending",
        },
      ],
    },
  };
}

function makeRetryTask(): GenerateTask {
  return {
    id: "task-vlm-phase",
    status: "completed",
    progress: 100,
    createdAt: new Date("2026-04-08T00:00:00.000Z"),
    updatedAt: new Date("2026-04-08T00:00:00.000Z"),
    script: {
      title: "Retry Task",
      topic: "Topic",
      style: "anime",
      panels: [
        {
          id: 1,
          scene: "Scene 1",
          dialogue: "Dialogue 1",
          imagePrompt: "Prompt 1",
          imageUrl: "data:image/png;base64,previous",
          imageVersions: [{ imageUrl: "data:image/png;base64,previous", createdAt: 1 }],
          activeVersionIndex: 0,
          status: "completed",
        },
      ],
    },
  };
}

function makeVisualScore(
  overrides: Partial<VisualQualityScore> = {},
): VisualQualityScore {
  return {
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
    evaluatedAt: "2026-04-08T02:00:00.000Z",
    ...overrides,
  };
}

describe("client phase persistence ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = fetchMock as typeof fetch;

    saveTaskMock.mockResolvedValue(undefined);
    saveTaskThrottledMock.mockResolvedValue(undefined);
    flushThrottledSaveMock.mockResolvedValue(undefined);
    withConcurrencyMock.mockImplementation(async (factories: Array<() => Promise<void>>) => {
      for (const factory of factories) {
        await factory();
      }
    });
    withRetryMock.mockImplementation(async (run: () => Promise<string>) => run());
    mergeReferenceImageMock.mockImplementation((config) => config);
    buildEnhancedPromptMock.mockImplementation((prompt: string) => prompt);
    buildEnhancedPromptWithLogMock.mockImplementation((prompt: string) => ({
      enhanced: prompt,
      original: prompt,
      modifications: [],
    }));
    getImageAdapterMock.mockReturnValue({
      generate: vi.fn().mockResolvedValue("https://example.com/generated.png"),
    });
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it("stores canonical /api/images urls after image phase persistence succeeds", async () => {
    const task = makeImageGenTask();
    let resolveBase64: ((value: string) => void) | undefined;
    let resolveImageSave: ((value: Response) => void) | undefined;

    urlToBase64Mock.mockImplementation(() => new Promise<string>((resolve) => {
      resolveBase64 = resolve;
    }));
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (input === "/api/save-image") {
        return new Promise<Response>((resolve) => {
          resolveImageSave = resolve;
        });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${String(input)}`));
    });

    const { runImageGenPhase } = await import("@/lib/client/phases/imageGen");
    const work = runImageGenPhase(task, { model: "img-1" });

    await vi.waitFor(() => {
      expect(urlToBase64Mock).toHaveBeenCalledTimes(1);
    });
    expect(saveTaskThrottledMock).not.toHaveBeenCalled();

    resolveBase64?.("data:image/png;base64,generated");
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/save-image",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(saveTaskThrottledMock).not.toHaveBeenCalled();

    resolveImageSave?.(mockJsonResponse({
      success: true,
      ref: "file://task-image-phase_panel0_cur",
      url: "/api/images/task-image-phase_panel0_cur",
      key: "task-image-phase_panel0_cur",
    }));
    await work;

    expect(saveTaskThrottledMock).toHaveBeenCalled();
    expect(flushThrottledSaveMock).toHaveBeenCalledWith(task);
    expect(pushImageVersionMock).toHaveBeenCalledWith(
      task.script?.panels[0],
      "/api/images/task-image-phase_panel0_cur",
    );
    expect(task.script?.panels[0]).toEqual(expect.objectContaining({
      status: "completed",
      imageUrl: "/api/images/task-image-phase_panel0_cur",
    }));
  });

  it("stores canonical /api/images urls after VLM retry persistence succeeds", async () => {
    const task = makeRetryTask();
    const visualScore = makeVisualScore();
    const reevaluatedScore = makeVisualScore({
      overall: 8,
      panels: [
        {
          panelIndex: 0,
          textImageAlignment: 8,
          styleAdherence: 8,
          artifactScore: 8,
          compositionQuality: 8,
          overall: 8,
          issues: [],
        },
      ],
      retryRecommendations: [],
      evaluatedAt: "2026-04-08T02:05:00.000Z",
    });
    let resolveBase64: ((value: string) => void) | undefined;
    let resolveImageSave: ((value: Response) => void) | undefined;

    getTaskMock.mockResolvedValue(task);
    urlToBase64Mock.mockImplementation(() => new Promise<string>((resolve) => {
      resolveBase64 = resolve;
    }));
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (input === "/api/save-image") {
        return new Promise<Response>((resolve) => {
          resolveImageSave = resolve;
        });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${String(input)}`));
    });

    let reevaluateResolve: ((value: VisualQualityScore) => void) | undefined;
    const evaluateVisualQualityPromise = new Promise<VisualQualityScore>((resolve) => {
      reevaluateResolve = resolve;
    });
    vi.doMock("@/lib/vlmScorer", () => ({
      evaluateVisualQuality: vi.fn(() => evaluateVisualQualityPromise),
    }));

    const { runAutomaticVisualRetryCycle } = await import("@/lib/client/phases/vlm");
    const work = runAutomaticVisualRetryCycle(task.id, visualScore, undefined, {
      provider: "openai-compatible",
      model: "gpt-4o",
      apiKey: "test-key",
    });

    await vi.waitFor(() => {
      expect(urlToBase64Mock).toHaveBeenCalledTimes(1);
    });
    expect(saveTaskMock).toHaveBeenCalledTimes(1);

    resolveBase64?.("data:image/png;base64,retried");
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/save-image",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(saveTaskMock).toHaveBeenCalledTimes(1);

    resolveImageSave?.(mockJsonResponse({
      success: true,
      ref: "file://task-vlm-phase_panel0_cur",
      url: "/api/images/task-vlm-phase_panel0_cur",
      key: "task-vlm-phase_panel0_cur",
    }));
    reevaluateResolve?.(reevaluatedScore);
    await work;

    expect(saveTaskMock.mock.calls.length).toBeGreaterThan(1);
    expect(pushImageVersionMock).toHaveBeenCalledWith(
      task.script?.panels[0],
      "/api/images/task-vlm-phase_panel0_cur",
    );
    expect(task.script?.panels[0]).toEqual(expect.objectContaining({
      status: "completed",
      imageUrl: "/api/images/task-vlm-phase_panel0_cur",
    }));
  });
});
