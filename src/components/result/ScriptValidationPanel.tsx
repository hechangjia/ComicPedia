"use client";

import { useState } from "react";
import { CheckCircle, ChevronDown } from "lucide-react";


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
  critical: { bg: "bg-error/10", border: "border-error/20", text: "text-error", label: "严重" },
  warning: { bg: "bg-warning/10", border: "border-warning/20", text: "text-warning", label: "警告" },
  info: { bg: "bg-info/10", border: "border-info/20", text: "text-info", label: "建议" },
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
          <CheckCircle className="w-4 h-4 text-warning" />
          <span className="text-sm font-medium">
            脚本质量检查
            {repairRounds ? <span className="text-xs text-success ml-1.5">（已自动修复 {repairRounds} 轮）</span> : null}
          </span>
          <span className="flex items-center gap-1.5 text-xs">
            {criticalCount > 0 && <span className="px-1.5 py-0.5 rounded bg-error/10 text-error">{criticalCount} 严重</span>}
            {warningCount > 0 && <span className="px-1.5 py-0.5 rounded bg-warning/10 text-warning">{warningCount} 警告</span>}
            {infoCount > 0 && <span className="px-1.5 py-0.5 rounded bg-info/10 text-info">{infoCount} 建议</span>}
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
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
