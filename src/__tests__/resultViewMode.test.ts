import { describe, expect, it } from "vitest";
import {
  getDefaultResultViewMode,
  resolveResultViewMode,
} from "@/app/result/viewMode";

describe("result view mode", () => {
  it("defaults paused and completed tasks to read mode", () => {
    expect(getDefaultResultViewMode("script_ready")).toBe("edit");
    expect(getDefaultResultViewMode("image_queue_paused")).toBe("read");
    expect(getDefaultResultViewMode("deep_review_paused")).toBe("read");
    expect(getDefaultResultViewMode("completed")).toBe("read");
  });

  it("coerces edit mode back to read for non-editable task states", () => {
    expect(resolveResultViewMode("edit", "image_queue_paused")).toBe("read");
    expect(resolveResultViewMode("edit", "deep_review_paused")).toBe("read");
    expect(resolveResultViewMode("edit", "completed")).toBe("read");
  });

  it("preserves play mode for paused and completed tasks", () => {
    expect(resolveResultViewMode("play", "image_queue_paused")).toBe("play");
    expect(resolveResultViewMode("play", "deep_review_paused")).toBe("play");
    expect(resolveResultViewMode("play", "completed")).toBe("play");
  });
});
