/**
 * Tests for vlmRetry.ts — VLM feedback-to-prompt conversion
 */
import { describe, it, expect } from "vitest";
import { generatePromptPatch, applyPromptPatch, shouldAutoRetry } from "@/lib/vlmRetry";
import { PanelVisualScore } from "@/lib/types";

function makeScore(overrides: Partial<PanelVisualScore> = {}): PanelVisualScore {
  return {
    panelIndex: 0,
    textImageAlignment: 7,
    styleAdherence: 7,
    artifactScore: 7,
    compositionQuality: 7,
    overall: 7,
    issues: [],
    ...overrides,
  };
}

describe("generatePromptPatch", () => {
  it("returns empty patch when no issues and high scores", () => {
    const patch = generatePromptPatch(makeScore());
    expect(patch.positive).toHaveLength(0);
    expect(patch.negative).toHaveLength(0);
  });

  it("patches finger-related issues", () => {
    const patch = generatePromptPatch(makeScore({
      issues: ["character has 6 fingers on left hand"],
    }));
    expect(patch.positive).toContain("correct human anatomy");
    expect(patch.positive).toContain("five fingers on each hand");
    expect(patch.negative).toContain("extra fingers");
  });

  it("patches blurry/quality issues", () => {
    const patch = generatePromptPatch(makeScore({
      issues: ["image is blurry in the background"],
    }));
    expect(patch.positive).toContain("sharp focus");
    expect(patch.negative).toContain("blurry");
  });

  it("patches watermark/text issues", () => {
    const patch = generatePromptPatch(makeScore({
      issues: ["there is a watermark in the corner"],
    }));
    expect(patch.positive).toContain("text-free image");
    expect(patch.negative).toContain("watermark");
  });

  it("patches based on low dimension scores", () => {
    const patch = generatePromptPatch(makeScore({
      artifactScore: 4,
      compositionQuality: 3,
    }));
    expect(patch.positive).toContain("best quality");
    expect(patch.positive).toContain("well-composed");
    expect(patch.negative).toContain("artifacts");
  });

  it("handles multiple issues", () => {
    const patch = generatePromptPatch(makeScore({
      issues: ["extra finger on right hand", "style is inconsistent with anime"],
    }));
    expect(patch.positive.length).toBeGreaterThanOrEqual(3);
    expect(patch.negative.length).toBeGreaterThanOrEqual(1);
  });

  it("deduplicates patch terms", () => {
    const patch = generatePromptPatch(makeScore({
      artifactScore: 3,
      issues: ["image has artifacts and distortion", "blurry artifacts visible"],
    }));
    // "artifacts" should appear only once in negative
    const artCount = patch.negative.filter(n => n === "artifacts").length;
    expect(artCount).toBeLessThanOrEqual(1);
  });
});

describe("applyPromptPatch", () => {
  it("returns original when no positive terms", () => {
    const result = applyPromptPatch("a cat sitting", { positive: [], negative: [] });
    expect(result).toBe("a cat sitting");
  });

  it("appends positive terms", () => {
    const result = applyPromptPatch("a cat sitting", {
      positive: ["sharp focus", "best quality"],
      negative: [],
    });
    expect(result).toContain("sharp focus");
    expect(result).toContain("best quality");
    expect(result).toContain("a cat sitting");
  });

  it("skips terms already in prompt", () => {
    const result = applyPromptPatch("a cat, sharp focus, high detail", {
      positive: ["sharp focus", "best quality"],
      negative: [],
    });
    // "sharp focus" already exists, should not be duplicated
    const count = (result.match(/sharp focus/gi) || []).length;
    expect(count).toBe(1);
    expect(result).toContain("best quality");
  });

  it("returns original when all terms already exist", () => {
    const result = applyPromptPatch("a cat, sharp focus, best quality", {
      positive: ["sharp focus", "best quality"],
      negative: [],
    });
    expect(result).toBe("a cat, sharp focus, best quality");
  });
});

describe("shouldAutoRetry", () => {
  it("returns false for high overall score", () => {
    expect(shouldAutoRetry(makeScore({ overall: 8 }))).toBe(false);
  });

  it("returns false for score exactly 6", () => {
    expect(shouldAutoRetry(makeScore({ overall: 6 }))).toBe(false);
  });

  it("returns true for low score with matchable issues", () => {
    expect(shouldAutoRetry(makeScore({
      overall: 4,
      artifactScore: 3,
      issues: ["image is blurry"],
    }))).toBe(true);
  });

  it("returns true for low score with low dimension (auto-patches)", () => {
    // Even without text issues, low dimension scores generate patches
    expect(shouldAutoRetry(makeScore({
      overall: 4,
      artifactScore: 3,
    }))).toBe(true);
  });
});
