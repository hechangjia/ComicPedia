import { describe, expect, it } from "vitest";
import {
  buildHistoryHref,
  buildResultHref,
  parseHistoryFilter,
  resolveResultBackHref,
} from "@/app/history/historyNavigation";

describe("history navigation helpers", () => {
  it("parses only supported history filters and falls back to all", () => {
    expect(parseHistoryFilter("image_queue_running")).toBe("image_queue_running");
    expect(parseHistoryFilter("comfyui_remote_pending")).toBe("comfyui_remote_pending");
    expect(parseHistoryFilter("unknown")).toBe("all");
    expect(parseHistoryFilter(null)).toBe("all");
  });

  it("builds history hrefs with a compact default route", () => {
    expect(buildHistoryHref("all")).toBe("/history");
    expect(buildHistoryHref("image_queue_paused")).toBe("/history?filter=image_queue_paused");
  });

  it("builds result hrefs that preserve the current history filter", () => {
    expect(buildResultHref("task-1", "all")).toBe("/result/task-1?returnTo=%2Fhistory");
    expect(buildResultHref("task-2", "comfyui_remote_pending")).toBe(
      "/result/task-2?returnTo=%2Fhistory%3Ffilter%3Dcomfyui_remote_pending",
    );
  });

  it("resolves result-page back hrefs only for safe history routes", () => {
    expect(resolveResultBackHref("/history?filter=image_queue_running")).toBe("/history?filter=image_queue_running");
    expect(resolveResultBackHref("/")).toBe("/");
    expect(resolveResultBackHref("https://example.com/history")).toBe("/");
    expect(resolveResultBackHref(null)).toBe("/");
  });
});
