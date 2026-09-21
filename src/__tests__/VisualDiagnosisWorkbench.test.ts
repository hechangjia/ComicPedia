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

function makeBatchPatchReport(): VisualDiagnosisReport {
  return {
    schemaVersion: 1,
    generatedAt: "2026-03-27T01:10:00.000Z",
    sourceEvaluatedAt: "2026-03-27T01:00:00.000Z",
    model: {
      provider: "openai-compatible",
      model: "gpt-4o",
    },
    summary: {
      problemPanelCount: 3,
      highSeverityCount: 1,
      actionableCount: 2,
      crossPanelIssueCount: 0,
    },
    panels: [
      {
        panelIndex: 0,
        imageUrl: "data:image/png;base64,panel-1",
        promptSnapshot: "Prompt 1",
        status: "issues_found",
        topIssueType: "artifact_defect",
        severity: "high",
        issues: [
          {
            issueType: "artifact_defect",
            severity: "high",
            affectedDimensions: ["artifactScore"],
            evidence: "Hands look blurry",
            confidence: "high",
            evidenceStrength: "strong",
            falsePositiveRisk: "low",
            actionability: "apply_directly",
          },
        ],
        repair: {
          recommendedMode: "patch",
          rationale: "A focused patch can improve clarity.",
          patchPositive: ["sharp focus"],
          patchNegative: ["blurry hands"],
          expectedImprovement: ["Improves clarity"],
        },
      },
      {
        panelIndex: 1,
        imageUrl: "data:image/png;base64,panel-2",
        promptSnapshot: "Prompt 2",
        status: "issues_found",
        topIssueType: "composition_mismatch",
        severity: "medium",
        issues: [
          {
            issueType: "composition_mismatch",
            severity: "medium",
            affectedDimensions: ["compositionQuality"],
            evidence: "Framing is wrong",
            confidence: "medium",
            evidenceStrength: "medium",
            falsePositiveRisk: "high",
            actionability: "manual_only",
          },
        ],
        repair: {
          recommendedMode: "patch",
          rationale: "This panel is too risky for direct execution.",
          patchPositive: ["wide shot"],
          patchNegative: ["cropped subject"],
          expectedImprovement: ["Improves framing"],
        },
      },
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
            falsePositiveRisk: "low",
            actionability: "confirm_first",
          },
        ],
        repair: {
          recommendedMode: "rewrite",
          rationale: "Identity mismatch needs prompt clarification.",
          suggestedPrompt: "Restore the canonical outfit.",
          expectedImprovement: ["Restores consistency"],
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

    expect(html).toContain("按诊断状态查看面板与证据");
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

  it("renders batch patch CTA and counts only patch-eligible panels", () => {
    const html = renderToStaticMarkup(React.createElement(VisualDiagnosisWorkbench, {
      visualScoreOverall: 5.9,
      report: makeBatchPatchReport(),
      stale: false,
      onApplyBatchPatch: () => {},
    }));

    expect(html).toContain("批量应用 patch");
    expect(html).toContain("1 格可批量修复");
  });
});

describe("diagnosis state semantics", () => {
  function renderState(status: "clean" | "uncertain" | "issues_found", stale = false) {
    const report = makeSinglePanelReport("patch");
    report.panels[0].status = status;
    if (status === "clean") {
      report.panels[0].issues = [];
      report.panels[0].topIssueType = "no_issue_detected";
      report.summary.problemPanelCount = 0;
    }
    return renderToStaticMarkup(React.createElement(VisualDiagnosisWorkbench, {
      visualScoreOverall: 5, report, stale,
      onApplyPatch: () => {}, onApplyRewrite: () => {}, onApplyBatchPatch: () => {},
    }));
  }

  it("keeps a clean low-score diagnosis readable without recommending repair", () => {
    const html = renderState("clean");
    expect(html).toContain("未发现问题");
    expect(html).toContain("5/10");
    expect(html).toContain("评分与诊断是不同的评估");
    expect(html).not.toContain("建议先修这格");
    expect(html).not.toContain("为什么判这格有问题");
    expect(html).not.toContain("建议怎么改");
    expect(html).not.toContain("应用 patch");
    expect(html).not.toContain("no_issue_detected");
  });

  it("treats uncertain diagnosis as unconfirmed, never a direct or batch repair", () => {
    const html = renderState("uncertain");
    expect(html).toContain("待人工确认");
    expect(html).not.toContain("建议先修这格");
    expect(html).not.toContain("应用 patch");
    expect(html).not.toContain("为什么判这格有问题");
  });

  it("retains stale evidence but removes repair actions", () => {
    const html = renderState("issues_found", true);
    expect(html).toContain("诊断结果已过期");
    expect(html).toContain("请重新诊断后再修复");
    expect(html).not.toContain("应用 patch");
  });

  it("orders actual problems before uncertain and clean panels regardless of severity", () => {
    const report = makeBatchPatchReport();
    report.panels[0].status = "clean";
    report.panels[0].issues = [];
    report.panels[1].status = "uncertain";
    report.panels[2].severity = "low";
    const html = renderToStaticMarkup(React.createElement(VisualDiagnosisWorkbench, { visualScoreOverall: 5, report }));
    expect(html.indexOf("Panel 3")).toBeLessThan(html.indexOf("Panel 2"));
    expect(html.indexOf("Panel 2")).toBeLessThan(html.indexOf("Panel 1"));
    expect(html).toContain('aria-pressed="true"');
  });

  it("shows an explicit empty state rather than a repair list", () => {
    const report = makeReport();
    report.panels = [];
    const html = renderToStaticMarkup(React.createElement(VisualDiagnosisWorkbench, { visualScoreOverall: 5, report }));
    expect(html).toContain("尚未生成逐格诊断记录");
    expect(html).not.toContain("待修复面板");
  });
});

describe("diagnosis repair action boundaries", () => {
  it("excludes confirmation-required patch suggestions from batch and previews their changes", () => {
    const report = makeSinglePanelReport("patch");
    report.panels[0].issues[0].actionability = "confirm_first";
    const html = renderToStaticMarkup(React.createElement(VisualDiagnosisWorkbench, {
      visualScoreOverall: 5, report, onApplyPatch: () => {}, onApplyBatchPatch: () => {},
    }));
    expect(html).not.toContain("批量应用 patch");
    expect(html).toContain("确认并应用 patch");
    expect(html).toContain("追加提示词");
    expect(html).toContain("排除内容");
  });

  it("blocks both individual and batch actions while another panel repair runs", () => {
    const html = renderToStaticMarkup(React.createElement(VisualDiagnosisWorkbench, {
      visualScoreOverall: 5, report: makeSinglePanelReport("patch"),
      onApplyPatch: () => {}, onApplyBatchPatch: () => {},
      repairStatus: { panelIndex: 3, mode: "patch", status: "running", message: "正在修复" },
    }));
    expect(html).not.toMatch(/>应用 patch</);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>批量应用 patch<\/button>/);
  });

  it("does not trust a stale summary to classify clean or uncertain panels as problems", () => {
    const report = makeBatchPatchReport();
    report.panels[0].status = "clean";
    report.panels[1].status = "uncertain";
    report.summary.problemPanelCount = 99;
    const html = renderToStaticMarkup(React.createElement(VisualDiagnosisWorkbench, { visualScoreOverall: 5, report }));
    expect(html).toContain("1 个问题面板");
    expect(html).toContain("1 个待人工确认");
    expect(html).toContain("1 个未发现问题");
    expect(html).not.toContain("99 个问题面板");
  });
});

describe("diagnosis readability", () => {
  it("uses readable secondary text and never labels uncertain evidence directly executable", () => {
    const report = makeSinglePanelReport("patch");
    report.panels[0].status = "uncertain";
    const html = renderToStaticMarkup(React.createElement(VisualDiagnosisWorkbench, { visualScoreOverall: 5, report }));
    expect(html).not.toContain("text-muted-foreground");
    expect(html).not.toContain("可直接执行");
    expect(html).toContain("待核对的修改建议");
  });
});
