"use client";

import type { GenerateTask } from "@/lib/types";
import { getPipelinePhases, getPipelineSummaryLabel } from "@/lib/pipelineSummary";

interface PipelineSummaryProps {
  task: GenerateTask;
}

export function PipelineSummary({ task }: PipelineSummaryProps) {
  const phases = getPipelinePhases(task);

  if (phases.length === 0) return null;

  return (
    <details className="text-left mx-auto max-w-lg no-print">
      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
        {getPipelineSummaryLabel(task)}
      </summary>
      <div className="mt-2 p-3 rounded-lg bg-muted/50 text-xs space-y-1.5">
        {phases.map((phase, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] shrink-0 ${
              phase.status === "done" ? "bg-green-500 text-white" :
              phase.status === "failed" ? "bg-red-500 text-white" :
              "bg-muted-foreground/20 text-muted-foreground"
            }`}>
              {phase.status === "done" ? (
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : phase.status === "failed" ? "!" : "-"}
            </span>
            <span className={`font-medium ${phase.status === "done" ? "text-foreground/80" : "text-muted-foreground/60"}`}>
              {phase.name}
            </span>
            {phase.detail && (
              <span className="text-muted-foreground/50 ml-auto text-[10px]">{phase.detail}</span>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
