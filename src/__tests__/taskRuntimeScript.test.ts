import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Character, GenerateRequest, GenerateTask } from "@/lib/types";

const {
  getTaskByIdMock,
  upsertTaskMock,
  getCharacterByIdMock,
  getAllRelationsMock,
  getSeriesByIdMock,
  getEpisodeArcSnapshotsMock,
  getConfigMock,
  extractTaskImagesAsyncMock,
  listTaskJobsByTaskIdMock,
  summarizeTaskJobsMock,
  enqueueScriptMock,
  generateTopicResearchMock,
  buildEnhancedTopicFromResearchMock,
  runAccuracyResearchMock,
  generateNarrativeOutlineMock,
  generateScriptStreamMock,
  generateScriptMock,
  validateScriptMock,
  applyCanonicalCharacterDescMock,
  repairScriptMock,
  reviewPanelClaimsMock,
  repairAccuracyIssuesMock,
  searchWikipediaMock,
  getWikipediaSummaryMock,
} = vi.hoisted(() => ({
  getTaskByIdMock: vi.fn(),
  upsertTaskMock: vi.fn(),
  getCharacterByIdMock: vi.fn(),
  getAllRelationsMock: vi.fn(),
  getSeriesByIdMock: vi.fn(),
  getEpisodeArcSnapshotsMock: vi.fn(),
  getConfigMock: vi.fn(),
  extractTaskImagesAsyncMock: vi.fn(),
  listTaskJobsByTaskIdMock: vi.fn(),
  summarizeTaskJobsMock: vi.fn(),
  enqueueScriptMock: vi.fn(),
  generateTopicResearchMock: vi.fn(),
  buildEnhancedTopicFromResearchMock: vi.fn(),
  runAccuracyResearchMock: vi.fn(),
  generateNarrativeOutlineMock: vi.fn(),
  generateScriptStreamMock: vi.fn(),
  generateScriptMock: vi.fn(),
  validateScriptMock: vi.fn(),
  applyCanonicalCharacterDescMock: vi.fn(),
  repairScriptMock: vi.fn(),
  reviewPanelClaimsMock: vi.fn(),
  repairAccuracyIssuesMock: vi.fn(),
  searchWikipediaMock: vi.fn(),
  getWikipediaSummaryMock: vi.fn(),
}));

vi.mock("@/lib/server/db", () => ({
  getTasksPaginated: vi.fn(),
  upsertTask: upsertTaskMock,
  clearAllTasks: vi.fn(),
  getAllTaskIds: vi.fn(),
  getTaskById: getTaskByIdMock,
  getCharacterById: getCharacterByIdMock,
  getAllRelations: getAllRelationsMock,
  getSeriesById: getSeriesByIdMock,
  getEpisodeArcSnapshots: getEpisodeArcSnapshotsMock,
  getConfig: getConfigMock,
}));

vi.mock("@/lib/server/imageExtractor", () => ({
  extractTaskImagesAsync: extractTaskImagesAsyncMock,
  fileRefsToUrls: vi.fn((value) => value),
  trashTaskImages: vi.fn(),
}));

vi.mock("@/lib/server/taskOrchestrator/store", () => ({
  listTaskJobsByTaskId: listTaskJobsByTaskIdMock,
  summarizeTaskJobs: summarizeTaskJobsMock,
}));

vi.mock("@/lib/server/taskOrchestrator/runtime", () => ({
  getTaskRuntime: vi.fn(() => ({
    enqueueScript: enqueueScriptMock,
  })),
}));

vi.mock("@/lib/llm", () => ({
  generateTopicResearch: generateTopicResearchMock,
  buildEnhancedTopicFromResearch: buildEnhancedTopicFromResearchMock,
  generateScriptStream: generateScriptStreamMock,
  generateScript: generateScriptMock,
}));

vi.mock("@/lib/accuracy/research", () => ({
  runAccuracyResearch: runAccuracyResearchMock,
}));

vi.mock("@/lib/director", () => ({
  generateNarrativeOutline: generateNarrativeOutlineMock,
}));

vi.mock("@/lib/scriptValidator", () => ({
  validateScript: validateScriptMock,
  applyCanonicalCharacterDesc: applyCanonicalCharacterDescMock,
}));

vi.mock("@/lib/scriptRepair", () => ({
  repairScript: repairScriptMock,
}));

vi.mock("@/lib/accuracy/claimReview", () => ({
  reviewPanelClaims: reviewPanelClaimsMock,
}));

vi.mock("@/lib/accuracy/repair", () => ({
  repairAccuracyIssues: repairAccuracyIssuesMock,
}));

vi.mock("@/lib/server/wikipedia", () => ({
  searchWikipedia: searchWikipediaMock,
  getWikipediaSummary: getWikipediaSummaryMock,
}));

function makeGeneratedScript() {
  return {
    title: "雷电从哪里来",
    topic: "为什么会打雷",
    style: "flat" as const,
    panels: [
      {
        id: 1,
        scene: "小雨看着天空中的闪电",
        dialogue: "为什么会先看到闪电再听到雷声？",
        imagePrompt: "lightning over sky",
        status: "pending" as const,
      },
      {
        id: 2,
        scene: "老师解释空气快速膨胀",
        dialogue: "闪电让空气瞬间升温并膨胀，雷声因此产生。",
        imagePrompt: "teacher explains thunder",
        status: "pending" as const,
      },
    ],
  };
}

function makeRequest(overrides: Partial<GenerateRequest> = {}): GenerateRequest {
  return {
    topic: "为什么会打雷",
    style: "flat",
    contentType: "science",
    quality: "standard",
    panelCount: 2,
    characterIds: ["char-1"],
    llmConfig: {
      model: "gpt-4o",
      provider: "openai-compatible",
    },
    ...overrides,
  };
}

function makeCharacter(): Character {
  return {
    id: "char-1",
    name: "小雨",
    description: "好奇的小学生",
    appearance: {
      gender: "girl",
      age: "10 years old",
      hair: "short black",
      eyes: "brown",
      clothing: "yellow raincoat",
    },
    style: "anime",
    avatarUrl: null,
    referenceEntries: [],
    tags: [],
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
  };
}

describe("task runtime task creation", () => {
  beforeEach(() => {
    vi.resetModules();
    upsertTaskMock.mockReset();
    enqueueScriptMock.mockReset();
    extractTaskImagesAsyncMock.mockReset();
  });

  it("creates a server-owned task for request mode and enqueues scripting", async () => {
    const requestPayload = makeRequest();
    const { POST } = await import("@/app/api/tasks/route");
    const request = new NextRequest("http://localhost:3000/api/tasks", {
      method: "POST",
      body: JSON.stringify({ request: requestPayload }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(upsertTaskMock).toHaveBeenCalledTimes(1);
    const persistedTask = upsertTaskMock.mock.calls[0][0] as GenerateTask;
    expect(persistedTask).toMatchObject({
      id: expect.any(String),
      status: "created",
      progress: 0,
      presetSnapshot: requestPayload.presetSnapshot,
      requestSnapshot: requestPayload,
    });
    expect(persistedTask.createdAt).toBeInstanceOf(Date);
    expect(persistedTask.updatedAt).toBeInstanceOf(Date);
    expect(enqueueScriptMock).toHaveBeenCalledWith(persistedTask.id, requestPayload);
    expect(extractTaskImagesAsyncMock).not.toHaveBeenCalled();
    expect(body).toEqual({
      success: true,
      id: persistedTask.id,
    });
  });
});

describe("runResearchAndScriptTask", () => {
  beforeEach(() => {
    vi.resetModules();
    getTaskByIdMock.mockReset();
    upsertTaskMock.mockReset();
    getCharacterByIdMock.mockReset();
    getAllRelationsMock.mockReset();
    getSeriesByIdMock.mockReset();
    getEpisodeArcSnapshotsMock.mockReset();
    getConfigMock.mockReset();
    generateTopicResearchMock.mockReset();
    buildEnhancedTopicFromResearchMock.mockReset();
    runAccuracyResearchMock.mockReset();
    generateNarrativeOutlineMock.mockReset();
    generateScriptStreamMock.mockReset();
    generateScriptMock.mockReset();
    validateScriptMock.mockReset();
    applyCanonicalCharacterDescMock.mockReset();
    repairScriptMock.mockReset();
    reviewPanelClaimsMock.mockReset();
    repairAccuracyIssuesMock.mockReset();
    searchWikipediaMock.mockReset();
    getWikipediaSummaryMock.mockReset();
  });

  it("runs research and script generation to script_ready for a durable task", async () => {
    let persistedTask: GenerateTask = {
      id: "task-runtime-1",
      status: "created",
      progress: 0,
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    };
    const requestPayload = makeRequest();

    getTaskByIdMock.mockImplementation((id: string) => (id === persistedTask.id ? persistedTask : null));
    upsertTaskMock.mockImplementation((task: GenerateTask) => {
      persistedTask = task;
    });
    getCharacterByIdMock.mockReturnValue(makeCharacter());
    getAllRelationsMock.mockReturnValue([]);
    getSeriesByIdMock.mockReturnValue(null);
    getEpisodeArcSnapshotsMock.mockReturnValue([]);
    getConfigMock.mockReturnValue({
      accuracyConfig: {
        providers: [],
        whitelistDomains: [],
      },
    });
    generateTopicResearchMock.mockResolvedValue({
      originalTopic: requestPayload.topic,
      expandedDescription: "雷电形成机制的科普说明",
      keyFacts: ["雷电来自云层电荷差异"],
      narrativeAngle: "从现象到原理",
      narrativeAngles: [],
      knowledgeMap: { core: [], sub: [], related: [] },
    });
    buildEnhancedTopicFromResearchMock.mockReturnValue("增强主题");
    runAccuracyResearchMock.mockResolvedValue({
      factPack: {
        hardFacts: [
          {
            id: "fact-1",
            claimType: "mechanism",
            subject: "雷电",
            predicate: "cause",
            object: "云层电荷差异",
            normalizedValue: "云层电荷差异",
            sourceIds: ["source-1"],
          },
        ],
        softFacts: [],
        sources: [],
        generatedAt: "2026-04-01T00:00:00.000Z",
      },
      researchBrief: {
        summary: "研究完成",
        safeToGenerate: true,
        verifiedHardFactCount: 1,
        totalHardFactCount: 1,
        keyCoverage: [],
        recommendedConstraints: [],
      },
    });
    generateNarrativeOutlineMock.mockResolvedValue({
      totalPanels: 2,
      templateType: "mechanism",
      source: "beat-plan",
      narrativeArc: "先提出问题，再解释雷电",
      infoDistribution: "progressive",
      characterList: [],
      panels: [
        {
          narrativeFunction: "opening",
          beatRole: "hook",
          suggestedComposition: "close-up",
          shotIntent: "hook-closeup",
          characters: [],
          keyInfo: "闪电与雷声",
          knowledgeGoal: "理解现象",
          infoDensity: "low",
          intensity: "high",
          carryForward: "雷电如何形成",
        },
        {
          narrativeFunction: "development",
          beatRole: "explain",
          suggestedComposition: "medium shot",
          shotIntent: "explain-medium",
          characters: [],
          keyInfo: "电荷差异导致放电",
          knowledgeGoal: "理解成因",
          infoDensity: "medium",
          intensity: "medium",
        },
      ],
    });
    generateScriptStreamMock.mockResolvedValue(makeGeneratedScript());
    generateScriptMock.mockResolvedValue(makeGeneratedScript());
    validateScriptMock.mockReturnValue({
      passed: true,
      characterConsistency: true,
      compositionVariety: true,
      styleAlignment: true,
      languagePurity: true,
      warnings: [],
    });
    reviewPanelClaimsMock.mockReturnValue({
      status: "passed",
      blockingIssueCount: 0,
      repairableIssueCount: 0,
      panelClaims: [],
      panels: [],
      sourceCoverage: { anchor: true, whitelist: false, open_web: false },
    });
    repairScriptMock.mockResolvedValue(null);
    repairAccuracyIssuesMock.mockResolvedValue(null);
    searchWikipediaMock.mockResolvedValue([]);
    getWikipediaSummaryMock.mockResolvedValue(null);
    applyCanonicalCharacterDescMock.mockImplementation(() => {});

    const { runResearchAndScriptTask } = await import("@/lib/server/taskOrchestrator/scriptRunner");
    await runResearchAndScriptTask(persistedTask.id, requestPayload);

    expect(generateTopicResearchMock).toHaveBeenCalledWith(requestPayload.topic, requestPayload.llmConfig);
    expect(runAccuracyResearchMock).toHaveBeenCalledWith({
      topic: requestPayload.topic,
      contentType: requestPayload.contentType,
      wikipediaContent: requestPayload.wikipediaContent,
      accuracyConfig: {
        providers: [],
        whitelistDomains: [],
      },
    });
    expect(generateNarrativeOutlineMock).toHaveBeenCalledWith(
      "增强主题",
      requestPayload.style,
      requestPayload.panelCount,
      requestPayload.llmConfig,
      requestPayload.contentType,
      "雷电形成机制的科普说明",
    );
    expect(applyCanonicalCharacterDescMock).toHaveBeenCalledTimes(1);
    expect(persistedTask.status).toBe("script_ready");
    expect(persistedTask.progress).toBe(30);
    expect(persistedTask.topicResearch?.expandedDescription).toBe("雷电形成机制的科普说明");
    expect(persistedTask.script?.panels[0].appearingCharacters).toEqual(["小雨"]);
    expect(persistedTask.generationConfig).toMatchObject({
      llmModel: "gpt-4o",
      llmProvider: "openai-compatible",
      quality: "standard",
      characterIds: ["char-1"],
    });
  });
});
