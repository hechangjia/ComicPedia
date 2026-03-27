"use client";

import React from "react";
import type { VisualDiagnosisPanel, VisualRepairExecutionMode, VisualRepairExecutionStatus } from "@/lib/types";
import { VisualDiagnosisPromptDiff } from "./VisualDiagnosisPromptDiff";

export interface VisualDiagnosisRepairStatusView {
  panelIndex?: number;
  mode: Extract<VisualRepairExecutionMode, "patch" | "rewrite">;
  status: VisualRepairExecutionStatus;
  message: string;
}

interface VisualDiagnosisAuditCardProps {
  panel: VisualDiagnosisPanel;
  onApplyPatch?: (panel: VisualDiagnosisPanel) => void;
  onApplyRewrite?: (panel: VisualDiagnosisPanel) => void;
  repairStatus?: VisualDiagnosisRepairStatusView | null;
}

function actionabilityMeta(value: VisualDiagnosisPanel["issues"][number]["actionability"]) {
  if (value === "apply_directly") {
    return {
      label: "可直接执行",
      tone: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    };
  }
  if (value === "confirm_first") {
    return {
      label: "建议确认后执行",
      tone: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
    };
  }
  return {
    label: "高误判风险",
    tone: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  };
}

export function VisualDiagnosisAuditCard({
  panel,
  onApplyPatch,
  onApplyRewrite,
  repairStatus,
}: VisualDiagnosisAuditCardProps) {
  const hasHighRiskIssue = panel.issues.some((issue) => issue.falsePositiveRisk === "high");
  const hasManualOnlyIssue = panel.issues.some((issue) => issue.actionability === "manual_only");
  const isPatch = panel.repair.recommendedMode === "patch";
  const isRewrite = panel.repair.recommendedMode === "rewrite";
  const isRunning = repairStatus?.panelIndex === panel.panelIndex && repairStatus.status === "running";

  return React.createElement("div", { className: "rounded-xl border bg-card p-3 space-y-3" }, [
    React.createElement("div", { key: "header", className: "flex items-center justify-between gap-2" }, [
      React.createElement("div", { key: "title" }, [
        React.createElement("p", { key: "panel", className: "text-sm font-medium" }, `Panel ${panel.panelIndex + 1}`),
        React.createElement("p", { key: "issue", className: "text-xs text-muted-foreground" }, panel.topIssueType),
      ]),
      React.createElement(
        "span",
        {
          key: "mode",
          className: "rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary",
        },
        panel.repair.recommendedMode,
      ),
    ]),
    React.createElement("div", { key: "issues", className: "space-y-2" }, [
      React.createElement("p", { key: "label", className: "text-xs font-medium text-muted-foreground" }, "为什么判这格有问题"),
      ...panel.issues.map((issue, index) => {
        const meta = actionabilityMeta(issue.actionability);
        return React.createElement("div", { key: `${issue.issueType}-${index}`, className: "rounded-lg border bg-muted/30 p-2 space-y-1.5" }, [
          React.createElement("div", { key: "top", className: "flex flex-wrap items-center gap-1.5" }, [
            React.createElement("span", { key: "type", className: "text-xs font-medium" }, issue.issueType),
            React.createElement("span", { key: "action", className: `inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.tone}` }, meta.label),
            React.createElement("span", { key: "confidence", className: "rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground" }, issue.confidence),
          ]),
          React.createElement("p", { key: "evidence", className: "text-xs leading-relaxed" }, issue.evidence),
          React.createElement("p", { key: "dimensions", className: "text-[11px] text-muted-foreground" }, `影响维度：${issue.affectedDimensions.join(", ")}`),
          issue.falsePositiveRisk === "high"
            ? React.createElement("p", { key: "risk", className: "text-[11px] text-red-600 dark:text-red-300" }, "高误判风险：建议人工确认后再做修改。")
            : null,
        ]);
      }),
    ]),
    React.createElement("div", { key: "repair", className: "space-y-2" }, [
      React.createElement("p", { key: "label", className: "text-xs font-medium text-muted-foreground" }, "建议怎么改"),
      React.createElement("p", { key: "rationale", className: "text-xs leading-relaxed" }, panel.repair.rationale),
      panel.repair.expectedImprovement.length > 0
        ? React.createElement("ul", { key: "expected", className: "space-y-1 text-xs text-muted-foreground" }, panel.repair.expectedImprovement.map((item) => (
            React.createElement("li", { key: item }, `- ${item}`)
          )))
        : null,
    ]),
    React.createElement(VisualDiagnosisPromptDiff, {
      key: "diff",
      originalPrompt: panel.promptSnapshot,
      suggestedPrompt: panel.repair.suggestedPrompt,
    }),
    hasManualOnlyIssue
      ? React.createElement(
          "div",
          {
            key: "manual-note",
            className: "rounded-lg border border-amber-300/60 bg-amber-50/70 p-2 text-[11px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300",
          },
          "该问题建议人工确认后再修改，当前不提供直接执行按钮。",
        )
      : React.createElement("div", { key: "actions", className: "flex flex-wrap gap-2" }, [
          isPatch && onApplyPatch
            ? React.createElement("button", {
                key: "apply-patch",
                type: "button",
                disabled: isRunning,
                onClick: () => onApplyPatch(panel),
                className: "rounded-lg border border-green-300 px-3 py-2 text-xs font-medium text-green-700 transition-colors hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-green-900 dark:text-green-300 dark:hover:bg-green-950/20",
              }, isRunning ? "修复中..." : "应用 patch")
            : null,
          isRewrite && onApplyRewrite
            ? React.createElement("button", {
                key: "apply-rewrite",
                type: "button",
                disabled: isRunning,
                onClick: () => onApplyRewrite(panel),
                className: "rounded-lg border border-blue-300 px-3 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950/20",
              }, isRunning ? "处理中..." : "应用重写版")
            : null,
        ]),
    repairStatus?.panelIndex === panel.panelIndex
      ? React.createElement(
          "div",
          {
            key: "repair-status",
            className: repairStatus.status === "failed"
              ? "rounded-lg border border-red-300/60 bg-red-50/70 p-2 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300"
              : repairStatus.status === "completed"
                ? "rounded-lg border border-emerald-300/60 bg-emerald-50/70 p-2 text-[11px] text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300"
                : "rounded-lg border border-sky-300/60 bg-sky-50/70 p-2 text-[11px] text-sky-700 dark:border-sky-900 dark:bg-sky-950/20 dark:text-sky-300",
          },
          repairStatus.message,
        )
      : null,
    hasHighRiskIssue
      ? React.createElement(
          "div",
          {
            key: "summary-risk",
            className: "rounded-lg border border-red-300/60 bg-red-50/60 p-2 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300",
          },
          "高误判风险",
        )
      : null,
  ]);
}
