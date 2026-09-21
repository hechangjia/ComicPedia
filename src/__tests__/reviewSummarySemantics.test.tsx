import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/EditablePanel", () => ({ EditablePanel: () => null }));
import { PanelGrid } from "@/components/result/PanelGrid";

it("does not present numerical review status as a full diagnosis pass", () => {
  const noop = vi.fn();
  const html = renderToStaticMarkup(<PanelGrid title="QA" taskId="qa" taskStatus="completed" viewMode="read" panels={[{ id: 1, scene: "QA", dialogue: "", imagePrompt: "QA", status: "completed" }]} reviewStatus="reviewed" panelReview={[{ panelIndex: 0, status: "reviewed", score: 8, issues: [] }]} onPanelUpdate={noop} onRegenerate={noop} onCancel={noop} onVersionChange={noop} />);
  expect(html).toContain("视觉评分状态");
  expect(html).toContain("已评分");
  expect(html).toContain("评分状态不代表已逐格深入诊断");
  expect(html).not.toContain("已通过");
});
