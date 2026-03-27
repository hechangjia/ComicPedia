import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { VisualDiagnosisPanel } from "@/lib/types";
import { VisualRewriteConfirmDialog } from "@/components/result/VisualRewriteConfirmDialog";

function makePanel(): VisualDiagnosisPanel {
  return {
    panelIndex: 1,
    imageUrl: "data:image/png;base64,panel-2",
    promptSnapshot: "A crowded frame with the hero clipped on the right edge.",
    status: "issues_found",
    topIssueType: "composition_mismatch",
    severity: "high",
    issues: [
      {
        issueType: "composition_mismatch",
        severity: "high",
        affectedDimensions: ["compositionQuality", "textImageAlignment"],
        evidence: "The main subject is cropped and the framing feels too tight.",
        confidence: "high",
        evidenceStrength: "strong",
        falsePositiveRisk: "low",
        actionability: "confirm_first",
      },
    ],
    repair: {
      recommendedMode: "rewrite",
      rationale: "The scene needs a wider framing instruction.",
      suggestedPrompt: "A wide shot that keeps the main character fully in frame.",
      suggestedNegativePrompt: "cropped subject, cut off body",
      expectedImprovement: ["Keeps the full body visible", "Improves readability"],
    },
  };
}

type TestElementProps = {
  children?: unknown;
  type?: string;
  onChange?: (event: { target: { value?: string; checked?: boolean } }) => void;
  onClick?: () => void;
};

function isTestElement(node: unknown): node is React.ReactElement<TestElementProps> {
  return React.isValidElement(node);
}

function flattenElements(node: unknown): Array<React.ReactElement<TestElementProps>> {
  if (Array.isArray(node)) {
    return node.flatMap((child) => flattenElements(child));
  }
  if (!isTestElement(node)) {
    return [];
  }
  return [node, ...flattenElements(node.props.children)];
}

function extractText(node: unknown): string {
  if (Array.isArray(node)) {
    return node.map((child) => extractText(child)).join("");
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (!isTestElement(node)) {
    return "";
  }
  return extractText(node.props.children);
}

describe("VisualRewriteConfirmDialog", () => {
  it("renders the issue summary, editable prompt, and negative prompt toggle", () => {
    const html = renderToStaticMarkup(React.createElement(VisualRewriteConfirmDialog, {
      open: true,
      panel: makePanel(),
      promptValue: "A wide shot that keeps the main character fully in frame.",
      includeSuggestedNegativePrompt: true,
      onPromptValueChange: () => {},
      onIncludeSuggestedNegativePromptChange: () => {},
      onCancel: () => {},
      onConfirm: () => {},
    }));

    expect(html).toContain("确认重写 Prompt");
    expect(html).toContain("The main subject is cropped and the framing feels too tight.");
    expect(html).toContain("A wide shot that keeps the main character fully in frame.");
    expect(html).toContain("同时应用建议 negative prompt");
    expect(html).toContain("确认并重生图");
  });

  it("returns edited prompt text and negative prompt choice on confirm", () => {
    const onPromptValueChange = vi.fn();
    const onIncludeSuggestedNegativePromptChange = vi.fn();
    const onConfirm = vi.fn();

    const tree = VisualRewriteConfirmDialog({
      open: true,
      panel: makePanel(),
      promptValue: "Initial rewrite prompt",
      includeSuggestedNegativePrompt: true,
      onPromptValueChange,
      onIncludeSuggestedNegativePromptChange,
      onCancel: () => {},
      onConfirm,
    });

    const elements = flattenElements(tree);
    const textarea = elements.find((element) => element.type === "textarea");
    const checkbox = elements.find((element) => element.type === "input" && element.props.type === "checkbox");
    const confirmButton = elements.find((element) => element.type === "button" && extractText(element.props.children).includes("确认并重生图"));

    expect(textarea).toBeDefined();
    expect(checkbox).toBeDefined();
    expect(confirmButton).toBeDefined();

    textarea!.props.onChange?.({ target: { value: "Edited rewrite prompt" } });
    checkbox!.props.onChange?.({ target: { checked: false } });
    confirmButton!.props.onClick?.();

    expect(onPromptValueChange).toHaveBeenCalledWith("Edited rewrite prompt");
    expect(onIncludeSuggestedNegativePromptChange).toHaveBeenCalledWith(false);
    expect(onConfirm).toHaveBeenCalledWith({
      prompt: "Initial rewrite prompt",
      includeSuggestedNegativePrompt: true,
    });
  });
});
