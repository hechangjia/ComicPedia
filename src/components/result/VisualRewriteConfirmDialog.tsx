"use client";

import React from "react";
import type { VisualDiagnosisPanel } from "@/lib/types";

export interface VisualRewriteConfirmPayload {
  prompt: string;
  includeSuggestedNegativePrompt: boolean;
}

interface VisualRewriteConfirmDialogProps {
  open: boolean;
  panel: VisualDiagnosisPanel;
  promptValue: string;
  includeSuggestedNegativePrompt: boolean;
  confirming?: boolean;
  onPromptValueChange: (value: string) => void;
  onIncludeSuggestedNegativePromptChange: (value: boolean) => void;
  onCancel: () => void;
  onConfirm: (payload: VisualRewriteConfirmPayload) => void;
}

export function VisualRewriteConfirmDialog({
  open,
  panel,
  promptValue,
  includeSuggestedNegativePrompt,
  confirming = false,
  onPromptValueChange,
  onIncludeSuggestedNegativePromptChange,
  onCancel,
  onConfirm,
}: VisualRewriteConfirmDialogProps) {
  if (!open) {
    return null;
  }

  const firstIssue = panel.issues[0];
  const suggestedNegativePrompt = panel.repair.suggestedNegativePrompt?.trim();

  return React.createElement("div", {
    className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4",
    role: "dialog",
    "aria-modal": true,
    "aria-label": `Panel ${panel.panelIndex + 1} rewrite confirm`,
  }, React.createElement("div", {
    className: "w-full max-w-2xl rounded-2xl border bg-background p-4 shadow-xl space-y-4",
  }, [
    React.createElement("div", { key: "header", className: "space-y-1" }, [
      React.createElement("p", { key: "eyebrow", className: "text-xs font-medium text-muted-foreground" }, `Panel ${panel.panelIndex + 1}`),
      React.createElement("h3", { key: "title", className: "text-base font-semibold" }, "确认重写 Prompt"),
      React.createElement("p", { key: "subline", className: "text-xs text-muted-foreground" }, "确认后会覆盖当前 prompt，并立即重生图。"),
    ]),
    React.createElement("div", { key: "summary", className: "rounded-xl border bg-muted/30 p-3 space-y-2" }, [
      React.createElement("p", { key: "label", className: "text-xs font-medium text-muted-foreground" }, "问题摘要"),
      React.createElement("p", { key: "issue", className: "text-sm font-medium" }, panel.topIssueType),
      firstIssue
        ? React.createElement("p", { key: "evidence", className: "text-xs leading-relaxed text-muted-foreground" }, firstIssue.evidence)
        : null,
      React.createElement("p", { key: "rationale", className: "text-xs leading-relaxed text-muted-foreground" }, panel.repair.rationale),
    ]),
    React.createElement("label", { key: "prompt", className: "block space-y-2" }, [
      React.createElement("span", { key: "label", className: "text-xs font-medium text-muted-foreground" }, "建议重写 Prompt"),
      React.createElement("textarea", {
        key: "field",
        value: promptValue,
        rows: 6,
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onPromptValueChange(event.target.value),
        className: "w-full rounded-xl border bg-background px-3 py-2 text-sm leading-relaxed outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20",
      }),
    ]),
    suggestedNegativePrompt
      ? React.createElement("div", { key: "negative", className: "rounded-xl border bg-card p-3 space-y-2" }, [
          React.createElement("label", { key: "toggle", className: "flex items-start gap-2 text-sm" }, [
            React.createElement("input", {
              key: "checkbox",
              type: "checkbox",
              checked: includeSuggestedNegativePrompt,
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => onIncludeSuggestedNegativePromptChange(event.target.checked),
              className: "mt-0.5 h-4 w-4 rounded border",
            }),
            React.createElement("span", { key: "label", className: "space-y-1" }, [
              React.createElement("span", { key: "title", className: "block font-medium" }, "同时应用建议 negative prompt"),
              React.createElement("span", { key: "hint", className: "block text-xs text-muted-foreground" }, suggestedNegativePrompt),
            ]),
          ]),
        ])
      : null,
    React.createElement("div", { key: "actions", className: "flex flex-wrap justify-end gap-2" }, [
      React.createElement("button", {
        key: "cancel",
        type: "button",
        onClick: onCancel,
        className: "rounded-lg border px-3 py-2 text-sm hover:bg-accent transition-colors",
      }, "取消"),
      React.createElement("button", {
        key: "confirm",
        type: "button",
        disabled: confirming || !promptValue.trim(),
        onClick: () => onConfirm({
          prompt: promptValue,
          includeSuggestedNegativePrompt,
        }),
        className: "rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-50",
      }, confirming ? "重生图中..." : "确认并重生图"),
    ]),
  ]));
}
