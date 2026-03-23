/**
 * Tests for director.ts — Narrative outline parsing and guidance building
 */
import { describe, it, expect } from "vitest";
import { buildOutlineGuidance } from "@/lib/director";
import { NarrativeOutline } from "@/lib/types";

function makeOutline(overrides: Partial<NarrativeOutline> = {}): NarrativeOutline {
  return {
    totalPanels: 4,
    narrativeArc: "Introduction to quantum computing through everyday analogy",
    infoDistribution: "progressive",
    characterList: [
      { name: "Dr. Qubit", role: "narrator", firstAppearance: 1 },
    ],
    panels: [
      { narrativeFunction: "opening", suggestedComposition: "wide shot", characters: ["Dr. Qubit"], keyInfo: "量子计算的日常类比", infoDensity: "low" },
      { narrativeFunction: "development", suggestedComposition: "close-up", characters: ["Dr. Qubit"], keyInfo: "量子比特 vs 经典比特", infoDensity: "medium" },
      { narrativeFunction: "climax", suggestedComposition: "dynamic", characters: ["Dr. Qubit"], keyInfo: "量子叠加态的本质", infoDensity: "high" },
      { narrativeFunction: "resolution", suggestedComposition: "medium shot", characters: ["Dr. Qubit"], keyInfo: "量子计算的未来应用", infoDensity: "medium" },
    ],
    ...overrides,
  };
}

describe("buildOutlineGuidance", () => {
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
    expect(guidance).toContain("Panel 1 [opening]");
    expect(guidance).toContain("量子计算的日常类比");
    expect(guidance).toContain("wide shot");
    expect(guidance).toContain("Panel 3 [climax]");
    expect(guidance).toContain("量子叠加态的本质");
  });

  it("includes info density", () => {
    const guidance = buildOutlineGuidance(makeOutline());
    expect(guidance).toContain("信息密度: low");
    expect(guidance).toContain("信息密度: high");
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
