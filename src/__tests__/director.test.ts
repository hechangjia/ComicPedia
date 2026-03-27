/**
 * Tests for director.ts — Narrative outline parsing and guidance building
 */
import { describe, it, expect } from "vitest";
import { buildOutlineGuidance } from "@/lib/director";
import { NarrativeOutline } from "@/lib/types";

function makeOutline(overrides: Partial<NarrativeOutline> = {}): NarrativeOutline {
  return {
    totalPanels: 4,
    templateType: "mechanism",
    source: "beat-plan",
    narrativeArc: "Introduction to quantum computing through everyday analogy",
    infoDistribution: "progressive",
    characterList: [
      { name: "Dr. Qubit", role: "narrator", firstAppearance: 1 },
    ],
    panels: [
      {
        narrativeFunction: "opening",
        beatRole: "hook",
        suggestedComposition: "wide shot",
        shotIntent: "hook-closeup",
        characters: ["Dr. Qubit"],
        keyInfo: "量子计算的日常类比",
        knowledgeGoal: "让读者先产生反常识兴趣",
        infoDensity: "low",
        intensity: "high",
        carryForward: "为什么量子会和日常类比不同",
      },
      {
        narrativeFunction: "development",
        beatRole: "progression",
        suggestedComposition: "close-up",
        shotIntent: "contrast",
        characters: ["Dr. Qubit"],
        keyInfo: "量子比特 vs 经典比特",
        knowledgeGoal: "理解两者并不是二选一关系",
        infoDensity: "medium",
        intensity: "medium",
        carryForward: "叠加态为什么成立",
      },
      {
        narrativeFunction: "climax",
        beatRole: "reveal",
        suggestedComposition: "dynamic",
        shotIntent: "reveal",
        characters: ["Dr. Qubit"],
        keyInfo: "量子叠加态的本质",
        knowledgeGoal: "看懂核心机制",
        infoDensity: "high",
        intensity: "high",
        carryForward: "它到底能拿来做什么",
      },
      {
        narrativeFunction: "resolution",
        beatRole: "closure",
        suggestedComposition: "medium shot",
        shotIntent: "aftermath",
        characters: ["Dr. Qubit"],
        keyInfo: "量子计算的未来应用",
        knowledgeGoal: "记住它改变现实问题的方式",
        infoDensity: "medium",
        intensity: "medium",
        carryForward: "none",
      },
    ],
    ...overrides,
  };
}

describe("buildOutlineGuidance", () => {
  it("includes template type", () => {
    const guidance = buildOutlineGuidance(makeOutline());
    expect(guidance).toContain("mechanism");
  });

  it("includes narrative arc", () => {
    const guidance = buildOutlineGuidance(makeOutline());
    expect(guidance).toContain("Introduction to quantum computing");
  });

  it("includes info distribution", () => {
    const guidance = buildOutlineGuidance(makeOutline());
    expect(guidance).toContain("progressive");
  });

  it("includes character list with first appearance", () => {
    const guidance = buildOutlineGuidance(makeOutline());
    expect(guidance).toContain("Dr. Qubit");
    expect(guidance).toContain("narrator");
    expect(guidance).toContain("第1格");
  });

  it("includes per-panel blueprint", () => {
    const guidance = buildOutlineGuidance(makeOutline());
    expect(guidance).toContain("Panel 1 [opening / hook]");
    expect(guidance).toContain("量子计算的日常类比");
    expect(guidance).toContain("wide shot");
    expect(guidance).toContain("Panel 3 [climax / reveal]");
    expect(guidance).toContain("量子叠加态的本质");
  });

  it("includes info density", () => {
    const guidance = buildOutlineGuidance(makeOutline());
    expect(guidance).toContain("信息密度: low");
    expect(guidance).toContain("信息密度: high");
  });

  it("includes beat role and shot intent guidance", () => {
    const guidance = buildOutlineGuidance(makeOutline());
    expect(guidance).toContain("hook");
    expect(guidance).toContain("hook-closeup");
    expect(guidance).toContain("knowledgeGoal");
    expect(guidance).toContain("carryForward");
  });

  it("handles empty character list", () => {
    const guidance = buildOutlineGuidance(makeOutline({ characterList: [] }));
    expect(guidance).not.toContain("角色表");
  });

  it("handles empty panels gracefully", () => {
    const guidance = buildOutlineGuidance(makeOutline({ panels: [] }));
    expect(guidance).toContain("[Director Outline");
  });
});
