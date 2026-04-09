import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getTaskByIdMock,
  listTaskJobsByTaskIdMock,
  summarizeTaskJobsMock,
  countRecoverableComfyJobsMock,
  fileRefsToUrlsMock,
  restoreFileRefsMock,
  getTaskRuntimeMock,
} = vi.hoisted(() => ({
  getTaskByIdMock: vi.fn(),
  listTaskJobsByTaskIdMock: vi.fn(),
  summarizeTaskJobsMock: vi.fn(),
  countRecoverableComfyJobsMock: vi.fn(),
  fileRefsToUrlsMock: vi.fn((value) => value),
  restoreFileRefsMock: vi.fn((value) => value),
  getTaskRuntimeMock: vi.fn(),
}));

vi.mock("@/lib/server/db", () => ({
  getTaskById: getTaskByIdMock,
  upsertTask: vi.fn(),
  deleteTask: vi.fn(),
  patchTask: vi.fn(),
}));

vi.mock("@/lib/server/imageExtractor", () => ({
  extractTaskImagesAsync: vi.fn(),
  trashTaskImages: vi.fn(),
  restoreFileRefs: restoreFileRefsMock,
  fileRefsToUrls: fileRefsToUrlsMock,
}));

vi.mock("@/lib/server/taskOrchestrator/store", () => ({
  listTaskJobsByTaskId: listTaskJobsByTaskIdMock,
  summarizeTaskJobs: summarizeTaskJobsMock,
}));

vi.mock("@/lib/server/taskOrchestrator/queueMeta", () => ({
  countRecoverableComfyJobs: countRecoverableComfyJobsMock,
}));

vi.mock("@/lib/server/taskOrchestrator/runtime", () => ({
  getTaskRuntime: getTaskRuntimeMock,
}));

describe("/api/tasks/[id] GET", () => {
  beforeEach(() => {
    getTaskByIdMock.mockReset();
    listTaskJobsByTaskIdMock.mockReset();
    summarizeTaskJobsMock.mockReset();
    countRecoverableComfyJobsMock.mockReset();
    fileRefsToUrlsMock.mockReset();
    fileRefsToUrlsMock.mockImplementation((value) => value);
    restoreFileRefsMock.mockReset();
    restoreFileRefsMock.mockImplementation((value) => value);
    getTaskRuntimeMock.mockReset();
  });

  it("enriches queueSummary from durable jobs when task does not have queueSummary", async () => {
    getTaskByIdMock.mockReturnValue({
      id: "task-detail",
      status: "image_queue_running",
      progress: 10,
      requestSnapshot: { llmConfig: { apiKey: "secret" } },
      serverScriptReplay: { llm: { fallback: { model: "gpt-4o" } } },
      createdAt: new Date("2026-03-27T00:00:00.000Z"),
      updatedAt: new Date("2026-03-27T00:00:00.000Z"),
    });
    listTaskJobsByTaskIdMock.mockResolvedValue([{ id: "job-detail-1" }]);
    countRecoverableComfyJobsMock.mockReturnValue(1);
    summarizeTaskJobsMock.mockReturnValue({
      queued: 0,
      running: 1,
      paused: 0,
      failed: 0,
      attachFailed: 1,
      completed: 0,
      calibrationPending: 1,
    });

    const { GET } = await import("@/app/api/tasks/[id]/route");
    const request = new NextRequest("http://localhost:3000/api/tasks/task-detail");
    const response = await GET(request, { params: Promise.resolve({ id: "task-detail" }) });
    const body = await response.json();

    expect(getTaskRuntimeMock).toHaveBeenCalledTimes(1);
    expect(listTaskJobsByTaskIdMock).toHaveBeenCalledWith("task-detail");
    expect(countRecoverableComfyJobsMock).toHaveBeenCalledWith([{ id: "job-detail-1" }]);
    expect(summarizeTaskJobsMock).toHaveBeenCalledWith([{ id: "job-detail-1" }]);
    expect(body.comfyuiRemotePendingCount).toBe(1);
    expect(body.queueSummary).toEqual({
      queued: 0,
      running: 1,
      paused: 0,
      failed: 0,
      attachFailed: 1,
      completed: 0,
      calibrationPending: 1,
    });
    expect(body).not.toHaveProperty("requestSnapshot");
    expect(body).not.toHaveProperty("serverScriptReplay");
  });

  it("restores base64 refs when withImages=base64 is requested", async () => {
    getTaskByIdMock.mockReturnValue({
      id: "task-detail",
      status: "completed",
      progress: 100,
      createdAt: new Date("2026-03-27T00:00:00.000Z"),
      updatedAt: new Date("2026-03-27T00:00:00.000Z"),
    });
    listTaskJobsByTaskIdMock.mockResolvedValue([]);
    countRecoverableComfyJobsMock.mockReturnValue(0);
    summarizeTaskJobsMock.mockReturnValue({
      queued: 0,
      running: 0,
      paused: 0,
      failed: 0,
      attachFailed: 0,
      completed: 0,
      calibrationPending: 0,
    });

    const { GET } = await import("@/app/api/tasks/[id]/route");
    const request = new NextRequest("http://localhost:3000/api/tasks/task-detail?withImages=base64");
    await GET(request, { params: Promise.resolve({ id: "task-detail" }) });

    expect(restoreFileRefsMock).toHaveBeenCalledTimes(1);
    expect(fileRefsToUrlsMock).not.toHaveBeenCalled();
  });

  it("adds stateAuthority to task detail payloads", async () => {
    getTaskByIdMock.mockReturnValue({
      id: "task-detail-state",
      status: "completed",
      progress: 100,
      createdAt: new Date("2026-04-09T00:00:00.000Z"),
      updatedAt: new Date("2026-04-09T00:10:00.000Z"),
      script: { title: "Done", topic: "Topic", style: "anime", panels: [] },
    });

    const { GET } = await import("@/app/api/tasks/[id]/route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/tasks/task-detail-state"),
      { params: Promise.resolve({ id: "task-detail-state" }) },
    );
    const body = await response.json();

    expect(body).toMatchObject({
      id: "task-detail-state",
      stateAuthority: "settled",
    });
  });
});
