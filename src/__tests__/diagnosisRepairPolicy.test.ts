import { describe, expect, it } from "vitest";
import type { VisualDiagnosisPanel } from "@/lib/types";
import { canRepairDiagnosisPanel, canBatchPatchDiagnosisPanel, assertDiagnosisRepairCurrent } from "@/lib/diagnosisRepairPolicy";
import { buildDiagnosisRepairExecution } from "@/lib/vlmDiagnosis";

function panel(): VisualDiagnosisPanel {
  return {
    panelIndex: 0, imageUrl: "/api/images/current", promptSnapshot: "original", status: "issues_found",
    topIssueType: "artifact_defect", severity: "medium",
    issues: [{ issueType: "artifact_defect", severity: "medium", affectedDimensions: ["artifactScore"], evidence: "blurred hands", confidence: "high", evidenceStrength: "strong", falsePositiveRisk: "low", actionability: "apply_directly" }],
    repair: { recommendedMode: "patch", rationale: "sharpen hands", patchPositive: ["clear hands"], expectedImprovement: [] },
  };
}

describe("diagnosis repair eligibility", () => {
  it.each(["clean", "uncertain"] as const)("rejects %s even with leftover actionable repair data", (status) => {
    const value = { ...panel(), status };
    expect(canRepairDiagnosisPanel(value, "patch")).toBe(false);
    expect(canBatchPatchDiagnosisPanel(value)).toBe(false);
    expect(() => buildDiagnosisRepairExecution({ panel: value, currentPrompt: "original", mode: "patch" })).toThrow();
  });
  it("rejects empty issues, manual-only issues, and mode mismatch", () => {
    const value = panel();
    expect(canRepairDiagnosisPanel(value, "rewrite")).toBe(false);
    value.issues[0].actionability = "manual_only";
    expect(canRepairDiagnosisPanel(value, "patch")).toBe(false);
    value.issues = [];
    expect(canRepairDiagnosisPanel(value, "patch")).toBe(false);
  });
  it("reserves batch patch for direct low-risk issues, leaving confirmation to single-panel review", () => {
    const value = panel();
    expect(canBatchPatchDiagnosisPanel(value)).toBe(true);
    value.issues[0].actionability = "confirm_first";
    expect(canRepairDiagnosisPanel(value, "patch")).toBe(true);
    expect(canBatchPatchDiagnosisPanel(value)).toBe(false);
    value.issues[0].actionability = "apply_directly";
    value.issues[0].falsePositiveRisk = "high";
    expect(canBatchPatchDiagnosisPanel(value)).toBe(false);
  });
  it("rejects stale, replaced and missing source panels before starting repair", () => {
    const value = panel();
    const current = { imageUrl: value.imageUrl, imagePrompt: value.promptSnapshot };
    expect(() => assertDiagnosisRepairCurrent(value, "patch", current, false)).not.toThrow();
    expect(() => assertDiagnosisRepairCurrent(value, "patch", current, true)).toThrow("过期");
    expect(() => assertDiagnosisRepairCurrent(value, "patch", { ...current, imageUrl: "/api/images/other" }, false)).toThrow("变更");
    expect(() => assertDiagnosisRepairCurrent(value, "patch", { ...current, imagePrompt: "edited" }, false)).toThrow("变更");
    expect(() => assertDiagnosisRepairCurrent(value, "patch", undefined, false)).toThrow("不存在");
  });
});
