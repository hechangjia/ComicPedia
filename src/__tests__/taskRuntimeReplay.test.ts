import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerateRequest, GenerateTask } from "@/lib/types";

const {
  getAllTasksMock,
  runResearchAndScriptTaskMock,
} = vi.hoisted(() => ({
  getAllTasksMock: vi.fn(),
  runResearchAndScriptTaskMock: vi.fn(),
}));

vi.mock("@/lib/server/db", () => ({
  getAllTasks: getAllTasksMock,
}));

vi.mock("@/lib/server/taskOrchestrator/scriptRunner", () => ({
  runResearchAndScriptTask: runResearchAndScriptTaskMock,
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
  status: GenerateTask["status"],
  requestSnapshot?: GenerateRequest,
): GenerateTask {
  return {
    id,
    status,
    progress: 0,
    requestSnapshot,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
  };
}

describe("TaskRuntime replay", () => {
  beforeEach(() => {
    vi.resetModules();
    getAllTasksMock.mockReset();
    runResearchAndScriptTaskMock.mockReset();
  });

  it("re-enqueues persisted script-phase tasks on first initialization only", async () => {
    const replayRequest = makeRequest();
    getAllTasksMock.mockReturnValue([
      makeTask("task-created", "created", replayRequest),
      makeTask("task-research", "research_running", replayRequest),
      makeTask("task-script", "script_running", replayRequest),
      makeTask("task-missing-request", "created"),
      makeTask("task-completed", "completed", replayRequest),
    ]);
    runResearchAndScriptTaskMock.mockResolvedValue(undefined);

    const { getTaskRuntime } = await import("@/lib/server/taskOrchestrator/runtime");
    getTaskRuntime();
    await Promise.resolve();
    await Promise.resolve();

    expect(getAllTasksMock).toHaveBeenCalledTimes(1);
    expect(runResearchAndScriptTaskMock).toHaveBeenCalledTimes(3);
    expect(runResearchAndScriptTaskMock).toHaveBeenNthCalledWith(1, "task-created", replayRequest);
    expect(runResearchAndScriptTaskMock).toHaveBeenNthCalledWith(2, "task-research", replayRequest);
    expect(runResearchAndScriptTaskMock).toHaveBeenNthCalledWith(3, "task-script", replayRequest);

    getTaskRuntime();
    await Promise.resolve();

    expect(getAllTasksMock).toHaveBeenCalledTimes(1);
    expect(runResearchAndScriptTaskMock).toHaveBeenCalledTimes(3);
  });
});
