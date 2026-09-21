import { describe, expect, it } from "vitest";
import { diagnosisScopeIndices, diagnosisCoverage } from "@/lib/diagnosisScope";
import type { ComicScript, VisualDiagnosisPanel, VisualDiagnosisReport, VisualQualityScore } from "@/lib/types";
const script: ComicScript = { title: "QA", topic: "QA", style: "flat", panels: [0, 1, 2].map(index => ({ id: index, scene: "QA", dialogue: "", imagePrompt: `prompt${index}`, imageUrl: index < 2 ? `/api/images/${index}` : undefined, status: index < 2 ? "completed" : "failed" })) };
const score: VisualQualityScore = { overall: 8, evaluatedAt: "2026-09-21", panels: [0, 1].map(panelIndex => ({ panelIndex, overall: 8, textImageAlignment: 8, styleAdherence: 8, artifactScore: 8, compositionQuality: 8, issues: [] })), retryRecommendations: [{ panelIndex: 1, reason: "QA", suggestedFix: "QA" }] };
function report(indices: number[]): VisualDiagnosisReport {
  return { schemaVersion: 1, generatedAt: "2026-09-21", sourceEvaluatedAt: score.evaluatedAt, model: {}, summary: { problemPanelCount: 0, highSeverityCount: 0, actionableCount: 0, crossPanelIssueCount: 0 }, panels: indices.map(panelIndex => ({ panelIndex, imageUrl: `/api/images/${panelIndex}`, promptSnapshot: `prompt${panelIndex}`, status: "clean", issues: [], severity: "low", topIssueType: "none", repair: { recommendedMode: "manual", rationale: "QA", expectedImprovement: [] } } as VisualDiagnosisPanel)) };
}
describe("diagnosis scope and evidence", () => {
  it("does not widen an empty recommendation set to every panel", () => {
    expect(diagnosisScopeIndices(script, { ...score, retryRecommendations: [] }, "recommended")).toEqual([]);
  });
  it("includes both recommended and cross-panel candidates, excluding missing images", () => {
    expect(diagnosisScopeIndices(script, { ...score, crossPanelDetail: { overall: 5, characterConsistency: 5, styleDrift: 5, colorPaletteCoherence: 5, issues: [{ panelIndices: [0, 2, 99], description: "QA" }] } }, "recommended")).toEqual([0, 1]);
  });
  it("all includes only completed panels with images", () => {
    expect(diagnosisScopeIndices(script, score, "all")).toEqual([0, 1]);
  });
  it("manual targets are unique, sorted and intersected with eligible panels", () => {
    expect(diagnosisScopeIndices(script, score, "selected", [1, 1, 2, 99, -1])).toEqual([1]);
    expect(diagnosisScopeIndices(script, score, "selected", [])).toEqual([]);
  });
  it("does not pretend a partial report covers the full script", () => {
    expect(diagnosisCoverage(script, report([1]))).toEqual({ eligibleIndices: [0, 1], currentIndices: [1], unreviewedIndices: [0], obsoleteCount: 0 });
  });
  it("deduplicates indices rather than counting repeated cards", () => {
    expect(diagnosisCoverage(script, report([0, 0])).currentIndices).toEqual([0]);
  });
  it("excludes changed image/prompt snapshots and out of range reports", () => {
    const result = report([0, 1, 99]); result.panels[0].imageUrl = "old"; result.panels[1].promptSnapshot = "old";
    expect(diagnosisCoverage(script, result).currentIndices).toEqual([]);
    expect(diagnosisCoverage(script, result).obsoleteCount).toBe(3);
  });
  it("stale reports have no current coverage", () => {
    expect(diagnosisCoverage(script, report([0, 1]), true).currentIndices).toEqual([]);
  });
  it("empty reports and missing scripts do not manufacture a pass", () => {
    expect(diagnosisCoverage(script, report([])).unreviewedIndices).toEqual([0, 1]);
    expect(diagnosisCoverage(undefined, report([0])).currentIndices).toEqual([]);
  });
});
