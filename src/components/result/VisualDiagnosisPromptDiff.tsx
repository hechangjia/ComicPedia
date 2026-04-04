"use client";

import React from "react";

interface VisualDiagnosisPromptDiffProps {
  originalPrompt: string;
  suggestedPrompt?: string;
}

export function VisualDiagnosisPromptDiff({
  originalPrompt,
  suggestedPrompt,
}: VisualDiagnosisPromptDiffProps) {
  return React.createElement("div", { className: "space-y-2" }, [
    React.createElement("div", { key: "original", className: "space-y-1" }, [
      React.createElement("p", { key: "label", className: "text-[11px] font-medium text-muted-foreground" }, "原 Prompt"),
      React.createElement(
        "div",
        { key: "value", className: "rounded-lg border bg-muted/40 p-2 text-xs leading-relaxed" },
        originalPrompt || "无",
      ),
    ]),
    React.createElement("div", { key: "suggested", className: "space-y-1" }, [
      React.createElement("p", { key: "label", className: "text-[11px] font-medium text-muted-foreground" }, "建议 Prompt"),
      React.createElement(
        "div",
        {
          key: "value",
          className: "rounded-lg border border-warning/30 bg-warning/5 p-2 text-xs leading-relaxed",
        },
        suggestedPrompt || "当前阶段暂无完整重写建议",
      ),
    ]),
  ]);
}
