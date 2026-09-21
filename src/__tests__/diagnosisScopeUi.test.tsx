import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { VisualScoreSection } from "@/components/result/score/VisualScoreSection";
import type { ComicScript, VisualDiagnosisReport, VisualQualityScore } from "@/lib/types";
const score: VisualQualityScore = { overall: 8, panels: [{ panelIndex: 0, overall: 8, textImageAlignment: 8, styleAdherence: 8, artifactScore: 8, compositionQuality: 8, issues: [] }], evaluatedAt: "2026-09-21", retryRecommendations: [] };
const script: ComicScript = { title: "QA", topic: "QA", style: "flat", panels: [{ id: 1, scene: "QA", dialogue: "", imagePrompt: "teal square", imageUrl: "/api/images/test", status: "completed" }] };
const report: VisualDiagnosisReport = { schemaVersion: 1, generatedAt: "2026-09-21", sourceEvaluatedAt: score.evaluatedAt, model: {}, panels: [], summary: { problemPanelCount: 0, highSeverityCount: 0, actionableCount: 0, crossPanelIssueCount: 0 } };
function render(overrides: Partial<React.ComponentProps<typeof VisualScoreSection>> = {}) {
  return renderToStaticMarkup(<VisualScoreSection score={score} script={script} loading={false} error="" onEvaluate={vi.fn()} onRunDiagnosis={vi.fn()} diagnosisReport={report} diagnosisState="succeeded" vlmOptions={[{ id: "vlm:qa", label: "QA model" }]} onVLMOptionChange={vi.fn()} {...overrides} />);
}
describe("diagnosis scope and coverage UI", () => {
  it("offers an explicit scope without treating an empty report as a completed audit", () => {
    const html = render();
    expect(html).toContain("诊断范围");
    expect(html).toContain("全部已生成画格");
    expect(html).toContain("手动选择画格");
    expect(html).not.toContain("已生成结构化审计卡");
    expect(html).toContain("评分未推荐需要深入诊断的画格");
    expect(html).toContain("尚未生成逐格诊断记录");
  });
  it("keeps the model selector available after scoring with an accessible label", () => {
    expect(render()).toContain("评审模型");
    expect(render()).toContain("QA model");
  });
  it("does not offer a no-op recommendation run", () => {
    expect(render()).toMatch(/<button[^>]*disabled=""[^>]*>运行深入诊断<\/button>/);
  });
  it("announces the persistent running state and locks model and scope controls", () => {
    const html = render({ diagnosisState: "running", diagnosisLoading: true });
    expect(html).toContain("正在评审所选范围");
    const selects = [...html.matchAll(/<select[^>]*>/g)].map(match => match[0]);
    expect(selects.length).toBeGreaterThanOrEqual(2);
    expect(selects.every(select => select.includes('disabled=""'))).toBe(true);
  });
  it("labels stale evidence rather than claiming current coverage", () => {
    expect(render({ diagnosisStale: true })).toContain("诊断记录已过期");
  });
});
