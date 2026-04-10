import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EditablePanel } from "@/components/EditablePanel";

vi.mock("@/components/DownloadMenu", () => ({
  SinglePanelDownload: () => React.createElement("div", { "data-testid": "single-panel-download" }),
}));

vi.mock("@/components/VersionSwitcher", () => ({
  VersionSwitcher: () => React.createElement("div", { "data-testid": "version-switcher" }),
}));

vi.mock("@/components/PanelStyleSelector", () => ({
  PanelStyleSelector: () => React.createElement("div", { "data-testid": "panel-style-selector" }),
}));

vi.mock("@/components/AIEditAssistant", () => ({
  AIEditAssistant: () => React.createElement("div", { "data-testid": "ai-edit-assistant" }),
}));

vi.mock("@/hooks/useUndoRedo", () => ({
  useUndoRedo: ({ scene, dialogue, imagePrompt, styleOverride }: { scene: string; dialogue: string; imagePrompt: string; styleOverride?: string }) => ({
    state: { scene, dialogue, imagePrompt, styleOverride },
    pushState: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: false,
    canRedo: false,
    reset: vi.fn(),
    handleKeyDown: vi.fn(),
  }),
}));

const basePanel = {
  id: 1,
  scene: "完成态场景",
  dialogue: "完成态对白",
  imagePrompt: "completed prompt",
  status: "completed",
  imageUrl: "file://completed-panel-1",
};

const noop = vi.fn();

describe("EditablePanel", () => {
  it("renders completed panels in expanded edit mode when defaultEditing is true", () => {
    const html = renderToStaticMarkup(
      <EditablePanel
        panel={basePanel}
        index={0}
        taskId="task-1"
        taskStatus="completed"
        onUpdate={noop}
        onRegenerate={noop}
        onCancel={noop}
        onVersionChange={noop}
        defaultEditing
      />
    );

    expect(html).toContain("对话/旁白");
    expect(html).toContain("场景描述");
    expect(html).toContain("图片提示词 (英文)");
    expect(html).toContain("保存");
    expect(html).toContain("重新生成");
  });

  it("keeps completed panels editable even when they are not auto-expanded", () => {
    const html = renderToStaticMarkup(
      <EditablePanel
        panel={basePanel}
        index={0}
        taskId="task-1"
        taskStatus="completed"
        onUpdate={noop}
        onRegenerate={noop}
        onCancel={noop}
        onVersionChange={noop}
      />
    );

    expect(html).toContain("aria-label=\"编辑第 1 格\"");
  });
});
