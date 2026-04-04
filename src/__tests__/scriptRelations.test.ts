import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import type { Character, CharacterRelation, GenerateTask } from "@/lib/types";

const {
  getTaskMock,
  saveTaskMock,
  notifyListenersMock,
  fetchMock,
  getCharacterMock,
} = vi.hoisted(() => ({
  getTaskMock: vi.fn(),
  saveTaskMock: vi.fn(),
  notifyListenersMock: vi.fn(),
  fetchMock: vi.fn(),
  getCharacterMock: vi.fn(),
}));

vi.mock("@/lib/client/db", () => ({
  getTask: getTaskMock,
  saveTask: saveTaskMock,
  getCharacter: getCharacterMock,
}));

vi.mock("@/lib/client/eventBus", () => ({
  notifyListeners: notifyListenersMock,
  saveTaskThrottled: vi.fn(),
  flushThrottledSave: vi.fn(),
  cleanupTaskState: vi.fn(),
}));

vi.mock("@/lib/concurrency", () => ({ withConcurrency: vi.fn() }));
vi.mock("@/lib/qualityScore", () => ({ evaluateQuality: vi.fn() }));
vi.mock("@/lib/vlmScorer", () => ({ evaluateVisualQuality: vi.fn() }));
vi.mock("@/hooks/useAPIConfig", () => ({ getStoredRequestConfigs: vi.fn() }));

vi.mock("@/lib/llm", () => ({
  generateScript: vi.fn(),
  generateScriptStream: vi.fn(),
  generateTopicResearch: vi.fn(),
  buildEnhancedTopicFromResearch: vi.fn(),
}));

vi.mock("@/lib/imageGen", () => ({ getImageAdapter: vi.fn() }));

vi.mock("@/lib/scriptValidator", () => ({
  validateScript: vi.fn().mockReturnValue({ warnings: [] }),
  applyCanonicalCharacterDesc: vi.fn((s) => s),
}));

vi.mock("@/lib/scriptRepair", () => ({ repairScript: vi.fn() }));
vi.mock("@/lib/director", () => ({
  generateNarrativeOutline: vi.fn(),
  buildOutlineGuidance: vi.fn().mockReturnValue(""),
}));
vi.mock("@/lib/accuracy/claimReview", () => ({
  reviewPanelClaims: vi.fn().mockReturnValue({ status: "pass", panelClaims: [], panels: [], sourceCoverage: {} }),
}));
vi.mock("@/lib/accuracy/repair", () => ({ repairAccuracyIssues: vi.fn() }));
vi.mock("@/lib/guideCharacterPolicy", () => ({
  stripDisallowedGuideCharacterFromScript: vi.fn((s) => s),
}));
vi.mock("@/lib/retryQueue", () => ({ withRetry: vi.fn((fn) => fn()) }));
vi.mock("@/lib/client/imageStore", () => ({ urlToBase64: vi.fn() }));
vi.mock("@/lib/client/promptEnhancer", () => ({
  mergeReferenceImage: vi.fn((p) => p),
  buildEnhancedPromptWithLog: vi.fn((p) => ({ prompt: p, log: [] })),
}));

import { startGeneration } from "@/lib/client/generator";
import { generateScriptStream } from "@/lib/llm";

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

function mockJsonResponse(body: unknown, ok = true) {
  return { ok, json: vi.fn().mockResolvedValue(body) } as unknown as Response;
}

const baseScript = {
  title: "Test",
  topic: "Test topic",
  style: "flat" as const,
  panels: [{ id: 1, scene: "Alice in lab", dialogue: "Hello", imagePrompt: "lab scene", status: "pending" as const }],
};

describe("script phase: relation fetching", () => {
  beforeEach(() => {
    getTaskMock.mockReset();
    saveTaskMock.mockReset();
    notifyListenersMock.mockReset();
    fetchMock.mockReset();
    getCharacterMock.mockReset();
    vi.mocked(generateScriptStream).mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("fetches relations and includes them in character context when characters are provided", async () => {
    const alice = makeCharacter("c1", "Alice");
    const bob = makeCharacter("c2", "Bob");
    const relation = makeRelation("c1", "c2", "ally");
    const unrelatedRelation = makeRelation("c3", "c4", "enemy");

    getCharacterMock.mockImplementation(async (id: string) => {
      if (id === "c1") return alice;
      if (id === "c2") return bob;
      return null;
    });

    let storedTask: GenerateTask | undefined;
    saveTaskMock.mockImplementation(async (task: GenerateTask) => {
      storedTask = task;
    });
    getTaskMock.mockImplementation(async () => storedTask);

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/relations")) {
        return mockJsonResponse([relation, unrelatedRelation]);
      }
      if (url.startsWith("/api/accuracy/research")) {
        return mockJsonResponse({ factPack: null, researchBrief: null });
      }
      return mockJsonResponse({}, false);
    });

    vi.mocked(generateScriptStream).mockResolvedValue(baseScript);

    const taskId = await startGeneration({
      topic: "Test topic",
      style: "flat",
      contentType: "science",
      characterIds: ["c1", "c2"],
    });

    // Wait for async pipeline to complete
    await vi.waitFor(() => {
      expect(storedTask?.status).toBe("script_ready");
    }, { timeout: 2000 });

    // Verify relations API was called
    const fetchCalls = fetchMock.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(fetchCalls).toContain("/api/relations");

    // Verify the script generation received character context with relations
    const streamCall = vi.mocked(generateScriptStream).mock.calls[0];
    const topicArg = streamCall[0] as string;
    expect(topicArg).toContain("CHARACTER RELATIONSHIPS");
    expect(topicArg).toContain("Alice");
    expect(topicArg).toContain("Bob");
    expect(topicArg).toContain("ally");
  });

  it("degrades gracefully when relations API fails", async () => {
    const alice = makeCharacter("c1", "Alice");
    getCharacterMock.mockImplementation(async (id: string) => {
      if (id === "c1") return alice;
      return null;
    });

    let storedTask: GenerateTask | undefined;
    saveTaskMock.mockImplementation(async (task: GenerateTask) => {
      storedTask = task;
    });
    getTaskMock.mockImplementation(async () => storedTask);

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/relations")) {
        throw new Error("Network error");
      }
      if (url.startsWith("/api/accuracy/research")) {
        return mockJsonResponse({ factPack: null, researchBrief: null });
      }
      return mockJsonResponse({}, false);
    });

    vi.mocked(generateScriptStream).mockResolvedValue(baseScript);

    await startGeneration({
      topic: "Test topic",
      style: "flat",
      contentType: "science",
      characterIds: ["c1"],
    });

    await vi.waitFor(() => {
      expect(storedTask?.status).toBe("script_ready");
    }, { timeout: 2000 });

    // Script should still generate successfully without relations
    const streamCall = vi.mocked(generateScriptStream).mock.calls[0];
    const topicArg = streamCall[0] as string;
    expect(topicArg).toContain("CHARACTERS IN THIS STORY");
    expect(topicArg).toContain("Alice");
    // No relations section since API failed
    expect(topicArg).not.toContain("CHARACTER RELATIONSHIPS");
  });

  it("skips relation fetch when no characters are provided", async () => {
    let storedTask: GenerateTask | undefined;
    saveTaskMock.mockImplementation(async (task: GenerateTask) => {
      storedTask = task;
    });
    getTaskMock.mockImplementation(async () => storedTask);

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/relations")) {
        throw new Error("Should not be called");
      }
      if (url.startsWith("/api/accuracy/research")) {
        return mockJsonResponse({ factPack: null, researchBrief: null });
      }
      return mockJsonResponse({}, false);
    });

    vi.mocked(generateScriptStream).mockResolvedValue(baseScript);

    await startGeneration({
      topic: "Test topic",
      style: "flat",
      contentType: "science",
    });

    await vi.waitFor(() => {
      expect(storedTask?.status).toBe("script_ready");
    }, { timeout: 2000 });

    // Verify relations API was NOT called
    const fetchCalls = fetchMock.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(fetchCalls).not.toContain("/api/relations");
  });
});
