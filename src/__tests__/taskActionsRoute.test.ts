import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getTaskByIdMock,
  enqueuePanelImageJobsMock,
  approveTaskCalibrationMock,
  pauseTaskJobsMock,
  reconcileTaskJobsMock,
  resumeTaskJobsMock,
  enqueueImageQueueMock,
  enqueueDeepReviewMock,
} = vi.hoisted(() => ({
  getTaskByIdMock: vi.fn(),
  enqueuePanelImageJobsMock: vi.fn(),
  approveTaskCalibrationMock: vi.fn(),
  pauseTaskJobsMock: vi.fn(),
  reconcileTaskJobsMock: vi.fn(),
  resumeTaskJobsMock: vi.fn(),
  enqueueImageQueueMock: vi.fn(),
  enqueueDeepReviewMock: vi.fn(),
}));

vi.mock("@/lib/server/db", () => ({
  getTaskById: getTaskByIdMock,
}));

vi.mock("@/lib/server/taskOrchestrator/imageRunner", () => ({
  enqueuePanelImageJobs: enqueuePanelImageJobsMock,
  approveTaskCalibration: approveTaskCalibrationMock,
}));

vi.mock("@/lib/server/taskOrchestrator/reconcile", () => ({
  pauseTaskJobs: pauseTaskJobsMock,
  reconcileTaskJobs: reconcileTaskJobsMock,
  resumeTaskJobs: resumeTaskJobsMock,
}));

vi.mock("@/lib/server/taskOrchestrator/runtime", () => ({
  getTaskRuntime: vi.fn(() => ({
    enqueueImageQueue: enqueueImageQueueMock,
    enqueueDeepReview: enqueueDeepReviewMock,
  })),
}));

describe("/api/tasks/[id]/actions POST", () => {
  beforeEach(() => {
    vi.resetModules();
    getTaskByIdMock.mockReset();
    enqueuePanelImageJobsMock.mockReset();
    approveTaskCalibrationMock.mockReset();
    pauseTaskJobsMock.mockReset();
    reconcileTaskJobsMock.mockReset();
    resumeTaskJobsMock.mockReset();
    enqueueImageQueueMock.mockReset();
    enqueueDeepReviewMock.mockReset();
  });

  it("enqueues selected panel jobs and starts the image runtime", async () => {
    getTaskByIdMock.mockReturnValue({
      id: "task-actions",
      status: "script_ready",
      progress: 30,
      script: {
        title: "Task Actions",
        topic: "Topic",
        style: "anime",
        panels: [
          { id: 1, scene: "Scene 1", dialogue: "Dialogue 1", imagePrompt: "Prompt 1", status: "pending" },
          { id: 2, scene: "Scene 2", dialogue: "Dialogue 2", imagePrompt: "Prompt 2", status: "pending" },
        ],
      },
      createdAt: new Date("2026-04-05T00:00:00.000Z"),
      updatedAt: new Date("2026-04-05T00:00:00.000Z"),
    });
    enqueuePanelImageJobsMock.mockResolvedValue({
      enqueuedPanelIndices: [1],
      queueSummary: {
        queued: 1,
        running: 0,
        paused: 0,
        failed: 0,
        attachFailed: 0,
        completed: 0,
        calibrationPending: 0,
      },
    });

    const { POST } = await import("@/app/api/tasks/[id]/actions/route");
    const request = new NextRequest("http://localhost:3000/api/tasks/task-actions/actions", {
      method: "POST",
      body: JSON.stringify({
        action: "queue_panel_images",
        panelIndices: [1],
        imageConfig: {
          apiUrl: "http://127.0.0.1:8188",
          endpointType: "comfyui",
          comfyuiWorkflow: "{\"1\":{\"class_type\":\"CLIPTextEncode\",\"inputs\":{\"text\":\"old prompt\"}}}",
        },
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: "task-actions" }) });
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(enqueuePanelImageJobsMock).toHaveBeenCalledWith("task-actions", expect.objectContaining({
      panelIndices: [1],
      imageConfigId: undefined,
      imageConfig: expect.objectContaining({
        apiUrl: "http://127.0.0.1:8188",
        endpointType: "comfyui",
      }),
    }));
    expect(enqueueImageQueueMock).toHaveBeenCalledWith("task-actions");
    expect(body).toEqual(expect.objectContaining({
      success: true,
      enqueuedPanelIndices: [1],
      queueSummary: expect.objectContaining({ queued: 1 }),
    }));
  });

  it("passes through an explicit imageConfigId for durable queue replay", async () => {
    getTaskByIdMock.mockReturnValue({
      id: "task-actions",
      status: "script_ready",
      progress: 30,
      script: {
        title: "Task Actions",
        topic: "Topic",
        style: "anime",
        panels: [
          { id: 1, scene: "Scene 1", dialogue: "Dialogue 1", imagePrompt: "Prompt 1", status: "pending" },
        ],
      },
      createdAt: new Date("2026-04-05T00:00:00.000Z"),
      updatedAt: new Date("2026-04-05T00:00:00.000Z"),
    });
    enqueuePanelImageJobsMock.mockResolvedValue({
      enqueuedPanelIndices: [0],
      queueSummary: {
        queued: 1,
        running: 0,
        paused: 0,
        failed: 0,
        attachFailed: 0,
        completed: 0,
        calibrationPending: 0,
      },
    });

    const { POST } = await import("@/app/api/tasks/[id]/actions/route");
    const request = new NextRequest("http://localhost:3000/api/tasks/task-actions/actions", {
      method: "POST",
      body: JSON.stringify({
        action: "queue_panel_images",
        panelIndices: [0],
        imageConfigId: "img-remote-1",
        imageConfig: {
          apiUrl: "https://remote.example.com/v1",
          apiKey: "remote-secret",
          endpointType: "images",
          model: "gpt-image-1",
          size: "1024x1024",
        },
      }),
    });

    await POST(request, { params: Promise.resolve({ id: "task-actions" }) });

    expect(enqueuePanelImageJobsMock).toHaveBeenCalledWith("task-actions", expect.objectContaining({
      imageConfigId: "img-remote-1",
    }));
  });

  it("returns 400 for queue validation errors instead of a generic 500", async () => {
    getTaskByIdMock.mockReturnValue({
      id: "task-actions",
      status: "script_ready",
      progress: 30,
      script: {
        title: "Task Actions",
        topic: "Topic",
        style: "anime",
        panels: [
          { id: 1, scene: "Scene 1", dialogue: "Dialogue 1", imagePrompt: "Prompt 1", status: "pending" },
        ],
      },
      createdAt: new Date("2026-04-05T00:00:00.000Z"),
      updatedAt: new Date("2026-04-05T00:00:00.000Z"),
    });
    enqueuePanelImageJobsMock.mockRejectedValue(new Error("缺少可重放的图片配置，请重新选择有效的图片模型配置后再试"));

    const { POST } = await import("@/app/api/tasks/[id]/actions/route");
    const request = new NextRequest("http://localhost:3000/api/tasks/task-actions/actions", {
      method: "POST",
      body: JSON.stringify({
        action: "queue_panel_images",
        panelIndices: [0],
        imageConfig: {
          apiUrl: "https://remote.example.com/v1",
          endpointType: "images",
          model: "gpt-image-1",
          size: "1024x1024",
        },
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: "task-actions" }) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "缺少可重放的图片配置，请重新选择有效的图片模型配置后再试",
    });
  });

  it("resumes deep review work through the runtime when the task is deep_review_paused", async () => {
    getTaskByIdMock.mockReturnValue({
      id: "task-actions",
      status: "deep_review_paused",
      progress: 90,
      script: {
        title: "Task Actions",
        topic: "Topic",
        style: "anime",
        panels: [
          { id: 1, scene: "Scene 1", dialogue: "Dialogue 1", imagePrompt: "Prompt 1", status: "completed" },
        ],
      },
      createdAt: new Date("2026-04-05T00:00:00.000Z"),
      updatedAt: new Date("2026-04-05T00:00:00.000Z"),
    });
    resumeTaskJobsMock.mockResolvedValue({
      id: "task-actions",
      status: "deep_review_running",
      progress: 90,
      queueSummary: {
        queued: 1,
        running: 0,
        paused: 0,
        failed: 0,
        attachFailed: 0,
        completed: 1,
        calibrationPending: 0,
      },
      script: {
        title: "Task Actions",
        topic: "Topic",
        style: "anime",
        panels: [
          { id: 1, scene: "Scene 1", dialogue: "Dialogue 1", imagePrompt: "Prompt 1", status: "completed" },
        ],
      },
      createdAt: new Date("2026-04-05T00:00:00.000Z"),
      updatedAt: new Date("2026-04-05T00:00:00.000Z"),
    });

    const { POST } = await import("@/app/api/tasks/[id]/actions/route");
    const request = new NextRequest("http://localhost:3000/api/tasks/task-actions/actions", {
      method: "POST",
      body: JSON.stringify({ action: "resume" }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: "task-actions" }) });
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(resumeTaskJobsMock).toHaveBeenCalledWith("task-actions");
    expect(enqueueDeepReviewMock).toHaveBeenCalledWith("task-actions");
    expect(enqueueImageQueueMock).not.toHaveBeenCalled();
    expect(body).toEqual(expect.objectContaining({
      success: true,
      task: expect.objectContaining({ status: "deep_review_running" }),
      queueSummary: expect.objectContaining({ queued: 1 }),
    }));
  });
});
