import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock callLLM before importing the module under test
vi.mock("@/lib/llm", () => ({
  callLLM: vi.fn(),
}));

import { repairScript } from "@/lib/scriptRepair";
import { callLLM } from "@/lib/llm";
import type { ComicScript, NarrativeOutline } from "@/lib/types";
import type { ScriptWarning } from "@/lib/scriptValidator";

const mockedCallLLM = vi.mocked(callLLM);

function makeScript(overrides?: Partial<ComicScript>): ComicScript {
  return {
    title: "Test Comic",
    topic: "Testing",
    style: "flat",
    panels: [
      { id: 1, scene: "Scene 1", dialogue: "Hello", imagePrompt: "a test scene, flat style", status: "pending" },
      { id: 2, scene: "Scene 2", dialogue: "World", imagePrompt: "another scene, flat style", status: "pending" },
    ],
    ...overrides,
  };
}

function makeWarning(overrides?: Partial<ScriptWarning>): ScriptWarning {
  return {
    severity: "warning",
    dimension: "composition",
    panelIndices: [0, 1],
    message: "Consecutive panels use same composition",
    suggestion: "Use different camera angles",
    ...overrides,
  };
}

function makeBeatPlan(overrides: Partial<NarrativeOutline> = {}): NarrativeOutline {
  return {
    totalPanels: 5,
    templateType: "mechanism",
    source: "beat-plan",
    narrativeArc: "Hook first, then reveal the mechanism",
    infoDistribution: "progressive",
    characterList: [],
    panels: [
      {
        narrativeFunction: "opening",
        beatRole: "hook",
        suggestedComposition: "close-up",
        shotIntent: "hook-closeup",
        characters: [],
        keyInfo: "先展示异常现象",
        knowledgeGoal: "先让读者惊讶",
        infoDensity: "low",
        intensity: "high",
        carryForward: "为什么会这样",
      },
      {
        narrativeFunction: "epilogue",
        beatRole: "closure",
        suggestedComposition: "wide shot",
        shotIntent: "aftermath",
        characters: [],
        keyInfo: "最后留下记忆点",
        knowledgeGoal: "让读者记住结论",
        infoDensity: "medium",
        intensity: "medium",
        carryForward: "none",
      },
    ],
    ...overrides,
  };
}

describe("repairScript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no warnings provided", async () => {
    const result = await repairScript(makeScript(), []);
    expect(result).toBeNull();
    expect(mockedCallLLM).not.toHaveBeenCalled();
  });

  it("calls LLM and returns repaired script on valid response", async () => {
    const repairedPanels = [
      { id: 1, scene: "Scene 1", dialogue: "Hello", imagePrompt: "a test scene, wide shot, flat style" },
      { id: 2, scene: "Scene 2", dialogue: "World", imagePrompt: "another scene, close-up, flat style" },
    ];

    mockedCallLLM.mockResolvedValue(JSON.stringify({
      title: "Test Comic",
      topic: "Testing",
      style: "flat",
      panels: repairedPanels,
    }));

    const script = makeScript();
    const result = await repairScript(script, [makeWarning()]);

    expect(result).not.toBeNull();
    expect(result!.panels).toHaveLength(2);
    expect(result!.panels[0].imagePrompt).toContain("wide shot");
    expect(result!.panels[1].imagePrompt).toContain("close-up");
    // Preserves original fields not in LLM response
    expect(result!.panels[0].status).toBe("pending");
  });

  it("returns null when LLM returns invalid JSON", async () => {
    mockedCallLLM.mockResolvedValue("This is not JSON at all");

    const result = await repairScript(makeScript(), [makeWarning()]);
    expect(result).toBeNull();
  });

  it("returns null when LLM returns wrong panel count", async () => {
    mockedCallLLM.mockResolvedValue(JSON.stringify({
      title: "Test Comic",
      topic: "Testing",
      style: "flat",
      panels: [
        { id: 1, scene: "Only one panel", dialogue: "...", imagePrompt: "..." },
      ],
    }));

    const result = await repairScript(makeScript(), [makeWarning()]);
    expect(result).toBeNull();
  });

  it("returns null when LLM call throws", async () => {
    mockedCallLLM.mockRejectedValue(new Error("LLM unavailable"));

    const result = await repairScript(makeScript(), [makeWarning()]);
    expect(result).toBeNull();
  });

  it("preserves original script metadata (characterDescription, seed, etc.)", async () => {
    const script = makeScript({
      characterDescription: "[Alice: blonde hair, blue eyes]",
      seed: 42,
      referenceImage: "data:image/png;base64,abc",
    });

    mockedCallLLM.mockResolvedValue(JSON.stringify({
      title: "Test Comic",
      topic: "Testing",
      style: "flat",
      panels: [
        { id: 1, scene: "S1", dialogue: "D1", imagePrompt: "fixed prompt 1" },
        { id: 2, scene: "S2", dialogue: "D2", imagePrompt: "fixed prompt 2" },
      ],
    }));

    const result = await repairScript(script, [makeWarning()]);

    expect(result).not.toBeNull();
    expect(result!.characterDescription).toBe("[Alice: blonde hair, blue eyes]");
    expect(result!.seed).toBe(42);
    expect(result!.referenceImage).toBe("data:image/png;base64,abc");
  });

  it("passes llmConfig to callLLM", async () => {
    mockedCallLLM.mockResolvedValue(JSON.stringify({
      title: "Test Comic",
      topic: "Testing",
      style: "flat",
      panels: [
        { id: 1, scene: "S1", dialogue: "D1", imagePrompt: "p1" },
        { id: 2, scene: "S2", dialogue: "D2", imagePrompt: "p2" },
      ],
    }));

    const llmConfig = { apiUrl: "http://localhost:11434", model: "llama3" };
    await repairScript(makeScript(), [makeWarning()], llmConfig);

    expect(mockedCallLLM).toHaveBeenCalledWith(expect.any(String), llmConfig);
  });

  it("extracts JSON from markdown-wrapped response", async () => {
    const json = JSON.stringify({
      title: "Test Comic",
      topic: "Testing",
      style: "flat",
      panels: [
        { id: 1, scene: "S1", dialogue: "D1", imagePrompt: "p1" },
        { id: 2, scene: "S2", dialogue: "D2", imagePrompt: "p2" },
      ],
    });

    mockedCallLLM.mockResolvedValue("```json\n" + json + "\n```");

    const result = await repairScript(makeScript(), [makeWarning()]);
    expect(result).not.toBeNull();
    expect(result!.panels).toHaveLength(2);
  });

  it("includes narrative beat plan context in the repair prompt", async () => {
    mockedCallLLM.mockResolvedValue(JSON.stringify({
      title: "Test Comic",
      topic: "Testing",
      style: "flat",
      panels: [
        { id: 1, scene: "S1", dialogue: "D1", imagePrompt: "p1" },
        { id: 2, scene: "S2", dialogue: "D2", imagePrompt: "p2" },
      ],
    }));

    await repairScript(
      makeScript(),
      [makeWarning({ dimension: "narrative", message: "开场缺少钩子" })],
      undefined,
      { contentType: "science", narrativeOutline: makeBeatPlan() },
    );

    const prompt = mockedCallLLM.mock.calls[0]?.[0] ?? "";
    expect(prompt).toContain("templateType");
    expect(prompt).toContain("hook-closeup");
    expect(prompt).toContain("knowledgeGoal");
  });

  it("tells the model to rewrite affected panels locally instead of rewriting the whole script", async () => {
    mockedCallLLM.mockResolvedValue(JSON.stringify({
      title: "Test Comic",
      topic: "Testing",
      style: "flat",
      panels: [
        { id: 1, scene: "Improved opening", dialogue: "New hook", imagePrompt: "hook close-up" },
        { id: 2, scene: "Scene 2", dialogue: "World", imagePrompt: "another scene, flat style" },
      ],
    }));

    await repairScript(
      makeScript(),
      [makeWarning({ dimension: "narrative", panelIndices: [0], message: "结尾缺少揭示或余波" })],
      undefined,
      { contentType: "science", narrativeOutline: makeBeatPlan() },
    );

    const prompt = mockedCallLLM.mock.calls[0]?.[0] ?? "";
    expect(prompt).toContain("Only rewrite the affected panels");
    expect(prompt).toContain("Preserve unaffected panels");
  });
});
