import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerateTask } from "@/lib/types";
import {
  createTaskPageLifecycleController,
  isTaskPagePauseable,
} from "@/hooks/useTaskPageLifecycle";

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

function makeTask(overrides: Partial<GenerateTask> = {}): GenerateTask {
  return {
    id: "task-lifecycle",
    status: "image_queue_running",
    progress: 50,
    createdAt: new Date("2026-04-05T00:00:00.000Z"),
    updatedAt: new Date("2026-04-05T00:00:00.000Z"),
    presetSnapshot: {
      presetId: "balanced-auto",
      leavePagePolicy: "finish_inflight_then_pause",
    },
    script: {
      title: "Task",
      topic: "Topic",
      style: "flat",
      panels: [
        {
          id: 1,
          scene: "场景一",
          dialogue: "对白一",
          imagePrompt: "prompt 1",
          status: "generating",
        },
      ],
    },
    ...overrides,
  } as GenerateTask;
}

describe("useTaskPageLifecycle", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("treats continue_in_background tasks as not pauseable on page leave", () => {
    const task = makeTask({
      presetSnapshot: {
        presetId: "fast-draft",
        leavePagePolicy: "continue_in_background",
      },
    });

    expect(isTaskPagePauseable(task)).toBe(false);
  });

  it("requests pause only once when pagehide fires for pauseable tasks", () => {
    const listeners = new Map<string, () => void>();
    const target = {
      addEventListener: vi.fn((event: string, handler: () => void) => {
        listeners.set(event, handler);
      }),
      removeEventListener: vi.fn((event: string) => {
        listeners.delete(event);
      }),
    };
    const pauseTask = vi.fn().mockResolvedValue(undefined);
    const controller = createTaskPageLifecycleController(target, {
      getTask: () => makeTask(),
      pauseTask,
    });

    listeners.get("pagehide")?.();
    listeners.get("pagehide")?.();

    expect(pauseTask).toHaveBeenCalledTimes(1);
    controller.cleanup();
  });
});
