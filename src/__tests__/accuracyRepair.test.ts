import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccuracyReviewResult, FactPack } from "@/lib/types";

const { callLLMMock } = vi.hoisted(() => ({
  callLLMMock: vi.fn(),
}));

vi.mock("@/lib/llm", () => ({
  callLLM: callLLMMock,
}));

function makeScript() {
  return {
    title: "牛顿",
    topic: "牛顿",
    style: "flat" as const,
    panels: [
      {
        id: 1,
        scene: "Scene 1",
        dialogue: "牛顿出生于1642年。",
        imagePrompt: "prompt 1",
        status: "pending" as const,
      },
      {
        id: 2,
        scene: "Scene 2",
        dialogue: "苹果故事很有名。",
        imagePrompt: "prompt 2",
        status: "pending" as const,
      },
    ],
  };
}

function makeFactPack(): FactPack {
  return {
    topic: "牛顿",
    queryPlan: {
      hardFactQueries: ["牛顿"],
      softFactQueries: ["牛顿 overview"],
      fallbackUsed: false,
    },
    hardFacts: [
      {
        id: "fact-date",
        claimType: "date",
        subject: "牛顿",
        predicate: "birth_year",
        object: "1643",
        normalizedValue: "1643",
        sourceIds: ["anchor-1"],
        confidence: 0.95,
        mustPreserve: true,
      },
    ],
    softFacts: [],
    sourceEntries: [],
    coverageGaps: [],
    confidenceSummary: {
      hardFactCoverage: 1,
      softFactCoverage: 0,
      overallRisk: "low",
    },
    recommendedNarrativeAngles: [],
  };
}

function makeReview(): AccuracyReviewResult {
  return {
    status: "repair_required" as const,
    blockingIssueCount: 0,
    repairableIssueCount: 1,
    panelClaims: [
      {
        panelIndex: 0,
        hardClaims: [
            {
            claimType: "date",
            rawText: "1642年",
            normalizedValue: "1642",
            matchedFactId: "fact-date",
            matchStatus: "conflicting",
          },
        ],
        unsupportedClaims: [],
        riskLevel: "high",
      },
    ],
    panels: [],
    sourceCoverage: {
      anchor: true,
      whitelist: false,
      open_web: false,
    },
  };
}

describe("accuracy repair", () => {
  beforeEach(() => {
    callLLMMock.mockReset();
  });

  it("replaces wrong hard facts with canonical fact pack values while preserving unaffected panels", async () => {
    const { repairAccuracyIssues } = await import("@/lib/accuracy/repair");

    callLLMMock.mockResolvedValue(JSON.stringify({
      panels: [
        { id: 1, scene: "Scene 1", dialogue: "牛顿出生于1643年。", imagePrompt: "prompt 1" },
        { id: 2, scene: "Scene 2", dialogue: "苹果故事很有名。", imagePrompt: "prompt 2" },
      ],
    }));

    const repaired = await repairAccuracyIssues(makeScript(), makeReview(), makeFactPack());

    expect(repaired?.panels[0].dialogue).toContain("1643");
    expect(repaired?.panels[1].dialogue).toBe("苹果故事很有名。");
  });

  it("returns null when the repair response changes panel count", async () => {
    const { repairAccuracyIssues } = await import("@/lib/accuracy/repair");

    callLLMMock.mockResolvedValue(JSON.stringify({
      panels: [
        { id: 1, scene: "Scene 1", dialogue: "牛顿出生于1643年。", imagePrompt: "prompt 1" },
      ],
    }));

    const repaired = await repairAccuracyIssues(makeScript(), makeReview(), makeFactPack());
    expect(repaired).toBeNull();
  });

  it("tells the repair model to delete unsupported hard details and stay close to canonical term wording", async () => {
    const { repairAccuracyIssues } = await import("@/lib/accuracy/repair");

    callLLMMock.mockResolvedValue(JSON.stringify({
      panels: [
        { id: 1, scene: "Scene 1", dialogue: "牛顿出生于1643年。", imagePrompt: "prompt 1" },
        { id: 2, scene: "Scene 2", dialogue: "苹果故事很有名。", imagePrompt: "prompt 2" },
      ],
    }));

    await repairAccuracyIssues(makeScript(), makeReview(), makeFactPack());

    expect(callLLMMock).toHaveBeenCalledTimes(1);
    const [prompt] = callLLMMock.mock.calls[0];
    expect(prompt).toContain("Delete unsupported years, dates, places, attributions, or hard-detail clauses");
    expect(prompt).toContain("stay as close as possible to the canonical fact wording");
  });
});
