"use client";

import { useState } from "react";

interface ValidationWarning {
  severity: "critical" | "warning" | "info";
  dimension: string;
  panelIndices: number[];
  message: string;
  suggestion: string;
}

interface ScriptValidationPanelProps {
  validation: {
    passed: boolean;
    characterConsistency: boolean;
    compositionVariety: boolean;
    styleAlignment: boolean;
    languagePurity: boolean;
    warnings: ValidationWarning[];
  };
  repairRounds?: number;
}

const SEVERITY_STYLES = {
  critical: { bg: "bg-red-50 dark:bg-red-900/20", border: "border-red-200 dark:border-red-800", text: "text-red-700 dark:text-red-300", label: "严重" },
  warning: { bg: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-200 dark:border-amber-800", text: "text-amber-700 dark:text-amber-300", label: "警告" },
  info: { bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-200 dark:border-blue-800", text: "text-blue-700 dark:text-blue-300", label: "建议" },
};

const DIMENSION_LABELS: Record<string, string> = {
  character: "角色一致性",
  composition: "构图多样性",
  style: "风格一致性",
  language: "语言纯净度",
  narrative: "叙事连贯性",
};

export function ScriptValidationPanel({ validation, repairRounds }: ScriptValidationPanelProps) {
  const [expanded, setExpanded] = useState(true);

  if (validation.warnings.length === 0) return null;

  const criticalCount = validation.warnings.filter(w => w.severity === "critical").length;
  const warningCount = validation.warnings.filter(w => w.severity === "warning").length;
  const infoCount = validation.warnings.filter(w => w.severity === "info").length;

  return (
    <div className="rounded-xl border bg-card space-y-2 no-print overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center justify-between hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium">
            脚本质量检查
            {repairRounds ? <span className="text-xs text-green-600 dark:text-green-400 ml-1.5">（已自动修复 {repairRounds} 轮）</span> : null}
          </span>
          <span className="flex items-center gap-1.5 text-xs">
            {criticalCount > 0 && <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">{criticalCount} 严重</span>}
            {warningCount > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">{warningCount} 警告</span>}
            {infoCount > 0 && <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">{infoCount} 建议</span>}
          </span>
        </div>
        <svg className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {validation.warnings.map((w, i) => {
            const styles = SEVERITY_STYLES[w.severity];
            return (
              <div key={i} className={`p-2.5 rounded-lg border ${styles.bg} ${styles.border}`}>
                <div className="flex items-start gap-2">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${styles.bg} ${styles.text} border ${styles.border} shrink-0 mt-0.5`}>
                    {DIMENSION_LABELS[w.dimension] || w.dimension}
                  </span>
                  <div className="space-y-1 min-w-0">
                    <p className={`text-xs ${styles.text}`}>
                      {w.message}
                      {w.panelIndices.length > 0 && (
                        <span className="opacity-70 ml-1">
                          (面板 {w.panelIndices.map(i => i + 1).join(", ")})
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{w.suggestion}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
