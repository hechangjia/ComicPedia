import { describe, expect, test } from "vitest";
import {
  applyDiagnosisPatch,
  applyDiagnosisRewrite,
  classifyRepairOutcome,
} from "../lib/vlmDiagnosis";

describe("visual diagnosis repair helpers", () => {
  test("applyDiagnosisPatch adds new positive terms without duplicating existing text", () => {
    const originalPrompt = "a heroic figure, dramatic lighting, wide shot";
    const result = applyDiagnosisPatch({
      prompt: originalPrompt,
      negativePrompt: undefined,
      patchPositive: ["dramatic lighting", "wide shot", "cinematic scope"],
      patchNegative: [],
    });

    expect(result.prompt).toContain("cinematic scope");
    expect(result.prompt.split("wide shot").length).toBe(2);
  });

  test("applyDiagnosisPatch merges negative prompt additions with deduplication", () => {
    const originalPrompt = "quiet close-up";
    const result = applyDiagnosisPatch({
      prompt: originalPrompt,
      negativePrompt: "cropped subject, low detail",
      patchPositive: [],
      patchNegative: ["cropped subject", "overexposed"],
    });

    expect(result.negativePrompt).toContain("cropped subject");
    expect(result.negativePrompt?.split("cropped subject").length).toBe(2);
    expect(result.negativePrompt).toContain("overexposed");
  });

  test("applyDiagnosisRewrite replaces the prompt text fully", () => {
    const rewrite = applyDiagnosisRewrite({
      prompt: "old prompt",
      negativePrompt: "dark shadows",
      suggestedPrompt: "wide shot with glowing city",
      includeSuggestedNegativePrompt: false,
    });

    expect(rewrite.prompt).toBe("wide shot with glowing city");
    expect(rewrite.negativePrompt).toBe("dark shadows");
  });

  test("applyDiagnosisRewrite only applies suggested negative prompt when explicitly enabled", () => {
    const rewrite = applyDiagnosisRewrite({
      prompt: "old prompt",
      negativePrompt: "dusty",
      suggestedPrompt: "wide shots",
      suggestedNegativePrompt: "cropped subject",
      includeSuggestedNegativePrompt: true,
    });

    expect(rewrite.negativePrompt).toContain("cropped subject");
  });

  test("classifyRepairOutcome reports improved, unchanged, and regressed", () => {
    expect(classifyRepairOutcome(5.1, 6.2)).toBe("improved");
    expect(classifyRepairOutcome(6.2, 6.2)).toBe("unchanged");
    expect(classifyRepairOutcome(7, 6.5)).toBe("regressed");
  });
});
