import { describe, expect, it } from "vitest";
import {
  getDefaultResultViewMode,
  getResultDisplayStatus,
  getResultContentSurface,
  resolveResultViewMode,
} from "@/app/result/viewMode";

describe("result view mode", () => {
  it("never exposes completion when a panel image is missing", () => {
    const task = { status: "completed" as const, script: { panels: [{ status: "completed", imageUrl: "/api/images/ok" }, { status: "completed" }] } };
    expect(getResultDisplayStatus(task)).toBe("script_ready");
    task.script.panels[1].imageUrl = "/api/images/second";
    expect(getResultDisplayStatus(task)).toBe("completed");
  });
  it("defaults paused and completed tasks to read mode", () => {
    expect(getDefaultResultViewMode("script_ready")).toBe("edit");
    expect(getDefaultResultViewMode("image_queue_paused")).toBe("read");
    expect(getDefaultResultViewMode("deep_review_paused")).toBe("read");
    expect(getDefaultResultViewMode("completed")).toBe("read");
  });

  it("preserves editing during image queue pause and retry", () => {
    expect(resolveResultViewMode("edit", "image_queue_paused")).toBe("edit");
    expect(resolveResultViewMode("edit", "deep_review_paused")).toBe("read");
    expect(resolveResultViewMode("edit", "completed")).toBe("edit");
  });

  it("preserves play mode for paused and completed tasks", () => {
    expect(resolveResultViewMode("play", "image_queue_paused")).toBe("play");
    expect(resolveResultViewMode("play", "deep_review_paused")).toBe("play");
    expect(resolveResultViewMode("play", "completed")).toBe("play");
  });

  it("routes completed edit mode to panel quick edit while script_ready keeps script editor", () => {
    expect(getResultContentSurface("edit", "completed")).toBe("panel-grid");
    expect(getResultContentSurface("edit", "script_ready")).toBe("script-editor");
    expect(getResultContentSurface("read", "completed")).toBe("panel-grid");
    expect(getResultContentSurface("play", "completed")).toBe("play");
    expect(getResultContentSurface("edit", "image_queue_paused")).toBe("panel-grid");
  });
});
