import { describe, it, expect } from "vitest";
import type { FactPack, NarrativeOutline } from "@/lib/types";
import { getContentHandler, getRegisteredTypes, isRegisteredType, registerContentType } from "@/lib/contentRegistry";

function makeBeatPlan(): NarrativeOutline {
  return {
    totalPanels: 5,
    templateType: "mechanism",
    source: "beat-plan",
    narrativeArc: "Start with a hook, then progressively reveal the mechanism",
    infoDistribution: "progressive",
    characterList: [],
    panels: [
      {
        narrativeFunction: "opening",
        beatRole: "hook",
        suggestedComposition: "close-up",
        shotIntent: "hook-closeup",
        characters: [],
        keyInfo: "先展示让读者惊讶的现象",
        knowledgeGoal: "先让读者产生问题",
        infoDensity: "low",
        intensity: "high",
        carryForward: "为什么会这样",
      },
      {
        narrativeFunction: "development",
        beatRole: "progression",
        suggestedComposition: "medium shot",
        shotIntent: "contrast",
        characters: [],
        keyInfo: "对比旧直觉和真实机制",
        knowledgeGoal: "看见错误直觉的局限",
        infoDensity: "medium",
        intensity: "medium",
        carryForward: "真正机制是什么",
      },
      {
        narrativeFunction: "climax",
        beatRole: "reveal",
        suggestedComposition: "dynamic",
        shotIntent: "reveal",
        characters: [],
        keyInfo: "揭示核心原理",
        knowledgeGoal: "理解关键知识点",
        infoDensity: "high",
        intensity: "high",
        carryForward: "会产生什么影响",
      },
      {
        narrativeFunction: "resolution",
        beatRole: "progression",
        suggestedComposition: "wide shot",
        shotIntent: "process",
        characters: [],
        keyInfo: "推进结果与后果",
        knowledgeGoal: "将原理和结果连接起来",
        infoDensity: "medium",
        intensity: "medium",
        carryForward: "最后应该记住什么",
      },
      {
        narrativeFunction: "epilogue",
        beatRole: "closure",
        suggestedComposition: "wide shot",
        shotIntent: "aftermath",
        characters: [],
        keyInfo: "用余波收束记忆点",
        knowledgeGoal: "记住最终结论",
        infoDensity: "low",
        intensity: "medium",
        carryForward: "none",
      },
    ],
  };
}

function makeFactPack(): FactPack {
  return {
    topic: "DNA",
    queryPlan: {
      hardFactQueries: ["DNA"],
      softFactQueries: ["DNA overview"],
      fallbackUsed: false,
    },
    hardFacts: [
      {
        id: "fact-1",
        claimType: "term",
        subject: "DNA",
        predicate: "definition",
        object: "DNA stands for deoxyribonucleic acid.",
        normalizedValue: "dna stands for deoxyribonucleic acid.",
        sourceIds: ["anchor-1"],
        confidence: 0.95,
        mustPreserve: true,
      },
      {
        id: "fact-2",
        claimType: "date",
        subject: "DNA",
        predicate: "year",
        object: "1869",
        normalizedValue: "1869",
        sourceIds: ["anchor-1"],
        confidence: 0.9,
        mustPreserve: true,
      },
    ],
    softFacts: [
      {
        id: "soft-1",
        summary: "DNA carries hereditary information in living organisms.",
        evidenceLevel: "strong",
        sourceIds: ["anchor-1"],
        rewriteFlexibility: "low",
      },
    ],
    sourceEntries: [
      {
        id: "anchor-1",
        url: "https://en.wikipedia.org/wiki/DNA",
        domain: "en.wikipedia.org",
        title: "DNA",
        sourceTier: "anchor",
        retrievalMethod: "wikipedia",
        excerpt: "DNA stands for deoxyribonucleic acid. DNA was first isolated in 1869.",
        retrievedAt: "2026-03-27T00:00:00.000Z",
        trustScore: 0.95,
      },
    ],
    coverageGaps: [
      {
        question: "Do not invent unsupported historical anecdotes.",
        missingType: "hard_fact",
        severity: "warning",
        reason: "unsupported hard detail should stay out of the script",
      },
    ],
    confidenceSummary: {
      hardFactCoverage: 2,
      softFactCoverage: 1,
      overallRisk: "medium",
    },
    recommendedNarrativeAngles: ["Show how heredity information is stored"],
  };
}

describe("contentRegistry", () => {
  describe("getRegisteredTypes", () => {
    it("returns all built-in content types", () => {
      const types = getRegisteredTypes();
      expect(types).toContain("science");
      expect(types).toContain("poetry");
      expect(types).toContain("xiaohongshu");
      expect(types).toContain("novel");
      expect(types).toContain("wikipedia");
      expect(types.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe("isRegisteredType", () => {
    it("returns true for known types", () => {
      expect(isRegisteredType("science")).toBe(true);
      expect(isRegisteredType("poetry")).toBe(true);
      expect(isRegisteredType("wikipedia")).toBe(true);
    });

    it("returns false for unknown types", () => {
      expect(isRegisteredType("nonexistent")).toBe(false);
      expect(isRegisteredType("")).toBe(false);
    });
  });

  describe("getContentHandler", () => {
    it("returns handler for each registered type", () => {
      for (const type of getRegisteredTypes()) {
        const handler = getContentHandler(type);
        expect(handler).toBeDefined();
        expect(typeof handler.buildPrompt).toBe("function");
        expect(typeof handler.parseResponse).toBe("function");
      }
    });

    it("falls back to science for undefined/unknown type", () => {
      const handler = getContentHandler(undefined);
      const scienceHandler = getContentHandler("science");
      expect(handler).toBe(scienceHandler);

      const unknownHandler = getContentHandler("nonexistent" as never);
      expect(unknownHandler).toBe(scienceHandler);
    });

    it("science handler builds prompt with topic", () => {
      const handler = getContentHandler("science");
      const prompt = handler.buildPrompt({ topic: "black holes", style: "flat" });
      expect(prompt).toContain("black holes");
      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(100);
    });

    it("science handler includes narrative beat plan guidance when provided", () => {
      const handler = getContentHandler("science");
      const prompt = handler.buildPrompt({
        topic: "为什么会打雷",
        style: "flat",
        narrativeOutline: makeBeatPlan(),
      });
      expect(prompt).toContain("templateType");
      expect(prompt).toContain("hook-closeup");
      expect(prompt).toContain("knowledgeGoal");
    });

    it("science handler injects fact pack hard constraints and coverage gaps when provided", () => {
      const handler = getContentHandler("science");
      const prompt = handler.buildPrompt({
        topic: "DNA",
        style: "flat",
        factPack: makeFactPack(),
      });

      expect(prompt).toContain("Fact Pack");
      expect(prompt).toContain("deoxyribonucleic acid");
      expect(prompt).toContain("1869");
      expect(prompt).toContain("不要编造");
    });

    it("wikipedia handler falls back to science when no content", () => {
      const handler = getContentHandler("wikipedia");
      const prompt = handler.buildPrompt({ topic: "DNA", style: "flat" });
      expect(prompt).toContain("DNA");
    });

    it("wikipedia handler uses content when provided", () => {
      const handler = getContentHandler("wikipedia");
      const prompt = handler.buildPrompt({
        topic: "DNA",
        style: "flat",
        wikipediaContent: {
          title: "DNA",
          extract: "Deoxyribonucleic acid is a polymer...",
          lang: "en",
        },
      });
      expect(prompt).toContain("Deoxyribonucleic acid");
      expect(prompt).toContain("DNA");
    });

    it("wikipedia handler includes beat plan guidance when provided", () => {
      const handler = getContentHandler("wikipedia");
      const prompt = handler.buildPrompt({
        topic: "DNA",
        style: "flat",
        wikipediaContent: {
          title: "DNA",
          extract: "Deoxyribonucleic acid is a polymer...",
          lang: "en",
        },
        narrativeOutline: makeBeatPlan(),
      });
      expect(prompt).toContain("templateType");
      expect(prompt).toContain("hook-closeup");
      expect(prompt).toContain("knowledgeGoal");
    });

    it("wikipedia handler injects fact pack constraints when provided", () => {
      const handler = getContentHandler("wikipedia");
      const prompt = handler.buildPrompt({
        topic: "DNA",
        style: "flat",
        wikipediaContent: {
          title: "DNA",
          extract: "Deoxyribonucleic acid is a polymer...",
          lang: "en",
        },
        factPack: makeFactPack(),
      });

      expect(prompt).toContain("Fact Pack");
      expect(prompt).toContain("deoxyribonucleic acid");
      expect(prompt).toContain("unsupported hard detail");
    });
  });

  describe("registerContentType", () => {
    it("registers a new content type", () => {
      const mockHandler = {
        buildPrompt: () => "test prompt",
        parseResponse: () => null,
      };

      registerContentType("test-custom" as never, mockHandler);
      expect(isRegisteredType("test-custom")).toBe(true);

      const handler = getContentHandler("test-custom" as never);
      expect(handler.buildPrompt({ topic: "x", style: "flat" })).toBe("test prompt");
    });
  });
});
