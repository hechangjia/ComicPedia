import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateAllImages } from "@/lib/client/generator";
import type { GenerateTask, VisualQualityScore } from "@/lib/types";

const {
  getTaskMock,
  saveTaskMock,
  notifyListenersMock,
  saveTaskThrottledMock,
  flushThrottledSaveMock,
  cleanupTaskStateMock,
  withConcurrencyMock,
  evaluateQualityMock,
  evaluateVisualQualityMock,
  getStoredRequestConfigsMock,
  getImageAdapterMock,
  urlToBase64Mock,
  withRetryMock,
  mergeReferenceImageMock,
} = vi.hoisted(() => ({
  getTaskMock: vi.fn(),
  saveTaskMock: vi.fn(),
  notifyListenersMock: vi.fn(),
  saveTaskThrottledMock: vi.fn(),
  flushThrottledSaveMock: vi.fn(),
  cleanupTaskStateMock: vi.fn(),
  withConcurrencyMock: vi.fn(),
  evaluateQualityMock: vi.fn(),
  evaluateVisualQualityMock: vi.fn(),
  getStoredRequestConfigsMock: vi.fn(),
  getImageAdapterMock: vi.fn(),
  urlToBase64Mock: vi.fn(),
  withRetryMock: vi.fn(),
  mergeReferenceImageMock: vi.fn(),
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

vi.mock("@/lib/qualityScore", () => ({
  evaluateQuality: evaluateQualityMock,
}));

vi.mock("@/lib/vlmScorer", () => ({
  evaluateVisualQuality: evaluateVisualQualityMock,
}));

vi.mock("@/hooks/useAPIConfig", () => ({
  getStoredRequestConfigs: getStoredRequestConfigsMock,
}));

vi.mock("@/lib/llm", () => ({
  generateScript: vi.fn(),
  generateScriptStream: vi.fn(),
  generateTopicResearch: vi.fn(),
  buildEnhancedTopicFromResearch: vi.fn(),
}));

vi.mock("@/lib/imageGen", () => ({
  getImageAdapter: getImageAdapterMock,
}));

vi.mock("@/lib/scriptValidator", () => ({
  validateScript: vi.fn(),
  applyCanonicalCharacterDesc: vi.fn((script) => script),
}));

vi.mock("@/lib/scriptRepair", () => ({
  repairScript: vi.fn(),
}));

vi.mock("@/lib/director", () => ({
  generateNarrativeOutline: vi.fn(),
  buildOutlineGuidance: vi.fn(),
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
  pushImageVersion: vi.fn(),
}));

vi.mock("@/lib/client/promptEnhancer", () => ({
  buildEnhancedPrompt: vi.fn(),
  buildEnhancedPromptWithLog: vi.fn(),
  mergeReferenceImage: mergeReferenceImageMock,
}));

function makeVisualScore(overrides: Partial<VisualQualityScore> = {}): VisualQualityScore {
  return {
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
    evaluatedAt: "2026-03-25T02:00:00.000Z",
    ...overrides,
  };
}

function makeTask(): GenerateTask {
  return {
    id: "task-visual-review",
    status: "script_ready",
    progress: 30,
    createdAt: new Date("2026-03-25T00:00:00.000Z"),
    updatedAt: new Date("2026-03-25T00:00:00.000Z"),
    script: {
      title: "Task",
      topic: "Topic",
      style: "anime",
      panels: [
        {
          id: 1,
          scene: "Scene 1",
          dialogue: "Dialogue 1",
          imagePrompt: "Prompt 1",
          imageUrl: "data:image/png;base64,panel-1",
          imageVersions: [{ imageUrl: "data:image/png;base64,panel-1", createdAt: 1 }],
          activeVersionIndex: 0,
          status: "completed",
        },
      ],
    },
    generationConfig: {
      quality: "fine",
      generatedAt: "2026-03-25T00:00:00.000Z",
    },
  };
}

function makePanelScore(
  panelIndex: number,
  overrides: Partial<VisualQualityScore["panels"][number]> = {},
): VisualQualityScore["panels"][number] {
  return {
    panelIndex,
    textImageAlignment: 5,
    styleAdherence: 5,
    artifactScore: 4,
    compositionQuality: 5,
    overall: 5,
    issues: ["blurry image"],
    ...overrides,
  };
}

function makeRetryRecommendation(panelIndex: number) {
  return {
    panelIndex,
    reason: `panel ${panelIndex} is blurry`,
    suggestedFix: "add sharper detail guidance",
  };
}

function makeMultiPanelTask(panelCount: number): GenerateTask {
  return {
    ...makeTask(),
    script: {
      title: "Task",
      topic: "Topic",
      style: "anime",
      panels: Array.from({ length: panelCount }, (_, index) => ({
        id: index + 1,
        scene: `Scene ${index + 1}`,
        dialogue: `Dialogue ${index + 1}`,
        imagePrompt: `Prompt ${index + 1}`,
        imageUrl: `data:image/png;base64,panel-${index + 1}`,
        imageVersions: [{ imageUrl: `data:image/png;base64,panel-${index + 1}`, createdAt: index + 1 }],
        activeVersionIndex: 0,
        status: "completed" as const,
      })),
    },
  };
}

describe("taskLifecycle automatic visual review", () => {
  beforeEach(() => {
    getTaskMock.mockReset();
    saveTaskMock.mockReset();
    notifyListenersMock.mockReset();
    saveTaskThrottledMock.mockReset();
    flushThrottledSaveMock.mockReset();
    cleanupTaskStateMock.mockReset();
    withConcurrencyMock.mockReset();
    evaluateQualityMock.mockReset();
    evaluateVisualQualityMock.mockReset();
    getStoredRequestConfigsMock.mockReset();
    getImageAdapterMock.mockReset();
    urlToBase64Mock.mockReset();
    withRetryMock.mockReset();
    mergeReferenceImageMock.mockReset();

    saveTaskMock.mockResolvedValue(undefined);
    saveTaskThrottledMock.mockResolvedValue(undefined);
    flushThrottledSaveMock.mockResolvedValue(undefined);
    withConcurrencyMock.mockImplementation(async (factories: Array<() => Promise<void>>) => {
      for (const factory of factories) {
        await factory();
      }
    });
    evaluateQualityMock.mockResolvedValue({ overall: 7, suggestions: [] });
    getStoredRequestConfigsMock.mockReturnValue({ vlmConfig: undefined });
    getImageAdapterMock.mockReturnValue({ generate: vi.fn() });
    urlToBase64Mock.mockResolvedValue("data:image/png;base64,retried-panel");
    withRetryMock.mockResolvedValue("https://example.com/retried-panel.png");
    mergeReferenceImageMock.mockImplementation((config) => config);
  });

  it("persists visual review projection onto the refreshed task snapshot after fine generation completes", async () => {
    const initialTask = makeTask();
    const persistedTask = makeTask();
    const visualScore = makeVisualScore();

    getTaskMock
      .mockResolvedValueOnce(initialTask)
      .mockResolvedValueOnce(persistedTask);
    evaluateQualityMock.mockImplementation(() => new Promise(() => {}));
    evaluateVisualQualityMock.mockResolvedValue(visualScore);

    await generateAllImages(initialTask.id, undefined, false, {
      provider: "openai-compatible",
      model: "gpt-4o",
      apiKey: "test-key",
    });

    await vi.waitFor(() => {
      expect(persistedTask.visualQualityScore).toEqual(visualScore);
      expect(persistedTask.panelReview).toEqual([
        { panelIndex: 0, status: "reviewed", score: 8, issues: [] },
      ]);
      expect(persistedTask.reviewStatus).toBe("reviewed");
      expect(persistedTask.lastReviewAt).toBe("2026-03-25T02:00:00.000Z");
      expect(persistedTask.visualRetrySummary).toMatchObject({
        status: "skipped",
        initialOverallScore: 8,
        finalOverallScore: 8,
        attemptedPanels: [],
        outcomes: [],
      });
    });

    expect(initialTask.visualQualityScore).toBeUndefined();
    expect(initialTask.panelReview).toBeUndefined();
    expect(initialTask.reviewStatus).toBeUndefined();
    expect(saveTaskMock).toHaveBeenCalledWith(persistedTask);
    expect(initialTask.status).toBe("completed");
    expect(initialTask.progress).toBe(100);
    expect(cleanupTaskStateMock).toHaveBeenCalledWith(initialTask.id);
  });

  it("updates the refreshed snapshot review projection but preserves an existing retry cycle", async () => {
    const initialTask = makeTask();
    const persistedTask = makeTask();
    const previousSummary = {
      status: "completed" as const,
      startedAt: "2026-03-25T01:00:00.000Z",
      finishedAt: "2026-03-25T01:10:00.000Z",
      initialOverallScore: 4,
      finalOverallScore: 7,
      attemptedPanels: [0],
      outcomes: [{ panelIndex: 0, status: "completed" as const }],
    };
    const visualScore = makeVisualScore({
      overall: 9,
      evaluatedAt: "2026-03-25T03:00:00.000Z",
      panels: [
        {
          panelIndex: 0,
          textImageAlignment: 9,
          styleAdherence: 9,
          artifactScore: 9,
          compositionQuality: 9,
          overall: 9,
          issues: [],
        },
      ],
    });

    persistedTask.visualRetrySummary = previousSummary;
    getTaskMock
      .mockResolvedValueOnce(initialTask)
      .mockResolvedValueOnce(persistedTask);
    evaluateQualityMock.mockImplementation(() => new Promise(() => {}));
    evaluateVisualQualityMock.mockResolvedValue(visualScore);

    await generateAllImages(initialTask.id, undefined, false, {
      provider: "openai-compatible",
      model: "gpt-4o",
      apiKey: "test-key",
    });

    await vi.waitFor(() => {
      expect(persistedTask.visualQualityScore).toEqual(visualScore);
      expect(persistedTask.panelReview).toEqual([
        { panelIndex: 0, status: "reviewed", score: 9, issues: [] },
      ]);
      expect(persistedTask.reviewStatus).toBe("reviewed");
      expect(persistedTask.lastReviewAt).toBe("2026-03-25T03:00:00.000Z");
    });

    expect(persistedTask.visualRetrySummary).toBe(previousSummary);
    expect(saveTaskMock).toHaveBeenCalledWith(persistedTask);
  });

  it("persists a running retry summary before the first automatic retry settles", async () => {
    const initialTask = makeTask();
    const persistedTask = makeTask();
    const visualScore = makeVisualScore({
      overall: 5,
      evaluatedAt: "2026-03-25T04:00:00.000Z",
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
    });
    const pendingRetry = new Promise<string>(() => {});

    getTaskMock
      .mockResolvedValueOnce(initialTask)
      .mockResolvedValueOnce(persistedTask);
    evaluateQualityMock.mockImplementation(() => new Promise(() => {}));
    evaluateVisualQualityMock.mockResolvedValue(visualScore);
    withRetryMock.mockImplementation(() => pendingRetry);

    await generateAllImages(initialTask.id, undefined, false, {
      provider: "openai-compatible",
      model: "gpt-4o",
      apiKey: "test-key",
    });

    await vi.waitFor(() => {
      expect(persistedTask.visualQualityScore).toEqual(visualScore);
      expect(persistedTask.visualRetrySummary).toMatchObject({
        status: "running",
        initialOverallScore: 5,
        attemptedPanels: [0],
        outcomes: [{ panelIndex: 0, status: "retrying" }],
      });
      expect(persistedTask.panelReview).toEqual([
        { panelIndex: 0, status: "retrying", score: 5, issues: ["blurry image"] },
      ]);
      expect(persistedTask.reviewStatus).toBe("needs_repair");
      expect(persistedTask.lastReviewAt).toBe("2026-03-25T04:00:00.000Z");
      expect(persistedTask.script?.panels[0].status).toBe("generating");
      expect(persistedTask.script?.panels[0].imagePrompt).toContain("sharp focus");
    });
  });

  it("restores the original panel prompt when an automatic retry regeneration fails", async () => {
    const initialTask = makeTask();
    const persistedTask = makeTask();
    const originalPrompt = persistedTask.script!.panels[0].imagePrompt;
    const originalImageUrl = persistedTask.script!.panels[0].imageUrl;
    const visualScore = makeVisualScore({
      overall: 5,
      evaluatedAt: "2026-03-25T05:00:00.000Z",
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
    });

    getTaskMock
      .mockResolvedValueOnce(initialTask)
      .mockResolvedValueOnce(persistedTask);
    evaluateQualityMock.mockImplementation(() => new Promise(() => {}));
    evaluateVisualQualityMock.mockResolvedValue(visualScore);
    withRetryMock.mockRejectedValue(new Error("retry generation failed"));

    await generateAllImages(initialTask.id, undefined, false, {
      provider: "openai-compatible",
      model: "gpt-4o",
      apiKey: "test-key",
    });

    await vi.waitFor(() => {
      expect(persistedTask.visualRetrySummary).toMatchObject({
        status: "failed",
        initialOverallScore: 5,
        finalOverallScore: 5,
        attemptedPanels: [0],
        outcomes: [{ panelIndex: 0, status: "failed" }],
      });
      expect(persistedTask.panelReview).toEqual([
        { panelIndex: 0, status: "failed", score: 5, issues: ["blurry image"] },
      ]);
      expect(persistedTask.reviewStatus).toBe("needs_repair");
      expect(persistedTask.script?.panels[0].imageUrl).toBe(originalImageUrl);
      expect(persistedTask.script?.panels[0].imagePrompt).toBe(originalPrompt);
    });
  });

  it("keeps regenerated images but marks the retry cycle failed when re-evaluation fails", async () => {
    const initialTask = makeTask();
    const persistedTask = makeTask();
    const visualScore = makeVisualScore({
      overall: 5,
      evaluatedAt: "2026-03-25T06:00:00.000Z",
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
    });

    getTaskMock
      .mockResolvedValueOnce(initialTask)
      .mockResolvedValueOnce(persistedTask);
    evaluateQualityMock.mockImplementation(() => new Promise(() => {}));
    evaluateVisualQualityMock
      .mockResolvedValueOnce(visualScore)
      .mockRejectedValueOnce(new Error("re-evaluation failed"));
    withRetryMock.mockResolvedValue("https://example.com/retried-panel.png");

    await generateAllImages(initialTask.id, undefined, false, {
      provider: "openai-compatible",
      model: "gpt-4o",
      apiKey: "test-key",
    });

    await vi.waitFor(() => {
      expect(persistedTask.visualRetrySummary).toMatchObject({
        status: "failed",
        initialOverallScore: 5,
        finalOverallScore: 5,
        attemptedPanels: [0],
        outcomes: [{ panelIndex: 0, status: "completed" }],
      });
      expect(persistedTask.panelReview).toEqual([
        { panelIndex: 0, status: "needs_repair", score: 5, issues: ["blurry image"] },
      ]);
      expect(persistedTask.reviewStatus).toBe("needs_repair");
      expect(persistedTask.lastReviewAt).toBe("2026-03-25T06:00:00.000Z");
      expect(persistedTask.script?.panels[0].imageUrl).toBe("data:image/png;base64,retried-panel");
      expect(persistedTask.script?.panels[0].imagePrompt).toContain("sharp focus");
    });
  });

  it("limits automatic retry candidates to the first three panels in deterministic order", async () => {
    const initialTask = makeMultiPanelTask(4);
    const persistedTask = makeMultiPanelTask(4);
    const visualScore = makeVisualScore({
      overall: 5,
      evaluatedAt: "2026-03-25T07:00:00.000Z",
      panels: [
        makePanelScore(3),
        makePanelScore(1),
        makePanelScore(0),
        makePanelScore(2),
      ],
      retryRecommendations: [
        makeRetryRecommendation(3),
        makeRetryRecommendation(1),
        makeRetryRecommendation(0),
        makeRetryRecommendation(2),
      ],
    });
    const pendingRetry = new Promise<string>(() => {});

    getTaskMock
      .mockResolvedValueOnce(initialTask)
      .mockResolvedValueOnce(persistedTask);
    evaluateQualityMock.mockImplementation(() => new Promise(() => {}));
    evaluateVisualQualityMock.mockResolvedValue(visualScore);
    withRetryMock.mockImplementation(() => pendingRetry);

    await generateAllImages(initialTask.id, undefined, false, {
      provider: "openai-compatible",
      model: "gpt-4o",
      apiKey: "test-key",
    });

    await vi.waitFor(() => {
      expect(persistedTask.visualRetrySummary).toMatchObject({
        status: "running",
        attemptedPanels: [0, 1, 2],
        outcomes: [
          { panelIndex: 0, status: "retrying" },
          { panelIndex: 1, status: "retrying" },
          { panelIndex: 2, status: "retrying" },
        ],
      });
      expect(persistedTask.panelReview).toEqual([
        { panelIndex: 0, status: "retrying", score: 5, issues: ["blurry image"] },
        { panelIndex: 1, status: "retrying", score: 5, issues: ["blurry image"] },
        { panelIndex: 2, status: "retrying", score: 5, issues: ["blurry image"] },
        { panelIndex: 3, status: "needs_repair", score: 5, issues: ["blurry image"] },
      ]);
    });
  });

  it("persists the re-evaluated score and completed retry summary after a successful automatic retry cycle", async () => {
    const initialTask = makeTask();
    const persistedTask = makeTask();
    const visualScore = makeVisualScore({
      overall: 5,
      evaluatedAt: "2026-03-25T08:00:00.000Z",
      panels: [makePanelScore(0)],
      retryRecommendations: [makeRetryRecommendation(0)],
    });
    const reevaluatedScore = makeVisualScore({
      overall: 8,
      evaluatedAt: "2026-03-25T08:05:00.000Z",
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
    });

    getTaskMock
      .mockResolvedValueOnce(initialTask)
      .mockResolvedValueOnce(persistedTask);
    evaluateQualityMock.mockImplementation(() => new Promise(() => {}));
    evaluateVisualQualityMock
      .mockResolvedValueOnce(visualScore)
      .mockResolvedValueOnce(reevaluatedScore);
    withRetryMock.mockResolvedValue("https://example.com/retried-panel.png");

    await generateAllImages(initialTask.id, undefined, false, {
      provider: "openai-compatible",
      model: "gpt-4o",
      apiKey: "test-key",
    });

    await vi.waitFor(() => {
      expect(persistedTask.visualQualityScore).toEqual(reevaluatedScore);
      expect(persistedTask.visualRetrySummary).toMatchObject({
        status: "completed",
        initialOverallScore: 5,
        finalOverallScore: 8,
        attemptedPanels: [0],
        outcomes: [{ panelIndex: 0, status: "completed" }],
      });
      expect(persistedTask.panelReview).toEqual([
        { panelIndex: 0, status: "reviewed", score: 8, issues: [] },
      ]);
      expect(persistedTask.reviewStatus).toBe("reviewed");
      expect(persistedTask.lastReviewAt).toBe("2026-03-25T08:05:00.000Z");
      expect(persistedTask.script?.panels[0].imageUrl).toBe("data:image/png;base64,retried-panel");
      expect(persistedTask.script?.panels[0].imagePrompt).toContain("sharp focus");
    });
  });

  it("skips automatic retry when the generated prompt patch is a no-op", async () => {
    const initialTask = makeTask();
    const persistedTask = makeTask();
    const patchedPrompt = [
      "Prompt 1",
      "sharp focus",
      "high detail",
      "crisp lines",
      "best quality",
      "sharp details",
      "well-composed",
      "balanced layout",
      "consistent art style",
      "accurate depiction",
    ].join(", ");
    const existingNegativePrompt = [
      "blurry",
      "low quality",
      "noise",
      "jpeg artifacts",
      "artifacts",
      "distortion",
    ].join(", ");
    initialTask.script!.panels[0].imagePrompt = patchedPrompt;
    persistedTask.script!.panels[0].imagePrompt = patchedPrompt;
    const visualScore = makeVisualScore({
      overall: 5,
      evaluatedAt: "2026-03-25T09:00:00.000Z",
      panels: [makePanelScore(0)],
      retryRecommendations: [makeRetryRecommendation(0)],
    });

    getTaskMock
      .mockResolvedValueOnce(initialTask)
      .mockResolvedValueOnce(persistedTask);
    evaluateQualityMock.mockImplementation(() => new Promise(() => {}));
    evaluateVisualQualityMock.mockResolvedValue(visualScore);

    await generateAllImages(initialTask.id, {
      extraBody: {
        negative_prompt: existingNegativePrompt,
      },
    }, false, {
      provider: "openai-compatible",
      model: "gpt-4o",
      apiKey: "test-key",
    });

    await vi.waitFor(() => {
      expect(persistedTask.visualRetrySummary).toMatchObject({
        status: "skipped",
        initialOverallScore: 5,
        finalOverallScore: 5,
        attemptedPanels: [],
        outcomes: [],
      });
      expect(persistedTask.panelReview).toEqual([
        { panelIndex: 0, status: "needs_repair", score: 5, issues: ["blurry image"] },
      ]);
      expect(persistedTask.reviewStatus).toBe("needs_repair");
      expect(persistedTask.script?.panels[0].imagePrompt).toBe(patchedPrompt);
      expect(withRetryMock).not.toHaveBeenCalled();
    });
  });
});
