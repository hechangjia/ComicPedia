import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForPanelImageJob } from "@/lib/client/taskImageQueue";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("durable panel repair completion", () => {
  it("waits for the image job even when an old panel image already exists", async () => {
    vi.useFakeTimers();
    const snapshot = (status: string) => ({ id: "task", script: { panels: [{ status: "completed", imageUrl: "/api/images/old" }] }, queueJobs: [{ kind: "panel_image", panelIndex: 0, status, updatedAt: "2026-10-17" }] });
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => snapshot("generating") }).mockResolvedValueOnce({ ok: true, json: async () => snapshot("completed") });
    vi.stubGlobal("fetch", fetchMock);
    const result = waitForPanelImageJob("task", 0);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await result).script?.panels[0].imageUrl).toBe("/api/images/old");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("reports a failed job without replacing it with browser generation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ queueJobs: [{ kind: "panel_image", panelIndex: 0, status: "failed", lastError: "Synthetic error" }] }) }));
    await expect(waitForPanelImageJob("task", 0)).rejects.toThrow("Synthetic error");
  });
});
