import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerateRequest, GenerateTaskStatus } from "@/lib/types";

const {
  listReplayableScriptTasksMock,
  listReplayableImageTasksMock,
  listReplayableDeepReviewTasksMock,
  runResearchAndScriptTaskMock,
  runTaskImageQueueMock,
  runTaskDeepReviewQueueMock,
  hydrateReplayRequestMock,
} = vi.hoisted(() => ({
  listReplayableScriptTasksMock: vi.fn(),
  listReplayableImageTasksMock: vi.fn(),
  listReplayableDeepReviewTasksMock: vi.fn(),
  runResearchAndScriptTaskMock: vi.fn(),
  runTaskImageQueueMock: vi.fn(),
  runTaskDeepReviewQueueMock: vi.fn(),
  hydrateReplayRequestMock: vi.fn(),
}));

vi.mock("@/lib/server/db", () => ({
  listReplayableScriptTasks: listReplayableScriptTasksMock,
}));

vi.mock("@/lib/server/taskOrchestrator/scriptRunner", () => ({
  runResearchAndScriptTask: runResearchAndScriptTaskMock,
}));

vi.mock("@/lib/server/taskOrchestrator/imageRunner", () => ({
  listReplayableImageTasks: listReplayableImageTasksMock,
  runTaskImageQueue: runTaskImageQueueMock,
}));

vi.mock("@/lib/server/taskOrchestrator/reviewRunner", () => ({
  listReplayableDeepReviewTasks: listReplayableDeepReviewTasksMock,
  runTaskDeepReviewQueue: runTaskDeepReviewQueueMock,
}));

vi.mock("@/lib/server/taskOrchestrator/replay", () => ({
  hydrateReplayRequest: hydrateReplayRequestMock,
}));

function makeRequest(overrides: Partial<GenerateRequest> = {}): GenerateRequest {
  return {
    topic: "为什么会打雷",
    style: "flat",
    contentType: "science",
    quality: "standard",
    panelCount: 2,
    llmConfig: {
      model: "gpt-4o",
      provider: "openai-compatible",
    },
    ...overrides,
  };
}

function makeTask(
  id: string,
  status: GenerateTaskStatus,
  replayPayload?: unknown,
) {
  return {
    taskId: id,
    status,
    replayPayload,
  };
}

describe("TaskRuntime replay", () => {
  beforeEach(() => {
    vi.resetModules();
    listReplayableScriptTasksMock.mockReset();
    listReplayableImageTasksMock.mockReset();
    listReplayableDeepReviewTasksMock.mockReset();
    runResearchAndScriptTaskMock.mockReset();
    runTaskImageQueueMock.mockReset();
    runTaskDeepReviewQueueMock.mockReset();
    hydrateReplayRequestMock.mockReset();
    listReplayableImageTasksMock.mockResolvedValue([]);
    listReplayableDeepReviewTasksMock.mockResolvedValue([]);
  });

  it("re-enqueues persisted script-phase tasks on first initialization only", async () => {
    const replayRequest = makeRequest();
    listReplayableScriptTasksMock.mockReturnValue([
      makeTask("task-created", "created", replayRequest),
      makeTask("task-research", "research_running", replayRequest),
      makeTask("task-script", "script_running", replayRequest),
    ]);
    hydrateReplayRequestMock.mockReturnValue(replayRequest);
    runResearchAndScriptTaskMock.mockResolvedValue(undefined);

    const { getTaskRuntime } = await import("@/lib/server/taskOrchestrator/runtime");
    getTaskRuntime();
    await Promise.resolve();
    await Promise.resolve();

    expect(listReplayableScriptTasksMock).toHaveBeenCalledTimes(1);
    expect(hydrateReplayRequestMock).toHaveBeenCalledTimes(3);
    expect(runResearchAndScriptTaskMock).toHaveBeenCalledTimes(3);
    expect(runResearchAndScriptTaskMock).toHaveBeenNthCalledWith(1, "task-created", replayRequest);
    expect(runResearchAndScriptTaskMock).toHaveBeenNthCalledWith(2, "task-research", replayRequest);
    expect(runResearchAndScriptTaskMock).toHaveBeenNthCalledWith(3, "task-script", replayRequest);

    getTaskRuntime();
    await Promise.resolve();

    expect(listReplayableScriptTasksMock).toHaveBeenCalledTimes(1);
    expect(runResearchAndScriptTaskMock).toHaveBeenCalledTimes(3);
  });

  it("coalesces a second image-queue enqueue request and reruns after the active pass finishes", async () => {
    let releaseFirstRun: (() => void) | undefined;
    runTaskImageQueueMock.mockImplementationOnce(() => new Promise<void>((resolve) => {
      releaseFirstRun = resolve;
    }));
    runTaskImageQueueMock.mockResolvedValueOnce(undefined);
    listReplayableImageTasksMock.mockResolvedValue([]);
    listReplayableDeepReviewTasksMock.mockResolvedValue([]);
    listReplayableScriptTasksMock.mockReturnValue([]);

    const { getTaskRuntime } = await import("@/lib/server/taskOrchestrator/runtime");
    const runtime = getTaskRuntime();

    runtime.enqueueImageQueue("task-image");
    runtime.enqueueImageQueue("task-image");
    await Promise.resolve();

    expect(runTaskImageQueueMock).toHaveBeenCalledTimes(1);

    releaseFirstRun?.();
    await vi.waitFor(() => {
      expect(runTaskImageQueueMock).toHaveBeenCalledTimes(2);
    });
    expect(runTaskImageQueueMock).toHaveBeenNthCalledWith(1, "task-image", undefined);
    expect(runTaskImageQueueMock).toHaveBeenNthCalledWith(2, "task-image", undefined);
  });

  it("re-enqueues persisted deep-review tasks on first initialization only", async () => {
    listReplayableScriptTasksMock.mockReturnValue([]);
    listReplayableDeepReviewTasksMock.mockResolvedValue([
      { taskId: "task-review-1" },
      { taskId: "task-review-2" },
    ]);
    runTaskDeepReviewQueueMock.mockResolvedValue(undefined);

    const { getTaskRuntime } = await import("@/lib/server/taskOrchestrator/runtime");
    getTaskRuntime();
    await vi.waitFor(() => {
      expect(runTaskDeepReviewQueueMock).toHaveBeenCalledTimes(2);
    });

    expect(listReplayableDeepReviewTasksMock).toHaveBeenCalledTimes(1);
    expect(runTaskDeepReviewQueueMock).toHaveBeenNthCalledWith(1, "task-review-1", undefined);
    expect(runTaskDeepReviewQueueMock).toHaveBeenNthCalledWith(2, "task-review-2", undefined);

    getTaskRuntime();
    await Promise.resolve();

    expect(listReplayableDeepReviewTasksMock).toHaveBeenCalledTimes(1);
    expect(runTaskDeepReviewQueueMock).toHaveBeenCalledTimes(2);
  });

  it("coalesces a second deep-review enqueue request and reruns after the active pass finishes", async () => {
    let releaseFirstRun: (() => void) | undefined;
    runTaskDeepReviewQueueMock.mockImplementationOnce(() => new Promise<void>((resolve) => {
      releaseFirstRun = resolve;
    }));
    runTaskDeepReviewQueueMock.mockResolvedValueOnce(undefined);
    listReplayableScriptTasksMock.mockReturnValue([]);
    listReplayableImageTasksMock.mockResolvedValue([]);
    listReplayableDeepReviewTasksMock.mockResolvedValue([]);

    const { getTaskRuntime } = await import("@/lib/server/taskOrchestrator/runtime");
    const runtime = getTaskRuntime();

    runtime.enqueueDeepReview("task-review");
    runtime.enqueueDeepReview("task-review");
    await Promise.resolve();

    expect(runTaskDeepReviewQueueMock).toHaveBeenCalledTimes(1);

    releaseFirstRun?.();
    await vi.waitFor(() => {
      expect(runTaskDeepReviewQueueMock).toHaveBeenCalledTimes(2);
    });
    expect(runTaskDeepReviewQueueMock).toHaveBeenNthCalledWith(1, "task-review", undefined);
    expect(runTaskDeepReviewQueueMock).toHaveBeenNthCalledWith(2, "task-review", undefined);
  });
});
