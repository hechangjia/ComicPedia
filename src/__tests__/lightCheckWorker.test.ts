import { describe, expect, it, vi } from "vitest";
import { runPanelLightCheck } from "@/lib/server/taskOrchestrator/lightCheck";
import { evaluateSinglePanelVisualQuality } from "@/lib/vlmScorer";

vi.mock("@/lib/vlmScorer", () => ({
  evaluateSinglePanelVisualQuality: vi.fn(),
}));

describe("runPanelLightCheck", () => {
  it("updates panelReview without forcing a full visual diagnosis", async () => {
    vi.mocked(evaluateSinglePanelVisualQuality).mockResolvedValue({
      panelIndex: 0,
      textImageAlignment: 5,
      styleAdherence: 6,
      artifactScore: 5,
      compositionQuality: 4,
      overall: 5,
      issues: ["slightly blurry"],
    });

    const task = await runPanelLightCheck({
      id: "task-light-check",
      status: "image_queue_running",
      progress: 50,
      createdAt: new Date("2026-04-05T00:00:00.000Z"),
      updatedAt: new Date("2026-04-05T00:00:00.000Z"),
      script: {
        title: "Light Check",
        topic: "Light Check",
        style: "anime",
        panels: [
          {
            id: 1,
            scene: "A",
            dialogue: "A",
            imagePrompt: "A",
            imageUrl: "data:image/png;base64,abc",
            status: "completed",
          },
        ],
      },
    }, 0, { provider: "openai-compatible", model: "gpt-4o-mini" });

    expect(task.panelReview?.[0]).toMatchObject({
      panelIndex: 0,
      score: 5,
      status: "needs_repair",
    });
    expect(task.visualDiagnosisReport).toBeUndefined();
  });
});
