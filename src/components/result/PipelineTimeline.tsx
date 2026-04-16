"use client";

import { useState } from "react";
import type { PipelineStageTrace } from "@/lib/types";

interface PipelineTimelineProps {
  trace: PipelineStageTrace[];
  onRetryStage?: (stage: string) => void;
}

const STAGE_LABELS: Record<PipelineStageTrace["stage"], string> = {
  research: "Research",
  director: "Director",
  script: "Script",
  validate: "Validate",
  repair: "Repair",
  accuracy: "Accuracy",
  images: "Images",
  vlm: "VLM",
  quality: "Score",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusIcon(status: PipelineStageTrace["status"]): string {
  switch (status) {
    case "completed": return "\u2713";
    case "running": return "\u25CE";
    case "failed": return "!";
    case "skipped": return "\u2013";
    case "pending": return "\u2022";
  }
}

function statusColor(status: PipelineStageTrace["status"]): string {
  switch (status) {
    case "completed": return "bg-success/50 text-white";
    case "running": return "bg-info/50 text-white animate-pulse";
    case "failed": return "bg-error/50 text-white";
    case "skipped": return "bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400";
    case "pending": return "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500";
  }
}

function pillBorder(status: PipelineStageTrace["status"]): string {
  switch (status) {
    case "completed": return "border-success/30";
    case "running": return "border-info/40";
    case "failed": return "border-error/30";
    default: return "border-border/30";
  }
}

export function PipelineTimeline({ trace, onRetryStage }: PipelineTimelineProps) {
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  if (trace.length === 0) return null;

  return (
    <div className="mx-auto max-w-2xl no-print">
      {/* Horizontal pill row */}
      <div className="flex flex-wrap items-center gap-1.5 justify-center">
        {trace.map((entry, i) => {
          const duration = entry.startedAt && entry.completedAt
            ? entry.completedAt - entry.startedAt
            : undefined;
          const isExpanded = expandedStage === entry.stage;

          return (
            <div key={entry.stage} className="flex items-center gap-1.5">
              {i > 0 && (
                <span className="text-muted-foreground/40 text-xs select-none">&rarr;</span>
              )}
              <button
                type="button"
                onClick={() => setExpandedStage(isExpanded ? null : entry.stage)}
                className={`
                  inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium
                  border transition-colors cursor-pointer
                  hover:opacity-80 ${pillBorder(entry.status)}
                `}
                aria-expanded={isExpanded}
                aria-label={`${STAGE_LABELS[entry.stage]} - ${entry.status}`}
              >
                <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] shrink-0 ${statusColor(entry.status)}`}>
                  {statusIcon(entry.status)}
                </span>
                <span className={entry.status === "skipped" ? "text-muted-foreground/50" : "text-foreground/80"}>
                  {STAGE_LABELS[entry.stage]}
                </span>
                {duration !== undefined && entry.status === "completed" && (
                  <span className="text-muted-foreground/50 text-[10px]">
                    {formatDuration(duration)}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Expanded detail panel */}
      {expandedStage && (() => {
        const entry = trace.find(t => t.stage === expandedStage);
        if (!entry) return null;
        const duration = entry.startedAt && entry.completedAt
          ? entry.completedAt - entry.startedAt
          : undefined;

        return (
          <div className="mt-2 p-3 rounded-lg bg-muted/50 text-xs space-y-1.5 text-left max-w-lg mx-auto">
            <div className="flex items-center justify-between">
              <span className="font-medium text-foreground/80">
                {STAGE_LABELS[entry.stage]}
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] ${statusColor(entry.status)}`}>
                {entry.status}
              </span>
            </div>
            {duration !== undefined && (
              <div className="text-muted-foreground">
                耗时: {formatDuration(duration)}
              </div>
            )}
            {entry.retryCount > 0 && (
              <div className="text-muted-foreground">
                重试次数: {entry.retryCount}
              </div>
            )}
            {entry.tokenUsage && (
              <div className="text-muted-foreground">
                Token: {entry.tokenUsage.prompt} prompt + {entry.tokenUsage.completion} completion
              </div>
            )}
            {entry.error && (
              <div className="text-error break-words">
                错误: {entry.error}
              </div>
            )}
            {entry.status === "failed" && onRetryStage && (
              <button
                type="button"
                onClick={() => onRetryStage(entry.stage)}
                className="mt-1 px-3 py-1 rounded bg-error/50 text-white text-[11px] hover:bg-error/90 transition-colors"
              >
                重试
              </button>
            )}
          </div>
        );
      })()}
    </div>
  );
}
