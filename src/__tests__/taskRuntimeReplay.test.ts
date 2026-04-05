import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerateRequest, GenerateTaskStatus } from "@/lib/types";

const {
  listReplayableScriptTasksMock,
  runResearchAndScriptTaskMock,
  hydrateReplayRequestMock,
} = vi.hoisted(() => ({
  listReplayableScriptTasksMock: vi.fn(),
  runResearchAndScriptTaskMock: vi.fn(),
  hydrateReplayRequestMock: vi.fn(),
}));

vi.mock("@/lib/server/db", () => ({
  listReplayableScriptTasks: listReplayableScriptTasksMock,
}));

vi.mock("@/lib/server/taskOrchestrator/scriptRunner", () => ({
  runResearchAndScriptTask: runResearchAndScriptTaskMock,
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
    runResearchAndScriptTaskMock.mockReset();
    hydrateReplayRequestMock.mockReset();
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
});
