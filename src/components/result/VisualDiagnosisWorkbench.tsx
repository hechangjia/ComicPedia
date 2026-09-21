"use client";

import React, { useMemo, useState } from "react";
import type { VisualDiagnosisPanel, VisualDiagnosisReport } from "@/lib/types";
import { canBatchPatchDiagnosisPanel } from "@/lib/diagnosisRepairPolicy";
import { VisualDiagnosisAuditCard, type VisualDiagnosisRepairStatusView } from "./VisualDiagnosisAuditCard";

interface VisualDiagnosisWorkbenchProps {
  visualScoreOverall: number;
  report: VisualDiagnosisReport;
  stale?: boolean;
  onApplyPatch?: (panel: VisualDiagnosisPanel) => void;
  onApplyRewrite?: (panel: VisualDiagnosisPanel) => void;
  onApplyBatchPatch?: (panels: VisualDiagnosisPanel[]) => void;
  repairStatus?: VisualDiagnosisRepairStatusView | null;
}

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const GROUPS = [
  { status: "issues_found", label: "发现问题", hint: "查看证据与修复建议" },
  { status: "uncertain", label: "待人工确认", hint: "证据尚不充分，请先核对画面" },
  { status: "clean", label: "未发现问题", hint: "当前诊断不建议修复" },
] as const;

export function VisualDiagnosisWorkbench({
  visualScoreOverall, report, stale = false, onApplyPatch, onApplyRewrite, onApplyBatchPatch, repairStatus,
}: VisualDiagnosisWorkbenchProps) {
  const groups = useMemo(() => GROUPS.map((group) => ({
    ...group,
    panels: report.panels.filter((panel) => panel.status === group.status).sort((a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.panelIndex - b.panelIndex),
  })), [report.panels]);
  const prioritizedPanels = groups.flatMap((group) => group.panels);
  const batchPanels = stale ? [] : prioritizedPanels.filter(canBatchPatchDiagnosisPanel);
  const [selectedPanelIndex, setSelectedPanelIndex] = useState<number | null>(prioritizedPanels[0]?.panelIndex ?? null);
  const selected = prioritizedPanels.find((panel) => panel.panelIndex === selectedPanelIndex) ?? prioritizedPanels[0];
  const isRunning = repairStatus?.status === "running";
  const batchStatus = repairStatus?.panelIndex === undefined ? repairStatus : null;
  const problems = groups[0].panels;
  const highCount = problems.filter((panel) => panel.severity === "high").length;
  const crossCount = problems.flatMap((panel) => panel.issues).filter((issue) => issue.affectedDimensions.includes("crossPanelConsistency")).length;

  return (
    <section aria-label="视觉诊断工作台" className="mt-4 rounded-xl border bg-background/40 p-3 space-y-3">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium">视觉诊断工作台</h3>
            <p className="text-xs text-secondary-text">按诊断状态查看面板与证据</p>
          </div>
          <p className="text-lg font-semibold">{visualScoreOverall}/10</p>
        </div>
        {stale && <p className="text-xs text-foreground" role="status">诊断结果已过期，请重新诊断后再修复。</p>}
        <div className="flex flex-wrap gap-2 text-xs text-secondary-text">
          <span>{problems.length} 个问题面板</span>
          <span>{groups[1].panels.length} 个待人工确认</span>
          <span>{groups[2].panels.length} 个未发现问题</span>
          <span>{highCount} 个高优先级问题</span>
          <span>{crossCount > 0 ? "存在跨格一致性问题" : "暂无已确认的跨格一致性问题"}</span>
        </div>
        {groups[2].panels.length > 0 && <p className="text-xs text-secondary-text">评分与诊断是不同的评估：未发现具体问题不代表评分达标，仍可结合画面人工检查。</p>}
      </div>
      {prioritizedPanels.length === 0 ? (
        <p className="py-4 text-sm text-secondary-text">尚未生成逐格诊断记录。这不代表全部画格均无问题，请在上方选择诊断范围。</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="min-w-0 space-y-3">
            {onApplyBatchPatch && batchPanels.length > 0 && <div className="space-y-2">
              <p className="text-xs text-secondary-text">{batchPanels.length} 格可批量修复（仅可直接执行的问题）</p>
              <button type="button" disabled={isRunning} onClick={() => onApplyBatchPatch(batchPanels)} className="min-h-10 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50">
                {isRunning && batchStatus ? "批量修复中..." : "批量应用 patch"}
              </button>
            </div>}
            {batchStatus && <p role="status" className={`text-xs ${batchStatus.status === "failed" ? "text-foreground" : "text-secondary-text"}`}>{batchStatus.message}</p>}
            {groups.filter((group) => group.panels.length > 0).map((group) => (
              <div key={group.status} className="space-y-2">
                <h4 className="text-xs font-medium">{group.label} · {group.panels.length}</h4>
                {group.panels.map((panel) => (
                  <button key={panel.panelIndex} type="button" aria-pressed={selected?.panelIndex === panel.panelIndex} onClick={() => setSelectedPanelIndex(panel.panelIndex)}
                    className={`w-full min-h-11 rounded-lg border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${selected?.panelIndex === panel.panelIndex ? "border-primary bg-primary/5" : "bg-card hover:bg-accent"}`}>
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-medium">Panel {panel.panelIndex + 1}</span>
                      {panel.status === "issues_found" && <span className="text-xs text-secondary-text">{{ high: "高优先级", medium: "中优先级", low: "低优先级" }[panel.severity]}</span>}
                    </span>
                    {panel.status === "issues_found" && <span className="mt-1 block break-words text-xs">{panel.topIssueType}</span>}
                    <span className="mt-1 block text-xs text-secondary-text">{group.hint}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          {selected && <div className="min-w-0 break-words"><VisualDiagnosisAuditCard panel={selected} stale={stale} onApplyPatch={isRunning ? undefined : onApplyPatch} onApplyRewrite={isRunning ? undefined : onApplyRewrite} repairStatus={repairStatus} /></div>}
        </div>
      )}
    </section>
  );
}
