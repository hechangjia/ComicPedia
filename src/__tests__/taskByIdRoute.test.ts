import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getTaskByIdMock,
  listTaskJobsByTaskIdMock,
  summarizeTaskJobsMock,
  countRecoverableComfyJobsMock,
  fileRefsToUrlsMock,
  getTaskRuntimeMock,
} = vi.hoisted(() => ({
  getTaskByIdMock: vi.fn(),
  listTaskJobsByTaskIdMock: vi.fn(),
  summarizeTaskJobsMock: vi.fn(),
  countRecoverableComfyJobsMock: vi.fn(),
  fileRefsToUrlsMock: vi.fn((value) => value),
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
  restoreFileRefs: vi.fn((value) => value),
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
});
