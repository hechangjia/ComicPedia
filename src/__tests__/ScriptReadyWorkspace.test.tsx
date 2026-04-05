import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ComicPanel, TaskQueueSummary } from "@/lib/types";
import { ScriptReadyWorkspace } from "@/components/result/ScriptReadyWorkspace";

function makePanels(): ComicPanel[] {
  return [
    {
      id: 1,
      scene: "Scene 1",
      dialogue: "Dialogue 1",
      imagePrompt: "Prompt 1",
      status: "pending",
    },
    {
      id: 2,
      scene: "Scene 2",
      dialogue: "Dialogue 2",
      imagePrompt: "Prompt 2",
      imageUrl: "file://panel-2",
      status: "completed",
    },
  ];
}

function makeQueueSummary(overrides: Partial<TaskQueueSummary> = {}): TaskQueueSummary {
  return {
    queued: 1,
    running: 0,
    paused: 0,
    failed: 0,
    attachFailed: 0,
    completed: 1,
    calibrationPending: 0,
    ...overrides,
  };
}

function renderWorkspace(overrides: Partial<React.ComponentProps<typeof ScriptReadyWorkspace>> = {}) {
  return renderToStaticMarkup(
    React.createElement(ScriptReadyWorkspace, {
      taskStatus: "script_ready",
      panels: makePanels(),
      selectedPanelIds: [],
      queueSummary: makeQueueSummary(),
      generatingAll: false,
      llmConfigs: [
        { id: "llm-1", name: "GPT-4o", model: "gpt-4o" },
      ],
      imageConfigs: [
        { id: "img-1", name: "Image Model", model: "gpt-image-1" },
      ],
      activeLLMId: "llm-1",
      activeImageId: "img-1",
      selectedLLMId: "llm-1",
      selectedImageId: "img-1",
      onSelectedLLMIdChange: () => {},
      onSelectedImageIdChange: () => {},
      onRegenerateScript: () => {},
      onTogglePanelSelection: () => {},
      onQueuePanel: () => {},
      onQueueSelected: () => {},
      onContinueRemaining: () => {},
      onPauseQueue: () => {},
      onResumeQueue: () => {},
      ...overrides,
    }),
  );
}

describe("ScriptReadyWorkspace", () => {
  it("renders the panel-first actions and disables generate selected until a panel is checked", () => {
    const html = renderWorkspace();

    expect(html).toContain("生成本张");
    expect(html).toContain("生成选中");
    expect(html).toContain("继续剩余");
    expect(html).toContain("队列摘要");
    expect(html).toContain("待处理 1");
    expect(html).toContain("已完成 1");
    expect(html).toMatch(/aria-label="生成选中"[^>]*disabled=""/);
  });

  it("enables generate selected and swaps to resume queue when the queue is paused", () => {
    const html = renderWorkspace({
      taskStatus: "image_queue_paused",
      selectedPanelIds: [1],
      queueSummary: makeQueueSummary({
        queued: 0,
        paused: 2,
        completed: 0,
      }),
    });

    expect(html).toContain("队列已暂停");
    expect(html).toContain("恢复队列");
    expect(html).not.toMatch(/aria-label="生成选中"[^>]*disabled=""/);
  });

  it("keeps checkbox selection attached to panel identity after reorder", () => {
    const html = renderWorkspace({
      panels: [makePanels()[1], makePanels()[0]],
      selectedPanelIds: [2],
    });

    expect(html).toMatch(/aria-label="选择第 1 格"[^>]*checked=""/);
    expect(html).not.toMatch(/aria-label="选择第 2 格"[^>]*checked=""/);
  });
});
