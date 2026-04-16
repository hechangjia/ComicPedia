import { describe, expect, it } from "vitest";
import type { FactPack } from "@/lib/types";

function makeBaseFactPack(topic: string, hardFacts: FactPack["hardFacts"], source: {
  url: string;
  domain: string;
  title: string;
  excerpt: string;
}): FactPack {
  return {
    topic,
    queryPlan: {
      hardFactQueries: [topic],
      softFactQueries: [`${topic} overview`],
      fallbackUsed: false,
    },
    hardFacts,
    softFacts: [],
    sourceEntries: [
      {
        id: "anchor-1",
        url: source.url,
        domain: source.domain,
        title: source.title,
        sourceTier: "anchor",
        retrievalMethod: "wikipedia",
        excerpt: source.excerpt,
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

function makeFactPack(): FactPack {
  return makeBaseFactPack("牛顿", [
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
  ], {
    url: "https://zh.wikipedia.org/wiki/%E7%89%9B%E9%A1%BF",
    domain: "zh.wikipedia.org",
    title: "牛顿",
    excerpt: "牛顿出生于1643年，是英国物理学家和数学家。",
  });
}

function makeNewtonIdentityFactPack(): FactPack {
  return makeBaseFactPack("牛顿", [
    {
      id: "fact-person",
      claimType: "person",
      subject: "牛顿",
      predicate: "name",
      object: "艾萨克·牛顿",
      normalizedValue: "艾萨克·牛顿",
      sourceIds: ["anchor-1"],
      confidence: 0.95,
      mustPreserve: true,
    },
    {
      id: "fact-term",
      claimType: "term",
      subject: "牛顿",
      predicate: "identity",
      object: "艾萨克·牛顿是英国物理学家、数学家、天文学家、自然哲学家及辉格党政治人物。",
      normalizedValue: "艾萨克·牛顿是英国物理学家数学家天文学家自然哲学家及辉格党政治人物",
      sourceIds: ["anchor-1"],
      confidence: 0.95,
      mustPreserve: true,
    },
  ], {
    url: "https://zh.wikipedia.org/wiki/%E8%89%BE%E8%90%A8%E5%85%8B%C2%B7%E7%89%9B%E9%A1%BF",
    domain: "zh.wikipedia.org",
    title: "艾萨克·牛顿",
    excerpt: "艾萨克·牛顿爵士 PRS MP 是英国物理学家、数学家、天文学家、自然哲学家及辉格党政治人物。",
  });
}

function makeNewtonCalendarFactPack(): FactPack {
  return makeBaseFactPack("牛顿", [
    {
      id: "fact-date-birth",
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
      id: "fact-date-death",
      claimType: "date",
      subject: "牛顿",
      predicate: "death_year",
      object: "1727",
      normalizedValue: "1727",
      sourceIds: ["anchor-1"],
      confidence: 0.95,
      mustPreserve: true,
    },
  ], {
    url: "https://zh.wikipedia.org/wiki/%E8%89%BE%E8%90%A8%E5%85%8B%C2%B7%E7%89%9B%E9%A1%BF",
    domain: "zh.wikipedia.org",
    title: "艾萨克·牛顿",
    excerpt: "艾萨克·牛顿（儒略历：1642年12月25日—1727年3月20日，格里历：1643年1月4日—1727年3月31日），英国物理学家。",
  });
}

function makeDnaFactPack(): FactPack {
  return makeBaseFactPack("DNA", [
    {
      id: "fact-dna-term",
      claimType: "term",
      subject: "DNA",
      predicate: "definition",
      object: "DNA是遗传信息的主要载体。",
      normalizedValue: "DNA是遗传信息的主要载体",
      sourceIds: ["anchor-1"],
      confidence: 0.95,
      mustPreserve: true,
    },
  ], {
    url: "https://en.wikipedia.org/wiki/DNA",
    domain: "en.wikipedia.org",
    title: "DNA",
    excerpt: "DNA is the molecule that carries genetic information.",
  });
}

function makeDnaSmokeFactPack(): FactPack {
  return makeBaseFactPack("DNA", [
    {
      id: "fact-dna-polymer",
      claimType: "term",
      subject: "DNA",
      predicate: "definition",
      object: "DNA is a polymer composed of two polynucleotide chains",
      normalizedValue: "DNA is a polymer composed of two polynucleotide chains",
      sourceIds: ["anchor-1"],
      confidence: 0.95,
      mustPreserve: true,
    },
    {
      id: "fact-dna-helix",
      claimType: "term",
      subject: "DNA",
      predicate: "structure",
      object: "DNA forms double helix",
      normalizedValue: "DNA forms double helix",
      sourceIds: ["anchor-1"],
      confidence: 0.95,
      mustPreserve: true,
    },
    {
      id: "fact-dna-carry",
      claimType: "term",
      subject: "DNA",
      predicate: "function",
      object: "DNA carries genetic instructions for the development, functioning, growth and reproduction of all known organisms and many viruses",
      normalizedValue: "DNA carries genetic instructions for the development, functioning, growth and reproduction of all known organisms and many viruses",
      sourceIds: ["anchor-1"],
      confidence: 0.95,
      mustPreserve: true,
    },
  ], {
    url: "https://en.wikipedia.org/wiki/DNA",
    domain: "en.wikipedia.org",
    title: "DNA",
    excerpt: "DNA forms double helix and carries genetic instructions.",
  });
}

function makeNuwaFactPack(): FactPack {
  return makeBaseFactPack("女娲", [
    {
      id: "fact-nuwa-term",
      claimType: "term",
      subject: "女娲",
      predicate: "identity",
      object: "女娲是中国上古神话中的创世女神。",
      normalizedValue: "女娲是中国上古神话中的创世女神",
      sourceIds: ["anchor-1"],
      confidence: 0.95,
      mustPreserve: true,
    },
  ], {
    url: "https://zh.wikipedia.org/wiki/%E5%A5%B3%E5%A8%B2",
    domain: "zh.wikipedia.org",
    title: "女娲",
    excerpt: "女娲是中国上古神话中的创世女神。",
  });
}

function makeGunpowderFactPack(): FactPack {
  return makeBaseFactPack("火药", [
    {
      id: "fact-gunpowder-place",
      claimType: "place",
      subject: "火药",
      predicate: "origin_place",
      object: "中国",
      normalizedValue: "中国",
      sourceIds: ["anchor-1"],
      confidence: 0.95,
      mustPreserve: true,
    },
  ], {
    url: "https://zh.wikipedia.org/wiki/%E7%81%AB%E8%8D%AF",
    domain: "zh.wikipedia.org",
    title: "火药",
    excerpt: "火药起源于中国。",
  });
}

function makeThunderFactPack(): FactPack {
  return makeBaseFactPack("为什么会打雷", [
    {
      id: "fact-thunder-term",
      claimType: "term",
      subject: "雷声",
      predicate: "mechanism",
      object: "雷声是闪电使周围空气迅速膨胀产生的声波。",
      normalizedValue: "雷声是闪电使周围空气迅速膨胀产生的声波",
      sourceIds: ["anchor-1"],
      confidence: 0.95,
      mustPreserve: true,
    },
  ], {
    url: "https://zh.wikipedia.org/wiki/%E9%9B%B7",
    domain: "zh.wikipedia.org",
    title: "雷",
    excerpt: "雷声是闪电使空气迅速膨胀产生的声波。",
  });
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

  it("matches honorific-heavy Newton aliases against the canonical person fact", async () => {
    const { reviewPanelClaims } = await import("@/lib/accuracy/claimReview");

    const review = reviewPanelClaims(
      makeScript(["艾萨克·牛顿爵士是英国物理学家。"]),
      makeNewtonIdentityFactPack(),
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

  it("does not treat pronoun-plus-adverb fragments like 他同时 as person claims", async () => {
    const { extractPanelClaims } = await import("@/lib/accuracy/claimReview");

    const panelClaims = extractPanelClaims(
      makeScript(["别只记得苹果，他同时是英国物理学家、数学家、天文学家和自然哲学家。"]),
    );

    expect(panelClaims[0].hardClaims).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "person",
          rawText: "他同时",
        }),
      ]),
    );
  });

  it("prefers the canonical Gregorian year when a mixed-calendar Newton lead includes 1642 and 1643", async () => {
    const { reviewPanelClaims } = await import("@/lib/accuracy/claimReview");

    const review = reviewPanelClaims(
      makeScript(["艾萨克·牛顿爵士（英语：Sir Isaac Newton；儒略历：1642年12月25日—1727年3月20日，格里历：1643年1月4日—1727年3月31日），英国物理学家。"]),
      makeNewtonCalendarFactPack(),
    );

    expect(review.status).toBe("passed");
    expect(review.panelClaims[0].hardClaims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "date",
          rawText: "1643",
          matchStatus: "matched",
        }),
        expect.objectContaining({
          claimType: "date",
          rawText: "1727",
          matchStatus: "matched",
        }),
      ]),
    );
    expect(review.panelClaims[0].hardClaims).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "date",
          rawText: "1642",
        }),
      ]),
    );
  });

  it("matches identity term claims even when honorific tokens are present", async () => {
    const { reviewPanelClaims } = await import("@/lib/accuracy/claimReview");

    const review = reviewPanelClaims(
      makeScript(["艾萨克·牛顿爵士 PRS MP 是英国物理学家、数学家、天文学家、自然哲学家及辉格党政治人物。"]),
      makeNewtonIdentityFactPack(),
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

  it("matches identity term claims after trimming leading discourse phrases", async () => {
    const { reviewPanelClaims } = await import("@/lib/accuracy/claimReview");

    const review = reviewPanelClaims(
      makeScript(["别只记得苹果，他是英国物理学家、数学家、天文学家、自然哲学家及辉格党政治人物。"]),
      makeNewtonIdentityFactPack(),
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

  it("matches identity term claims after trimming causal lead-ins", async () => {
    const { reviewPanelClaims } = await import("@/lib/accuracy/claimReview");

    const review = reviewPanelClaims(
      makeScript(["人们记住他，是因为他是英国物理学家、数学家、天文学家、自然哲学家及辉格党政治人物。"]),
      makeNewtonIdentityFactPack(),
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

  it("matches the 女娲 golden-topic identity claim", async () => {
    const { reviewPanelClaims } = await import("@/lib/accuracy/claimReview");

    const review = reviewPanelClaims(
      makeScript(["女娲是中国上古神话中的创世女神。"]),
      makeNuwaFactPack(),
    );

    expect(review.status).toBe("passed");
    expect(review.panelClaims[0].hardClaims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "term",
          matchStatus: "matched",
          matchedFactId: "fact-nuwa-term",
        }),
      ]),
    );
  });

  it("matches DNA golden-topic claims even when the acronym includes a parenthetical alias", async () => {
    const { reviewPanelClaims } = await import("@/lib/accuracy/claimReview");

    const review = reviewPanelClaims(
      makeScript(["DNA（脱氧核糖核酸）是遗传信息的主要载体。"]),
      makeDnaFactPack(),
    );

    expect(review.status).toBe("passed");
    expect(review.panelClaims[0].hardClaims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "term",
          matchStatus: "matched",
          matchedFactId: "fact-dna-term",
        }),
      ]),
    );
  });

  it("does not block richer DNA term explanations when the fact pack only has one canonical definition fact", async () => {
    const { reviewPanelClaims } = await import("@/lib/accuracy/claimReview");

    const review = reviewPanelClaims(
      makeScript(["DNA是一种由两条多核苷酸链互相缠绕形成的双螺旋聚合物，负责携带遗传指令。"]),
      makeDnaFactPack(),
    );

    expect(review.status).toBe("repair_required");
    expect(review.blockingIssueCount).toBe(0);
    expect(review.panelClaims[0].hardClaims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "term",
          matchStatus: "missing",
        }),
      ]),
    );
  });

  it("matches chinese double-helix explanations against english DNA smoke facts", async () => {
    const { reviewPanelClaims } = await import("@/lib/accuracy/claimReview");

    const review = reviewPanelClaims(
      makeScript(["把DNA拆开看，它是由两条多核苷酸链构成的双螺旋。"]),
      makeDnaSmokeFactPack(),
    );

    expect(review.status).toBe("passed");
    expect(review.panelClaims[0].hardClaims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "term",
          matchStatus: "matched",
          matchedFactId: "fact-dna-helix",
        }),
      ]),
    );
  });

  it("splits blended DNA structure-plus-function lines into matchable term claims", async () => {
    const { reviewPanelClaims } = await import("@/lib/accuracy/claimReview");

    const review = reviewPanelClaims(
      makeScript(["这就是DNA，全名叫脱氧核糖核酸。它是由两条多核苷酸链互相盘绕形成的双螺旋，还携带着已知所有生物和许多病毒的遗传指令。"]),
      makeDnaSmokeFactPack(),
    );

    expect(review.status).toBe("passed");
    expect(review.panelClaims[0].hardClaims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "term",
          matchStatus: "matched",
          matchedFactId: "fact-dna-helix",
        }),
        expect.objectContaining({
          claimType: "term",
          matchStatus: "matched",
          matchedFactId: "fact-dna-carry",
        }),
      ]),
    );
  });

  it("treats dna explainer lead-ins like 把它拆开看 as meta framing instead of unsupported term claims", async () => {
    const { reviewPanelClaims } = await import("@/lib/accuracy/claimReview");

    const review = reviewPanelClaims(
      makeScript(["把它拆开看：DNA是由两条多核苷酸链组成的聚合物，这两条链互相盘绕形成双螺旋。"]),
      makeDnaSmokeFactPack(),
    );

    expect(review.status).toBe("passed");
  });

  it("matches chinese polymer explanations against english DNA smoke facts", async () => {
    const { reviewPanelClaims } = await import("@/lib/accuracy/claimReview");

    const review = reviewPanelClaims(
      makeScript(["把它拆开看，DNA是由两条多核苷酸链组成的聚合物。"]),
      makeDnaSmokeFactPack(),
    );

    expect(review.status).toBe("passed");
    expect(review.panelClaims[0].hardClaims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "term",
          matchStatus: "matched",
          matchedFactId: "fact-dna-polymer",
        }),
      ]),
    );
  });

  it("matches shortened two-polynucleotide-chain dna structure lines against polymer facts", async () => {
    const { reviewPanelClaims } = await import("@/lib/accuracy/claimReview");

    const review = reviewPanelClaims(
      makeScript(["把它拆开看，DNA是由两条多核苷酸链组成的。"]),
      makeDnaSmokeFactPack(),
    );

    expect(review.status).toBe("passed");
    expect(review.panelClaims[0].hardClaims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "term",
          matchStatus: "matched",
          matchedFactId: "fact-dna-polymer",
        }),
      ]),
    );
  });

  it("matches golden-topic event attribution claims when the proposer uses a full-name alias", async () => {
    const { reviewPanelClaims } = await import("@/lib/accuracy/claimReview");

    const review = reviewPanelClaims(
      makeScript(["万有引力理论由艾萨克·牛顿提出。"]),
      makeFactPack(),
    );

    expect(review.status).toBe("passed");
    expect(review.panelClaims[0].hardClaims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "event",
          matchStatus: "matched",
          matchedFactId: "fact-event",
        }),
      ]),
    );
  });

  it("matches golden-topic origin-place claims phrased with 起源于", async () => {
    const { reviewPanelClaims } = await import("@/lib/accuracy/claimReview");

    const review = reviewPanelClaims(
      makeScript(["火药起源于中国。"]),
      makeGunpowderFactPack(),
    );

    expect(review.status).toBe("passed");
    expect(review.panelClaims[0].hardClaims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "place",
          matchStatus: "matched",
          matchedFactId: "fact-gunpowder-place",
        }),
      ]),
    );
  });

  it("matches the thunder golden-topic mechanism claim", async () => {
    const { reviewPanelClaims } = await import("@/lib/accuracy/claimReview");

    const review = reviewPanelClaims(
      makeScript(["雷声是闪电使周围空气迅速膨胀产生的声波。"]),
      makeThunderFactPack(),
    );

    expect(review.status).toBe("passed");
    expect(review.panelClaims[0].hardClaims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "term",
          matchStatus: "matched",
          matchedFactId: "fact-thunder-term",
        }),
      ]),
    );
  });

  it("does not extract process phrases like 同一次放电 as place claims", async () => {
    const { extractPanelClaims } = await import("@/lib/accuracy/claimReview");

    const panelClaims = extractPanelClaims(
      makeScript(["你先看到闪电、后听到雷声，但它们通常来自同一次放电。"]),
    );

    expect(panelClaims[0].hardClaims).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "place",
        }),
      ]),
    );
  });

  it("does not extract generic biological containers like 细胞质中 as place claims", async () => {
    const { extractPanelClaims } = await import("@/lib/accuracy/claimReview");

    const panelClaims = extractPanelClaims(
      makeScript(["原核生物的 DNA 位于细胞质中。"]),
    );

    expect(panelClaims[0].hardClaims).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "place",
        }),
      ]),
    );
  });

  it("does not treat meta narration like 最关键的一点是 as a term claim", async () => {
    const { extractPanelClaims } = await import("@/lib/accuracy/claimReview");

    const panelClaims = extractPanelClaims(
      makeScript(["最关键的一点是：系统阐述万有引力和三大运动定律。"]),
    );

    expect(panelClaims[0].hardClaims).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "term",
        }),
      ]),
    );
  });

  it("does not treat ranking narration like 成就之一，是 as a term claim", async () => {
    const { extractPanelClaims } = await import("@/lib/accuracy/claimReview");

    const panelClaims = extractPanelClaims(
      makeScript(["牛顿最重要的成就之一，是在1687年发表《自然哲学的数学原理》。"]),
    );

    expect(panelClaims[0].hardClaims).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "term",
        }),
      ]),
    );
  });

  it("does not treat ranking narration like 最著名的突破，是 as a term claim", async () => {
    const { extractPanelClaims } = await import("@/lib/accuracy/claimReview");

    const panelClaims = extractPanelClaims(
      makeScript(["牛顿最著名的突破，是在1687年发表《自然哲学的数学原理》。"]),
    );

    expect(panelClaims[0].hardClaims).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "term",
        }),
      ]),
    );
  });

  it("does not treat certainty lead-ins like 不过可以确定的是 as a term claim", async () => {
    const { extractPanelClaims } = await import("@/lib/accuracy/claimReview");

    const panelClaims = extractPanelClaims(
      makeScript(["关于苹果的故事流传很广，不过可以确定的是，艾萨克·牛顿后来成为英国物理学家、数学家、天文学家、自然哲学家及辉格党政治人物。"]),
    );

    expect(panelClaims[0].hardClaims).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "term",
        }),
      ]),
    );
  });

  it("does not treat simple alias-introduction lines like 这就是脱氧核糖核酸（DNA） as term claims", async () => {
    const { extractPanelClaims } = await import("@/lib/accuracy/claimReview");

    const panelClaims = extractPanelClaims(
      makeScript(["这就是脱氧核糖核酸（DNA）。"]),
    );

    expect(panelClaims[0].hardClaims).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "term",
        }),
      ]),
    );
  });

  it("does not treat presenter-style alias introductions like 这位就是艾萨克·牛顿爵士 as term claims", async () => {
    const { extractPanelClaims } = await import("@/lib/accuracy/claimReview");

    const panelClaims = extractPanelClaims(
      makeScript(["这位就是艾萨克·牛顿爵士，英国物理学家、数学家、天文学家和自然哲学家。"]),
    );

    expect(panelClaims[0].hardClaims).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "term",
        }),
      ]),
    );
  });

  it("does not treat legacy-impact framing like 后世记住他的，不只是... as a term claim", async () => {
    const { extractPanelClaims } = await import("@/lib/accuracy/claimReview");

    const panelClaims = extractPanelClaims(
      makeScript(["后世记住他的，不只是苹果故事，更是他作为英国物理学家、数学家、天文学家、自然哲学家及辉格党政治人物的影响。"]),
    );

    expect(panelClaims[0].hardClaims).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "term",
        }),
      ]),
    );
  });
});
