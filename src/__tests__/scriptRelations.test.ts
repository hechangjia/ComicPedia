import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Character, CharacterRelation, GenerateRequest, GenerateTask } from "@/lib/types";

const {
  getTaskMock,
  upsertTaskMock,
  getCharacterByIdMock,
  getAllRelationsMock,
  getSeriesByIdMock,
  getEpisodeArcSnapshotsMock,
  getConfigMock,
  generateTopicResearchMock,
  buildEnhancedTopicFromResearchMock,
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
  getTaskMock: vi.fn(),
  upsertTaskMock: vi.fn(),
  getCharacterByIdMock: vi.fn(),
  getAllRelationsMock: vi.fn(),
  getSeriesByIdMock: vi.fn(),
  getEpisodeArcSnapshotsMock: vi.fn(),
  getConfigMock: vi.fn(),
  generateTopicResearchMock: vi.fn(),
  buildEnhancedTopicFromResearchMock: vi.fn(),
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
  getTaskById: getTaskMock,
  upsertTask: upsertTaskMock,
  getCharacterById: getCharacterByIdMock,
  getAllRelations: getAllRelationsMock,
  getSeriesById: getSeriesByIdMock,
  getEpisodeArcSnapshots: getEpisodeArcSnapshotsMock,
  getConfig: getConfigMock,
}));

vi.mock("@/lib/llm", () => ({
  generateScript: generateScriptMock,
  generateScriptStream: generateScriptStreamMock,
  generateTopicResearch: generateTopicResearchMock,
  buildEnhancedTopicFromResearch: buildEnhancedTopicFromResearchMock,
}));

vi.mock("@/lib/scriptValidator", () => ({
  validateScript: validateScriptMock,
  applyCanonicalCharacterDesc: applyCanonicalCharacterDescMock,
}));

vi.mock("@/lib/scriptRepair", () => ({ repairScript: repairScriptMock }));
vi.mock("@/lib/director", () => ({
  generateNarrativeOutline: vi.fn(),
  buildOutlineGuidance: vi.fn().mockReturnValue(""),
}));
vi.mock("@/lib/accuracy/claimReview", () => ({
  reviewPanelClaims: reviewPanelClaimsMock,
}));
vi.mock("@/lib/accuracy/repair", () => ({ repairAccuracyIssues: repairAccuracyIssuesMock }));
vi.mock("@/lib/accuracy/research", () => ({
  runAccuracyResearch: vi.fn(),
}));
vi.mock("@/lib/guideCharacterPolicy", () => ({
  stripDisallowedGuideCharacterFromScript: vi.fn((s) => s),
}));
vi.mock("@/lib/server/wikipedia", () => ({
  searchWikipedia: searchWikipediaMock,
  getWikipediaSummary: getWikipediaSummaryMock,
}));

function makeCharacter(id: string, name: string): Character {
  return {
    id,
    name,
    description: "",
    style: "anime",
    avatarUrl: null,
    referenceEntries: [],
    appearance: { gender: "male", age: "30", hair: "black", eyes: "brown", clothing: "lab coat" },
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as Character;
}

function makeRelation(fromId: string, toId: string, type: string = "friend"): CharacterRelation {
  return {
    id: `rel_${fromId}_${toId}`,
    fromId,
    toId,
    type: type as CharacterRelation["type"],
    label: "Test relation",
    strength: 0.8,
    bidirectional: true,
    evolution: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function makeRequest(overrides: Partial<GenerateRequest> = {}): GenerateRequest {
  return {
    topic: "Test topic",
    style: "flat",
    contentType: "science",
    quality: "fast",
    ...overrides,
  };
}

const baseScript = {
  title: "Test",
  topic: "Test topic",
  style: "flat" as const,
  panels: [{ id: 1, scene: "Alice in lab", dialogue: "Hello", imagePrompt: "lab scene", status: "pending" as const }],
};

describe("script phase: relation fetching", () => {
  beforeEach(() => {
    vi.resetModules();
    getTaskMock.mockReset();
    upsertTaskMock.mockReset();
    getCharacterByIdMock.mockReset();
    getAllRelationsMock.mockReset();
    getSeriesByIdMock.mockReset();
    getEpisodeArcSnapshotsMock.mockReset();
    getConfigMock.mockReset();
    generateTopicResearchMock.mockReset();
    buildEnhancedTopicFromResearchMock.mockReset();
    generateScriptStreamMock.mockReset();
    generateScriptMock.mockReset();
    validateScriptMock.mockReset();
    applyCanonicalCharacterDescMock.mockReset();
    repairScriptMock.mockReset();
    reviewPanelClaimsMock.mockReset();
    repairAccuracyIssuesMock.mockReset();
    searchWikipediaMock.mockReset();
    getWikipediaSummaryMock.mockReset();

    getSeriesByIdMock.mockReturnValue(null);
    getEpisodeArcSnapshotsMock.mockReturnValue([]);
    getConfigMock.mockReturnValue(null);
    generateTopicResearchMock.mockResolvedValue({
      originalTopic: "Test topic",
      expandedDescription: "Expanded topic",
      keyFacts: [],
      narrativeAngle: "Explain it simply",
      narrativeAngles: [],
      knowledgeMap: { core: [], sub: [], related: [] },
    });
    buildEnhancedTopicFromResearchMock.mockReturnValue("Enhanced topic");
    generateScriptStreamMock.mockResolvedValue(baseScript);
    generateScriptMock.mockResolvedValue(baseScript);
    validateScriptMock.mockReturnValue({
      passed: true,
      characterConsistency: true,
      compositionVariety: true,
      styleAlignment: true,
      languagePurity: true,
      warnings: [],
    });
    applyCanonicalCharacterDescMock.mockImplementation(() => {});
    reviewPanelClaimsMock.mockReturnValue({
      status: "passed",
      blockingIssueCount: 0,
      repairableIssueCount: 0,
      panelClaims: [],
      panels: [],
      sourceCoverage: { anchor: false, whitelist: false, open_web: false },
    });
    repairScriptMock.mockResolvedValue(null);
    repairAccuracyIssuesMock.mockResolvedValue(null);
    searchWikipediaMock.mockResolvedValue([]);
    getWikipediaSummaryMock.mockResolvedValue(null);
  });

  it("fetches relations and includes them in character context when characters are provided", async () => {
    const alice = makeCharacter("c1", "Alice");
    const bob = makeCharacter("c2", "Bob");
    const relation = makeRelation("c1", "c2", "ally");
    const unrelatedRelation = makeRelation("c3", "c4", "enemy");

    getCharacterByIdMock.mockImplementation((id: string) => {
      if (id === "c1") return alice;
      if (id === "c2") return bob;
      return null;
    });

    let storedTask: GenerateTask = {
      id: "task-relations-1",
      status: "created",
      progress: 0,
      createdAt: new Date("2026-04-05T00:00:00.000Z"),
      updatedAt: new Date("2026-04-05T00:00:00.000Z"),
    };
    upsertTaskMock.mockImplementation((task: GenerateTask) => {
      storedTask = task;
    });
    getTaskMock.mockImplementation(() => storedTask);
    getAllRelationsMock.mockReturnValue([relation, unrelatedRelation]);

    const { runResearchAndScriptTask } = await import("@/lib/server/taskOrchestrator/scriptRunner");
    await runResearchAndScriptTask(storedTask.id, makeRequest({
      characterIds: ["c1", "c2"],
    }));

    expect(storedTask.status).toBe("script_ready");
    expect(getAllRelationsMock).toHaveBeenCalledTimes(1);
    const streamCall = generateScriptStreamMock.mock.calls[0];
    const topicArg = streamCall[0] as string;
    expect(topicArg).toContain("CHARACTER RELATIONSHIPS");
    expect(topicArg).toContain("Alice");
    expect(topicArg).toContain("Bob");
    expect(topicArg).toContain("ally");
  });

  it("degrades gracefully when relations API fails", async () => {
    const alice = makeCharacter("c1", "Alice");
    getCharacterByIdMock.mockImplementation((id: string) => {
      if (id === "c1") return alice;
      return null;
    });

    let storedTask: GenerateTask = {
      id: "task-relations-2",
      status: "created",
      progress: 0,
      createdAt: new Date("2026-04-05T00:00:00.000Z"),
      updatedAt: new Date("2026-04-05T00:00:00.000Z"),
    };
    upsertTaskMock.mockImplementation((task: GenerateTask) => {
      storedTask = task;
    });
    getTaskMock.mockImplementation(() => storedTask);
    getAllRelationsMock.mockImplementation(() => {
      throw new Error("relations unavailable");
    });

    const { runResearchAndScriptTask } = await import("@/lib/server/taskOrchestrator/scriptRunner");
    await runResearchAndScriptTask(storedTask.id, makeRequest({
      characterIds: ["c1"],
    }));

    expect(storedTask.status).toBe("script_ready");
    const streamCall = generateScriptStreamMock.mock.calls[0];
    const topicArg = streamCall[0] as string;
    expect(topicArg).toContain("CHARACTERS IN THIS STORY");
    expect(topicArg).toContain("Alice");
    expect(topicArg).not.toContain("CHARACTER RELATIONSHIPS");
  });

  it("skips relation fetch when no characters are provided", async () => {
    let storedTask: GenerateTask = {
      id: "task-relations-3",
      status: "created",
      progress: 0,
      createdAt: new Date("2026-04-05T00:00:00.000Z"),
      updatedAt: new Date("2026-04-05T00:00:00.000Z"),
    };
    upsertTaskMock.mockImplementation((task: GenerateTask) => {
      storedTask = task;
    });
    getTaskMock.mockImplementation(() => storedTask);
    getAllRelationsMock.mockImplementation(() => {
      throw new Error("Should not be called");
    });

    const { runResearchAndScriptTask } = await import("@/lib/server/taskOrchestrator/scriptRunner");
    await runResearchAndScriptTask(storedTask.id, makeRequest({ characterIds: undefined }));

    expect(storedTask.status).toBe("script_ready");
    expect(getAllRelationsMock).not.toHaveBeenCalled();
  });
});
