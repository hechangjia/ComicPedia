import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getTasksPaginatedMock } = vi.hoisted(() => ({
  getTasksPaginatedMock: vi.fn(),
}));

vi.mock("@/lib/server/db", () => ({
  getTasksPaginated: getTasksPaginatedMock,
  upsertTask: vi.fn(),
  clearAllTasks: vi.fn(),
  getAllTaskIds: vi.fn(),
}));

vi.mock("@/lib/server/imageExtractor", () => ({
  extractTaskImagesAsync: vi.fn(),
  fileRefsToUrls: vi.fn((value) => value),
  trashTaskImages: vi.fn(),
}));

describe("/api/tasks GET", () => {
  beforeEach(() => {
    getTasksPaginatedMock.mockReset();
  });

  it("keeps persisted review summary fields in list items for history badges", async () => {
    getTasksPaginatedMock.mockReturnValue({
      total: 1,
      tasks: [
        {
          id: "task-1",
          status: "completed",
          progress: 100,
          createdAt: new Date("2026-03-27T00:00:00.000Z"),
          updatedAt: new Date("2026-03-27T01:00:00.000Z"),
          script: {
            title: "Review Task",
            topic: "Topic",
            style: "anime",
            panels: [
              {
                id: 1,
                scene: "Scene 1",
                dialogue: "Dialogue 1",
                imageUrl: "data:image/png;base64,1",
                status: "completed",
              },
            ],
          },
          reviewStatus: "needs_repair",
          visualQualityScore: {
            overall: 8.3,
            panels: [],
            retryRecommendations: [{ panelIndex: 0, reason: "blur", suggestedFix: "sharpen" }],
            evaluatedAt: "2026-03-27T01:00:00.000Z",
          },
          visualRetrySummary: {
            status: "skipped",
            startedAt: "2026-03-27T01:00:00.000Z",
            finishedAt: "2026-03-27T01:00:00.000Z",
            initialOverallScore: 8.3,
            finalOverallScore: 8.3,
            attemptedPanels: [],
            outcomes: [],
          },
          panelReview: [
            { panelIndex: 0, status: "needs_repair", score: 8.3, issues: ["blur"] },
          ],
          lastReviewAt: "2026-03-27T01:00:00.000Z",
        },
      ],
    });

    const { GET } = await import("@/app/api/tasks/route");
    const request = new NextRequest("http://localhost:3000/api/tasks?page=1&pageSize=10");

    const response = await GET(request);
    const body = await response.json();

    expect(body.tasks[0]).toMatchObject({
      id: "task-1",
      reviewStatus: "needs_repair",
      visualQualityScore: expect.objectContaining({ overall: 8.3 }),
      visualRetrySummary: expect.objectContaining({ status: "skipped" }),
    });
    expect(body.tasks[0].visualQualityScore.retryRecommendations).toHaveLength(1);
  });
});
