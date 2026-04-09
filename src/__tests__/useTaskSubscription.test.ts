import { describe, expect, it } from "vitest";
import {
  getPollingInterval,
  isRecoverableLocalStatus,
  isServerPollingStatus,
  shouldContinuePollingAfterRead,
} from "@/hooks/useTaskSubscription";

describe("useTaskSubscription helpers", () => {
  it("treats durable queue states as server polling states", () => {
    expect(isServerPollingStatus("image_queue_running")).toBe(true);
    expect(isServerPollingStatus("deep_review_running")).toBe(true);
    expect(isServerPollingStatus("calibrating")).toBe(true);
  });

  it("keeps zombie recovery limited to legacy local-only states", () => {
    expect(isRecoverableLocalStatus("generating")).toBe(true);
    expect(isRecoverableLocalStatus("scripting")).toBe(true);
    expect(isRecoverableLocalStatus("image_queue_running")).toBe(false);
    expect(isRecoverableLocalStatus("deep_review_running")).toBe(false);
  });

  it("polls active durable queue states aggressively", () => {
    expect(getPollingInterval({ status: "image_queue_running" } as never)).toBe(2000);
    expect(getPollingInterval({ status: "deep_review_running" } as never)).toBe(2000);
    expect(getPollingInterval({ status: "calibrating" } as never)).toBe(2000);
  });

  it("keeps polling after a temporary missing task read", () => {
    expect(shouldContinuePollingAfterRead(undefined)).toBe(true);
    expect(shouldContinuePollingAfterRead(null)).toBe(true);
    expect(shouldContinuePollingAfterRead({ status: "failed" } as never)).toBe(false);
    expect(shouldContinuePollingAfterRead({ status: "failed", script: { panels: [] } } as never)).toBe(true);
  });

  it("treats script_ready as a server-owned polling state", () => {
    expect(isServerPollingStatus("script_ready")).toBe(true);
  });

  it("does not treat pending as a zombie-recovery state", () => {
    expect(isRecoverableLocalStatus("pending")).toBe(false);
  });
});
