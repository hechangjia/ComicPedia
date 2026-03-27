import { describe, expect, it } from "vitest";
import type { FactPack } from "@/lib/types";

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
      {
        id: "fact-person",
        claimType: "person",
        subject: "牛顿",
        predicate: "name",
        object: "艾萨克·牛顿",
        normalizedValue: "牛顿",
        sourceIds: ["anchor-1"],
        confidence: 0.95,
        mustPreserve: true,
      },
      {
        id: "fact-term",
        claimType: "term",
        subject: "牛顿",
        predicate: "identity",
        object: "牛顿是英国物理学家和数学家。",
        normalizedValue: "牛顿是英国物理学家和数学家",
        sourceIds: ["anchor-1"],
        confidence: 0.95,
        mustPreserve: true,
      },
      {
        id: "fact-place",
        claimType: "place",
        subject: "牛顿",
        predicate: "birth_place",
        object: "英国林肯郡伍尔索普庄园",
        normalizedValue: "英国林肯郡伍尔索普庄园",
        sourceIds: ["anchor-1"],
        confidence: 0.95,
        mustPreserve: true,
      },
      {
        id: "fact-event",
        claimType: "event",
        subject: "万有引力理论",
        predicate: "attribution",
        object: "万有引力理论由牛顿提出",
        normalizedValue: "万有引力理论由牛顿提出",
        sourceIds: ["anchor-1"],
        confidence: 0.95,
        mustPreserve: true,
      },
    ],
    softFacts: [],
    sourceEntries: [
      {
        id: "anchor-1",
        url: "https://zh.wikipedia.org/wiki/%E7%89%9B%E9%A1%BF",
        domain: "zh.wikipedia.org",
        title: "牛顿",
        sourceTier: "anchor",
        retrievalMethod: "wikipedia",
        excerpt: "牛顿出生于1643年，是英国物理学家和数学家。",
        retrievedAt: "2026-03-27T00:00:00.000Z",
        trustScore: 0.95,
      },
    ],
    coverageGaps: [],
    confidenceSummary: {
      hardFactCoverage: 2,
      softFactCoverage: 0,
      overallRisk: "low",
    },
    recommendedNarrativeAngles: [],
  };
}

function makeScript(dialogues: string[]) {
  return {
    title: "牛顿",
    topic: "牛顿",
    style: "flat" as const,
    panels: dialogues.map((dialogue, index) => ({
      id: index + 1,
      scene: `Scene ${index + 1}`,
      dialogue,
      imagePrompt: `prompt ${index + 1}`,
      status: "pending" as const,
    })),
  };
}

describe("accuracy claim review", () => {
  it("matches normalized hard date claims when the year format is equivalent", async () => {
    const { reviewPanelClaims } = await import("@/lib/accuracy/claimReview");

    const review = reviewPanelClaims(
      makeScript(["牛顿出生于 1643 年。"]),
      makeFactPack(),
    );

    expect(review.status).toBe("passed");
    expect(review.panelClaims[0].hardClaims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "date",
          matchStatus: "matched",
          matchedFactId: "fact-date",
        }),
      ]),
    );
  });

  it("blocks conflicting hard date claims", async () => {
    const { reviewPanelClaims } = await import("@/lib/accuracy/claimReview");

    const review = reviewPanelClaims(
      makeScript(["牛顿出生于 1642 年。"]),
      makeFactPack(),
    );

    expect(review.status).toBe("blocked");
    expect(review.blockingIssueCount).toBe(1);
    expect(review.panelClaims[0].hardClaims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "date",
          matchStatus: "conflicting",
          matchedFactId: "fact-date",
        }),
      ]),
    );
  });

  it("marks unsupported hard assertions as repair_required instead of silently passing", async () => {
    const { reviewPanelClaims } = await import("@/lib/accuracy/claimReview");

    const review = reviewPanelClaims(
      makeScript(["牛顿在 20 岁时就成为皇家学会会长。"]),
      makeFactPack(),
    );

    expect(review.status).toBe("repair_required");
    expect(review.panelClaims[0].unsupportedClaims).toHaveLength(1);
    expect(review.panelClaims[0].hardClaims[0].matchStatus).toBe("missing");
  });

  it("matches normalized term claims when wording differs only by punctuation or conjunction", async () => {
    const { reviewPanelClaims } = await import("@/lib/accuracy/claimReview");

    const review = reviewPanelClaims(
      makeScript(["牛顿是英国物理学家与数学家"]),
      makeFactPack(),
    );

    expect(review.status).toBe("passed");
    expect(review.panelClaims[0].hardClaims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "term",
          matchStatus: "matched",
          matchedFactId: "fact-term",
        }),
      ]),
    );
  });

  it("matches full-name person aliases against the canonical person fact", async () => {
    const { reviewPanelClaims } = await import("@/lib/accuracy/claimReview");

    const review = reviewPanelClaims(
      makeScript(["艾萨克·牛顿是英国物理学家。"]),
      makeFactPack(),
    );

    expect(review.status).toBe("passed");
    expect(review.panelClaims[0].hardClaims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "person",
          matchStatus: "matched",
          matchedFactId: "fact-person",
        }),
      ]),
    );
  });

  it("blocks conflicting person claims", async () => {
    const { reviewPanelClaims } = await import("@/lib/accuracy/claimReview");

    const review = reviewPanelClaims(
      makeScript(["伽利略是提出者。"]),
      makeFactPack(),
    );

    expect(review.status).toBe("blocked");
    expect(review.panelClaims[0].hardClaims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "person",
          matchStatus: "conflicting",
          matchedFactId: "fact-person",
        }),
      ]),
    );
  });

  it("blocks conflicting place claims", async () => {
    const { reviewPanelClaims } = await import("@/lib/accuracy/claimReview");

    const review = reviewPanelClaims(
      makeScript(["牛顿出生于法国巴黎。"]),
      makeFactPack(),
    );

    expect(review.status).toBe("blocked");
    expect(review.panelClaims[0].hardClaims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "place",
          matchStatus: "conflicting",
          matchedFactId: "fact-place",
        }),
      ]),
    );
  });

  it("blocks conflicting event attribution claims", async () => {
    const { reviewPanelClaims } = await import("@/lib/accuracy/claimReview");

    const review = reviewPanelClaims(
      makeScript(["万有引力理论由伽利略提出。"]),
      makeFactPack(),
    );

    expect(review.status).toBe("blocked");
    expect(review.panelClaims[0].hardClaims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "event",
          matchStatus: "conflicting",
          matchedFactId: "fact-event",
        }),
      ]),
    );
  });
});
