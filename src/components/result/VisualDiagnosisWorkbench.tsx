"use client";

import React, { useMemo, useState } from "react";
import type { VisualDiagnosisPanel, VisualDiagnosisReport } from "@/lib/types";
import { VisualDiagnosisAuditCard, type VisualDiagnosisRepairStatusView } from "./VisualDiagnosisAuditCard";

interface VisualDiagnosisWorkbenchProps {
  visualScoreOverall: number;
  report: VisualDiagnosisReport;
  stale?: boolean;
  onApplyPatch?: (panel: VisualDiagnosisPanel) => void;
  onApplyRewrite?: (panel: VisualDiagnosisPanel) => void;
  repairStatus?: VisualDiagnosisRepairStatusView | null;
}

const SEVERITY_RANK = {
  high: 0,
  medium: 1,
  low: 2,
} as const;

export function VisualDiagnosisWorkbench({
  visualScoreOverall,
  report,
  stale = false,
  onApplyPatch,
  onApplyRewrite,
  repairStatus,
}: VisualDiagnosisWorkbenchProps) {
  const prioritizedPanels = useMemo(
    () => [...report.panels].sort((a, b) => {
      const severityDelta = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      return severityDelta !== 0 ? severityDelta : a.panelIndex - b.panelIndex;
    }),
    [report.panels],
  );
  const [selectedPanelIndex, setSelectedPanelIndex] = useState(prioritizedPanels[0]?.panelIndex ?? null);
  const selectedPanel = prioritizedPanels.find((panel) => panel.panelIndex === selectedPanelIndex) ?? prioritizedPanels[0];

  return React.createElement("div", { className: "mt-4 rounded-xl border bg-background/40 p-3 space-y-3" }, [
    React.createElement("div", { key: "summary", className: "rounded-xl border bg-card p-3 space-y-2" }, [
      React.createElement("div", { key: "top", className: "flex flex-wrap items-center justify-between gap-2" }, [
        React.createElement("div", { key: "title" }, [
          React.createElement("p", { key: "headline", className: "text-sm font-medium" }, "VLM Diagnosis Workbench"),
          React.createElement("p", { key: "subline", className: "text-xs text-muted-foreground" }, "查看待修复面板"),
        ]),
        React.createElement("div", { key: "score", className: "text-right" }, [
          React.createElement("p", { key: "value", className: "text-lg font-semibold" }, `${visualScoreOverall}/10`),
          stale
            ? React.createElement("p", { key: "stale", className: "text-[11px] text-orange-600 dark:text-orange-300" }, "诊断结果已过期")
            : null,
        ]),
      ]),
      React.createElement("div", { key: "stats", className: "flex flex-wrap gap-2 text-xs text-muted-foreground" }, [
        React.createElement("span", { key: "problems" }, `${report.summary.problemPanelCount} 个问题面板`),
        React.createElement("span", { key: "high" }, `${report.summary.highSeverityCount} 个高优先级问题`),
        React.createElement("span", { key: "cross" }, report.summary.crossPanelIssueCount > 0 ? "存在跨格一致性问题" : "暂无跨格一致性问题"),
      ]),
    ]),
    React.createElement("div", { key: "content", className: "grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]" }, [
      React.createElement("div", { key: "list", className: "rounded-xl border bg-card p-3 space-y-2" }, [
        React.createElement("p", { key: "label", className: "text-xs font-medium text-muted-foreground" }, "待修复面板"),
        React.createElement("div", { key: "items", className: "space-y-2" }, prioritizedPanels.map((panel: VisualDiagnosisPanel) => {
          const tone = panel.severity === "high"
            ? "border-red-300 bg-red-50/70 text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300"
            : panel.severity === "medium"
              ? "border-yellow-300 bg-yellow-50/70 text-yellow-700 dark:border-yellow-900 dark:bg-yellow-950/20 dark:text-yellow-300"
              : "border-slate-300 bg-slate-50/70 text-slate-700 dark:border-slate-700 dark:bg-slate-900/20 dark:text-slate-300";
          const selected = selectedPanel?.panelIndex === panel.panelIndex;

          return React.createElement("button", {
            key: panel.panelIndex,
            type: "button",
            onClick: () => setSelectedPanelIndex(panel.panelIndex),
            className: `w-full rounded-lg border p-2 text-left transition-colors ${tone} ${selected ? "ring-2 ring-primary" : ""}`,
          }, [
            React.createElement("div", { key: "top", className: "flex items-center justify-between gap-2" }, [
              React.createElement("span", { key: "panel", className: "text-xs font-medium" }, `Panel ${panel.panelIndex + 1}`),
              React.createElement("span", { key: "severity", className: "text-[10px] uppercase" }, panel.severity),
            ]),
            React.createElement("p", { key: "type", className: "mt-1 text-[11px]" }, panel.topIssueType),
            React.createElement("p", { key: "hint", className: "mt-1 text-[10px] opacity-80" }, "建议先修这格"),
          ]);
        })),
      ]),
      selectedPanel
        ? React.createElement(VisualDiagnosisAuditCard, {
            key: "audit",
            panel: selectedPanel,
            onApplyPatch,
            onApplyRewrite,
            repairStatus,
          })
        : null,
    ]),
  ]);
}
