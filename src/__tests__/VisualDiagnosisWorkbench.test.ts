import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { VisualDiagnosisReport } from "@/lib/types";
import { VisualDiagnosisWorkbench } from "@/components/result/VisualDiagnosisWorkbench";

function makeReport(): VisualDiagnosisReport {
  return {
    schemaVersion: 1,
    generatedAt: "2026-03-27T01:10:00.000Z",
    sourceEvaluatedAt: "2026-03-27T01:00:00.000Z",
    model: {
      provider: "openai-compatible",
      model: "gpt-4o",
    },
    summary: {
      problemPanelCount: 2,
      highSeverityCount: 1,
      actionableCount: 2,
      crossPanelIssueCount: 1,
    },
    panels: [
      {
        panelIndex: 2,
        imageUrl: "data:image/png;base64,panel-3",
        promptSnapshot: "Prompt 3",
        status: "issues_found",
        topIssueType: "character_drift",
        severity: "medium",
        issues: [
          {
            issueType: "character_drift",
            severity: "medium",
            affectedDimensions: ["crossPanelConsistency"],
            evidence: "Character outfit differs from adjacent panel",
            confidence: "medium",
            evidenceStrength: "medium",
            falsePositiveRisk: "medium",
            actionability: "confirm_first",
          },
        ],
        repair: {
          recommendedMode: "rewrite",
          rationale: "Cross-panel identity mismatch needs prompt clarification.",
          expectedImprovement: ["Restores consistent character appearance"],
        },
      },
      {
        panelIndex: 1,
        imageUrl: "data:image/png;base64,panel-2",
        promptSnapshot: "Prompt 2",
        status: "issues_found",
        topIssueType: "composition_mismatch",
        severity: "high",
        issues: [
          {
            issueType: "composition_mismatch",
            severity: "high",
            affectedDimensions: ["compositionQuality"],
            evidence: "Main subject is cropped out of frame",
            confidence: "high",
            evidenceStrength: "strong",
            falsePositiveRisk: "high",
            actionability: "manual_only",
          },
        ],
        repair: {
          recommendedMode: "rewrite",
          rationale: "Framing needs a wider layout.",
          suggestedPrompt: "A wider shot that keeps the main subject fully visible.",
          expectedImprovement: ["Keeps the subject fully visible"],
        },
      },
    ],
  };
}

function makeSinglePanelReport(mode: "patch" | "rewrite"): VisualDiagnosisReport {
  return {
    schemaVersion: 1,
    generatedAt: "2026-03-27T01:10:00.000Z",
    sourceEvaluatedAt: "2026-03-27T01:00:00.000Z",
    model: {
      provider: "openai-compatible",
      model: "gpt-4o",
    },
    summary: {
      problemPanelCount: 1,
      highSeverityCount: 1,
      actionableCount: 1,
      crossPanelIssueCount: 0,
    },
    panels: [
      {
        panelIndex: 0,
        imageUrl: "data:image/png;base64,panel-1",
        promptSnapshot: "Prompt 1",
        status: "issues_found",
        topIssueType: mode === "patch" ? "artifact_defect" : "composition_mismatch",
        severity: "high",
        issues: [
          {
            issueType: mode === "patch" ? "artifact_defect" : "composition_mismatch",
            severity: "high",
            affectedDimensions: [mode === "patch" ? "artifactScore" : "compositionQuality"],
            evidence: mode === "patch" ? "Hands look blurry" : "Main subject is cropped out of frame",
            confidence: "high",
            evidenceStrength: "strong",
            falsePositiveRisk: "low",
            actionability: mode === "patch" ? "apply_directly" : "confirm_first",
          },
        ],
        repair: {
          recommendedMode: mode,
          rationale: mode === "patch" ? "A local patch can fix clarity." : "The scene needs a wider framing instruction.",
          suggestedPrompt: mode === "rewrite" ? "A wider shot that keeps the main subject fully visible." : undefined,
          patchPositive: mode === "patch" ? ["sharp focus"] : undefined,
          patchNegative: mode === "patch" ? ["blurry hands"] : undefined,
          expectedImprovement: ["Improves the panel"],
        },
      },
    ],
  };
}

describe("VisualDiagnosisWorkbench", () => {
  it("renders the diagnosis summary strip", () => {
    const html = renderToStaticMarkup(React.createElement(VisualDiagnosisWorkbench, {
      visualScoreOverall: 6.4,
      report: makeReport(),
      stale: false,
    }));

    expect(html).toContain("查看待修复面板");
    expect(html).toContain("6.4/10");
    expect(html).toContain("2 个问题面板");
    expect(html).toContain("1 个高优先级问题");
    expect(html).toContain("存在跨格一致性问题");
  });

  it("prioritizes higher-severity panels before lower-severity ones", () => {
    const html = renderToStaticMarkup(React.createElement(VisualDiagnosisWorkbench, {
      visualScoreOverall: 6.4,
      report: makeReport(),
      stale: false,
    }));

    expect(html.indexOf("Panel 2")).toBeLessThan(html.indexOf("Panel 3"));
  });

  it("renders trust labels, false-positive warnings, recommended mode, and prompt diff", () => {
    const html = renderToStaticMarkup(React.createElement(VisualDiagnosisWorkbench, {
      visualScoreOverall: 6.4,
      report: makeReport(),
      stale: false,
    }));

    expect(html).toContain("高误判风险");
    expect(html).toContain("建议怎么改");
    expect(html).toContain("rewrite");
    expect(html).toContain("Prompt 2");
    expect(html).toContain("A wider shot that keeps the main subject fully visible.");
  });

  it("renders a stale badge when diagnosis is outdated", () => {
    const html = renderToStaticMarkup(React.createElement(VisualDiagnosisWorkbench, {
      visualScoreOverall: 6.4,
      report: makeReport(),
      stale: true,
    }));

    expect(html).toContain("诊断结果已过期");
  });

  it("renders a direct patch action for patch-eligible panels", () => {
    const html = renderToStaticMarkup(React.createElement(VisualDiagnosisWorkbench, {
      visualScoreOverall: 5.8,
      report: makeSinglePanelReport("patch"),
      stale: false,
      onApplyPatch: () => {},
    }));

    expect(html).toContain("应用 patch");
  });

  it("suppresses direct actions for manual-only panels", () => {
    const html = renderToStaticMarkup(React.createElement(VisualDiagnosisWorkbench, {
      visualScoreOverall: 6.4,
      report: makeReport(),
      stale: false,
      onApplyRewrite: () => {},
    }));

    expect(html).toContain("该问题建议人工确认后再修改");
    expect(html).not.toContain("应用重写版");
  });
});
