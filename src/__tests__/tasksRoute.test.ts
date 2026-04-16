import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
  getTaskSummariesPaginatedMock,
  getTasksPaginatedByOriginsMock,
  getTasksPaginatedMock,
  upsertTaskMock,
  clearAllTasksMock,
  getAllTaskIdsMock,
  deleteTasksByIdsMock,
  extractTaskImagesAsyncMock,
  fileRefsToUrlsMock,
  trashTaskImagesMock,
  listTaskJobsByTaskIdMock,
  summarizeTaskJobsMock,
  countRecoverableComfyJobsMock,
  getTaskRuntimeMock,
  enqueueScriptMock,
  buildServerScriptReplayPayloadMock,
  validateServerReplayPayloadMock,
  randomUUIDMock,
} = vi.hoisted(() => ({
  getTaskSummariesPaginatedMock: vi.fn(),
  getTasksPaginatedByOriginsMock: vi.fn(),
  getTasksPaginatedMock: vi.fn(),
  upsertTaskMock: vi.fn(),
  clearAllTasksMock: vi.fn(),
  getAllTaskIdsMock: vi.fn(),
  deleteTasksByIdsMock: vi.fn(),
  extractTaskImagesAsyncMock: vi.fn(),
  fileRefsToUrlsMock: vi.fn((value) => value),
  trashTaskImagesMock: vi.fn(),
  listTaskJobsByTaskIdMock: vi.fn(),
  summarizeTaskJobsMock: vi.fn(),
  countRecoverableComfyJobsMock: vi.fn(),
  getTaskRuntimeMock: vi.fn(),
  enqueueScriptMock: vi.fn(),
  buildServerScriptReplayPayloadMock: vi.fn(),
  validateServerReplayPayloadMock: vi.fn(),
  randomUUIDMock: vi.fn(() => "task-created"),
}));

vi.mock("node:crypto", () => ({
  randomUUID: randomUUIDMock,
}));

vi.mock("@/lib/server/db", () => ({
  getTaskSummariesPaginated: getTaskSummariesPaginatedMock,
  getTasksPaginatedByOrigins: getTasksPaginatedByOriginsMock,
  getTasksPaginated: getTasksPaginatedMock,
  upsertTask: upsertTaskMock,
  clearAllTasks: clearAllTasksMock,
  getAllTaskIds: getAllTaskIdsMock,
  deleteTasksByIds: deleteTasksByIdsMock,
}));

vi.mock("@/lib/server/imageExtractor", () => ({
  extractTaskImagesAsync: extractTaskImagesAsyncMock,
  fileRefsToUrls: fileRefsToUrlsMock,
  trashTaskImages: trashTaskImagesMock,
}));

vi.mock("@/lib/server/taskOrchestrator/store", () => ({
  listTaskJobsByTaskId: listTaskJobsByTaskIdMock,
  summarizeTaskJobs: summarizeTaskJobsMock,
}));

vi.mock("@/lib/server/taskOrchestrator/queueMeta", () => ({
  countRecoverableComfyJobs: countRecoverableComfyJobsMock,
}));

vi.mock("@/lib/server/taskOrchestrator/runtime", () => ({
  getTaskRuntime: vi.fn(() => {
    getTaskRuntimeMock();
    return {
      enqueueScript: enqueueScriptMock,
    };
  }),
}));

vi.mock("@/lib/server/taskOrchestrator/replay", () => ({
  buildServerScriptReplayPayload: buildServerScriptReplayPayloadMock,
  validateServerReplayPayload: validateServerReplayPayloadMock,
}));

describe("/api/tasks routes", () => {
  beforeEach(() => {
    getTaskSummariesPaginatedMock.mockReset();
    getTasksPaginatedByOriginsMock.mockReset();
    getTasksPaginatedMock.mockReset();
    upsertTaskMock.mockReset();
    clearAllTasksMock.mockReset();
    getAllTaskIdsMock.mockReset();
    deleteTasksByIdsMock.mockReset();
    extractTaskImagesAsyncMock.mockReset();
    fileRefsToUrlsMock.mockReset();
    fileRefsToUrlsMock.mockImplementation((value) => value);
    trashTaskImagesMock.mockReset();
    listTaskJobsByTaskIdMock.mockReset();
    summarizeTaskJobsMock.mockReset();
    countRecoverableComfyJobsMock.mockReset();
    getTaskRuntimeMock.mockReset();
    enqueueScriptMock.mockReset();
    buildServerScriptReplayPayloadMock.mockReset();
    validateServerReplayPayloadMock.mockReset();
    randomUUIDMock.mockClear();
    clearAllTasksMock.mockReturnValue(0);
    deleteTasksByIdsMock.mockReturnValue(0);
    getAllTaskIdsMock.mockReturnValue([]);
    extractTaskImagesAsyncMock.mockImplementation(async (task) => task);
  });

  it("returns summary view by default and filters to user origin", async () => {
    getTaskSummariesPaginatedMock.mockReturnValue({
      total: 1,
      items: [
        {
          id: "summary-1",
          origin: "user",
          status: "completed",
          progress: 100,
          createdAt: new Date("2026-04-09T00:00:00.000Z"),
          updatedAt: new Date("2026-04-09T00:00:00.000Z"),
          scriptSummary: {
            title: "Summary Task",
            topic: "Topic",
            style: "anime",
            panelCount: 4,
            coverImageUrl: "file://summary-1_panel0_cur",
          },
          queueSummary: {
            queued: 0,
            running: 0,
            paused: 0,
            failed: 0,
            attachFailed: 0,
            completed: 4,
            calibrationPending: 0,
          },
        },
      ],
    });

    const { GET } = await import("@/app/api/tasks/route");
    const response = await GET(new NextRequest("http://localhost:3000/api/tasks?page=1&pageSize=10"));
    const body = await response.json();

    expect(getTaskSummariesPaginatedMock).toHaveBeenCalledWith(1, 10, ["user"]);
    expect(getTasksPaginatedMock).not.toHaveBeenCalled();
    expect(body.tasks[0]).toMatchObject({
      id: "summary-1",
      scriptSummary: expect.objectContaining({
        title: "Summary Task",
        panelCount: 4,
      }),
    });
    expect(body.tasks[0].script).toBeUndefined();
  });

  it("returns full tasks when view=full is requested", async () => {
    getTasksPaginatedMock.mockReturnValue({
      total: 1,
      tasks: [
        {
          id: "full-1",
          origin: "user",
          status: "completed",
          progress: 100,
          createdAt: new Date("2026-04-09T00:00:00.000Z"),
          updatedAt: new Date("2026-04-09T00:00:00.000Z"),
          script: {
            title: "Full Task",
            topic: "Topic",
            style: "flat",
            panels: [
              { id: 1, scene: "Scene", dialogue: "Line", imageUrl: "file://full-1_panel0_cur", status: "completed" },
            ],
          },
        },
      ],
    });

    const { GET } = await import("@/app/api/tasks/route");
    const response = await GET(new NextRequest("http://localhost:3000/api/tasks?page=1&pageSize=10&view=full"));
    const body = await response.json();

    expect(getTasksPaginatedMock).toHaveBeenCalledWith(1, 10);
    expect(body.tasks[0].script.panels).toHaveLength(1);
  });

  it("filters full tasks by origin when view=full specifies origins", async () => {
    getTasksPaginatedByOriginsMock.mockReturnValue({
      total: 1,
      tasks: [
        {
          id: "full-user-1",
          origin: "user",
          status: "completed",
          progress: 100,
          createdAt: new Date("2026-04-09T00:00:00.000Z"),
          updatedAt: new Date("2026-04-09T00:00:00.000Z"),
          script: {
            title: "User Full Task",
            topic: "Topic",
            style: "flat",
            panels: [
              { id: 1, scene: "Scene", dialogue: "Line", imageUrl: "file://full-user-1_panel0_cur", status: "completed" },
            ],
          },
        },
      ],
    });

    const { GET } = await import("@/app/api/tasks/route");
    const response = await GET(new NextRequest("http://localhost:3000/api/tasks?page=1&pageSize=10&view=full&origin=user"));
    const body = await response.json();

    expect(getTasksPaginatedByOriginsMock).toHaveBeenCalledWith(1, 10, ["user"]);
    expect(getTasksPaginatedMock).not.toHaveBeenCalled();
    expect(body.tasks[0].id).toBe("full-user-1");
  });

  it("keeps persisted review summary fields in list items for history badges", async () => {
    getTaskSummariesPaginatedMock.mockReturnValue({
      total: 1,
      items: [
        {
          id: "task-1",
          origin: "user",
          status: "completed",
          progress: 100,
          createdAt: new Date("2026-03-27T00:00:00.000Z"),
          updatedAt: new Date("2026-03-27T01:00:00.000Z"),
          scriptSummary: {
            title: "Review Task",
            topic: "Topic",
            style: "anime",
            panelCount: 1,
            coverImageUrl: "file://task-1_panel0_cur",
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
          queueSummary: {
            queued: 0,
            running: 0,
            paused: 0,
            failed: 0,
            attachFailed: 0,
            completed: 1,
            calibrationPending: 0,
          },
        },
      ],
    });

    const { GET } = await import("@/app/api/tasks/route");
    const request = new NextRequest("http://localhost:3000/api/tasks?page=1&pageSize=10");

    const response = await GET(request);
    const body = await response.json();

    expect(getTaskRuntimeMock).toHaveBeenCalledTimes(1);
    expect(getTaskSummariesPaginatedMock).toHaveBeenCalledWith(1, 10, ["user"]);
    expect(body.tasks[0]).toMatchObject({
      id: "task-1",
      reviewStatus: "needs_repair",
      visualQualityScore: expect.objectContaining({ overall: 8.3 }),
      visualRetrySummary: expect.objectContaining({ status: "skipped" }),
      queueSummary: expect.objectContaining({ completed: 1, attachFailed: 0 }),
    });
    expect(body.tasks[0].visualQualityScore.retryRecommendations).toHaveLength(1);
  });

  it("enriches queueSummary from durable jobs when task metadata does not contain queueSummary", async () => {
    getTaskSummariesPaginatedMock.mockReturnValue({
      total: 1,
      items: [
        {
          id: "task-fallback",
          origin: "user",
          status: "image_queue_running",
          progress: 45,
          createdAt: new Date("2026-03-27T00:00:00.000Z"),
          updatedAt: new Date("2026-03-27T01:00:00.000Z"),
          scriptSummary: {
            title: "Fallback Task",
            topic: "Topic",
            style: "flat",
            panelCount: 0,
          },
        },
      ],
    });
    listTaskJobsByTaskIdMock.mockResolvedValue([{ id: "job-1" }]);
    countRecoverableComfyJobsMock.mockReturnValue(2);
    summarizeTaskJobsMock.mockReturnValue({
      queued: 1,
      running: 2,
      paused: 0,
      failed: 1,
      attachFailed: 1,
      completed: 3,
      calibrationPending: 0,
    });

    const { GET } = await import("@/app/api/tasks/route");
    const request = new NextRequest("http://localhost:3000/api/tasks?page=1&pageSize=10");
    const response = await GET(request);
    const body = await response.json();

    expect(getTaskRuntimeMock).toHaveBeenCalledTimes(1);
    expect(listTaskJobsByTaskIdMock).toHaveBeenCalledWith("task-fallback");
    expect(countRecoverableComfyJobsMock).toHaveBeenCalledWith([{ id: "job-1" }]);
    expect(summarizeTaskJobsMock).toHaveBeenCalledWith([{ id: "job-1" }]);
    expect(body.tasks[0].comfyuiRemotePendingCount).toBe(2);
    expect(body.tasks[0].queueSummary).toEqual({
      queued: 1,
      running: 2,
      paused: 0,
      failed: 1,
      attachFailed: 1,
      completed: 3,
      calibrationPending: 0,
    });
  });

  it("defaults invalid pagination params before reading paginated tasks", async () => {
    getTaskSummariesPaginatedMock.mockReturnValue({
      total: 0,
      items: [],
    });

    const { GET } = await import("@/app/api/tasks/route");
    const request = new NextRequest("http://localhost:3000/api/tasks?page=wat&pageSize=-10");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(getTaskSummariesPaginatedMock).toHaveBeenCalledWith(1, 100, ["user"]);
    expect(body).toEqual({
      tasks: [],
      total: 0,
      page: 1,
      pageSize: 100,
    });
  });

  it("adds stateAuthority to task list items", async () => {
    getTaskSummariesPaginatedMock.mockReturnValue({
      total: 1,
      items: [{
        id: "task-list-state",
        origin: "user",
        status: "script_ready",
        progress: 30,
        createdAt: new Date("2026-04-09T00:00:00.000Z"),
        updatedAt: new Date("2026-04-09T00:00:00.000Z"),
        scriptSummary: { title: "List Task", topic: "Topic", style: "anime", panelCount: 0 },
      }],
    });

    const { GET } = await import("@/app/api/tasks/route");
    const response = await GET(new NextRequest("http://localhost:3000/api/tasks?page=1&pageSize=10"));
    const body = await response.json();

    expect(body.tasks[0]).toMatchObject({
      id: "task-list-state",
      stateAuthority: "server_durable",
    });
  });

  it("creates a server task from a replayable request and enqueues script execution", async () => {
    buildServerScriptReplayPayloadMock.mockReturnValue({ request: { topic: "Topic" } });
    validateServerReplayPayloadMock.mockReturnValue(null);

    const { POST } = await import("@/app/api/tasks/route");
    const request = new NextRequest("http://localhost:3000/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        request: {
          topic: "Topic",
          style: "anime",
          panelCount: 4,
          presetSnapshot: {
            presetId: "balanced-auto",
          },
        },
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(buildServerScriptReplayPayloadMock).toHaveBeenCalledWith(expect.objectContaining({
      topic: "Topic",
    }));
    expect(upsertTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      id: "task-created",
      status: "created",
      serverScriptReplay: { request: { topic: "Topic" } },
    }));
    expect(enqueueScriptMock).toHaveBeenCalledWith("task-created", expect.objectContaining({
      topic: "Topic",
      style: "anime",
    }));
    expect(body).toEqual({ success: true, id: "task-created" });
  });

  it("returns 400 when create request lacks a replayable config", async () => {
    buildServerScriptReplayPayloadMock.mockReturnValue({ request: { topic: "Topic" } });
    validateServerReplayPayloadMock.mockReturnValue("缺少可重放的 LLM 配置，请重新选择有效的模型配置后再试");

    const { POST } = await import("@/app/api/tasks/route");
    const request = new NextRequest("http://localhost:3000/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        request: {
          topic: "Topic",
          style: "anime",
          panelCount: 4,
        },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "缺少可重放的 LLM 配置，请重新选择有效的模型配置后再试",
    });
    expect(upsertTaskMock).not.toHaveBeenCalled();
    expect(enqueueScriptMock).not.toHaveBeenCalled();
  });

  it("syncs a task snapshot by extracting images before persisting", async () => {
    extractTaskImagesAsyncMock.mockResolvedValue({
      id: "task-sync",
      status: "completed",
    });

    const { POST } = await import("@/app/api/tasks/route");
    const request = new NextRequest("http://localhost:3000/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        task: {
          id: "task-sync",
          status: "completed",
        },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(extractTaskImagesAsyncMock).toHaveBeenCalledWith(expect.objectContaining({
      id: "task-sync",
    }));
    expect(upsertTaskMock).toHaveBeenCalledWith({
      id: "task-sync",
      status: "completed",
    });
  });

  it("does not clear all tasks when delete receives an explicit empty selection", async () => {
    const { DELETE } = await import("@/app/api/tasks/route");
    const request = new NextRequest("http://localhost:3000/api/tasks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [] }),
    });

    const response = await DELETE(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(clearAllTasksMock).not.toHaveBeenCalled();
    expect(deleteTasksByIdsMock).not.toHaveBeenCalled();
    expect(body).toEqual({ success: true, deleted: 0 });
  });

  it("returns 400 for malformed JSON delete payloads instead of clearing all tasks", async () => {
    const request = {
      headers: new Headers({ "content-type": "application/json" }),
      json: vi.fn().mockRejectedValue(new Error("bad json")),
    } as unknown as NextRequest;

    const { DELETE } = await import("@/app/api/tasks/route");
    const response = await DELETE(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "删除请求体不是有效 JSON" });
    expect(clearAllTasksMock).not.toHaveBeenCalled();
    expect(deleteTasksByIdsMock).not.toHaveBeenCalled();
  });

  it("returns 400 when delete payload includes ids: null", async () => {
    const { DELETE } = await import("@/app/api/tasks/route");
    const request = new NextRequest("http://localhost:3000/api/tasks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: null }),
    });

    const response = await DELETE(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "删除请求体中的 ids 必须是字符串数组" });
    expect(clearAllTasksMock).not.toHaveBeenCalled();
    expect(deleteTasksByIdsMock).not.toHaveBeenCalled();
  });

  it("returns 400 when delete payload includes ids as a string", async () => {
    const { DELETE } = await import("@/app/api/tasks/route");
    const request = new NextRequest("http://localhost:3000/api/tasks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: "task-1" }),
    });

    const response = await DELETE(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "删除请求体中的 ids 必须是字符串数组" });
    expect(clearAllTasksMock).not.toHaveBeenCalled();
    expect(deleteTasksByIdsMock).not.toHaveBeenCalled();
  });

  it("returns 400 when delete payload includes mixed-type ids", async () => {
    const { DELETE } = await import("@/app/api/tasks/route");
    const request = new NextRequest("http://localhost:3000/api/tasks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ["task-1", 2] }),
    });

    const response = await DELETE(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "删除请求体中的 ids 必须是字符串数组" });
    expect(clearAllTasksMock).not.toHaveBeenCalled();
    expect(deleteTasksByIdsMock).not.toHaveBeenCalled();
  });

  it("returns 400 when delete payload is an empty object", async () => {
    const { DELETE } = await import("@/app/api/tasks/route");
    const request = new NextRequest("http://localhost:3000/api/tasks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await DELETE(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "删除请求体必须包含 ids 字符串数组" });
    expect(clearAllTasksMock).not.toHaveBeenCalled();
    expect(deleteTasksByIdsMock).not.toHaveBeenCalled();
  });

  it("returns 400 when delete payload omits ids", async () => {
    const { DELETE } = await import("@/app/api/tasks/route");
    const request = new NextRequest("http://localhost:3000/api/tasks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ foo: "bar" }),
    });

    const response = await DELETE(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "删除请求体必须包含 ids 字符串数组" });
    expect(clearAllTasksMock).not.toHaveBeenCalled();
    expect(deleteTasksByIdsMock).not.toHaveBeenCalled();
  });
});
