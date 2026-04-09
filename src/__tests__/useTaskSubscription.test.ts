import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadSubscriptionHelpers() {
  return import("@/hooks/useTaskSubscription");
}

describe("useTaskSubscription helpers", () => {
  it("treats durable queue states as server polling states", async () => {
    const { isServerPollingStatus } = await loadSubscriptionHelpers();
    expect(isServerPollingStatus("image_queue_running")).toBe(true);
    expect(isServerPollingStatus("deep_review_running")).toBe(true);
    expect(isServerPollingStatus("calibrating")).toBe(true);
  });

  it("keeps zombie recovery limited to legacy local-only states", async () => {
    const { isRecoverableLocalStatus } = await loadSubscriptionHelpers();
    expect(isRecoverableLocalStatus("generating")).toBe(true);
    expect(isRecoverableLocalStatus("scripting")).toBe(true);
    expect(isRecoverableLocalStatus("image_queue_running")).toBe(false);
    expect(isRecoverableLocalStatus("deep_review_running")).toBe(false);
  });

  it("polls active durable queue states aggressively", async () => {
    const { getPollingInterval } = await loadSubscriptionHelpers();
    expect(getPollingInterval({ status: "image_queue_running" } as never)).toBe(2000);
    expect(getPollingInterval({ status: "deep_review_running" } as never)).toBe(2000);
    expect(getPollingInterval({ status: "calibrating" } as never)).toBe(2000);
  });

  it("keeps polling after a temporary missing task read", async () => {
    const { shouldContinuePollingAfterRead } = await loadSubscriptionHelpers();
    expect(shouldContinuePollingAfterRead(undefined)).toBe(true);
    expect(shouldContinuePollingAfterRead(null)).toBe(true);
    expect(shouldContinuePollingAfterRead({ status: "failed" } as never)).toBe(false);
    expect(shouldContinuePollingAfterRead({ status: "failed", script: { panels: [] } } as never)).toBe(true);
  });

  it("treats script_ready as a server-owned polling state", async () => {
    const { isServerPollingStatus } = await loadSubscriptionHelpers();
    expect(isServerPollingStatus("script_ready")).toBe(true);
  });

  it("does not treat pending as a zombie-recovery state", async () => {
    const { isRecoverableLocalStatus } = await loadSubscriptionHelpers();
    expect(isRecoverableLocalStatus("pending")).toBe(false);
  });
});

describe("useTaskSubscription polling control flow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("reschedules polling when the first read is missing and updates on the next read", async () => {
    vi.resetModules();

    const secondTask = {
      id: "task-missing-retry",
      status: "failed",
    };
    const getTaskMock = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(secondTask);
    const recoverZombieTaskMock = vi.fn().mockResolvedValue(undefined);
    const reconcileTaskLifecycleMock = vi.fn().mockResolvedValue(undefined);
    const shouldAttemptOffPageReconcileMock = vi.fn(() => false);
    const loadTaskMock = vi.fn().mockResolvedValue({
      id: "task-missing-retry",
      status: "created",
    });
    const updateTaskMock = vi.fn();
    const storeState = {
      tasks: {} as Record<string, unknown>,
    };

    vi.doMock("react", () => ({
      useEffect: (effect: () => void | (() => void)) => {
        effect();
      },
      useRef: (value: unknown) => ({ current: value }),
      useState: <T,>(initial: T) => [initial, vi.fn()] as const,
    }));

    vi.doMock("@/lib/client/db", () => ({
      getTask: getTaskMock,
    }));

    vi.doMock("@/lib/client/generator", () => ({
      recoverZombieTask: recoverZombieTaskMock,
    }));

    vi.doMock("@/hooks/useTaskPageLifecycle", () => ({
      reconcileTaskLifecycle: reconcileTaskLifecycleMock,
      shouldAttemptOffPageReconcile: shouldAttemptOffPageReconcileMock,
    }));

    const useTaskStoreMock = ((selector: (state: typeof storeState) => unknown) => selector(storeState)) as unknown as {
      (selector: (state: typeof storeState) => unknown): unknown;
      getState: () => {
        loadTask: typeof loadTaskMock;
        updateTask: typeof updateTaskMock;
        tasks: Record<string, unknown>;
      };
    };
    useTaskStoreMock.getState = () => ({
      loadTask: loadTaskMock,
      updateTask: updateTaskMock,
      tasks: storeState.tasks,
    });

    vi.doMock("@/stores/taskStore", () => ({
      useTaskStore: useTaskStoreMock,
    }));

    const { useTaskSubscription } = await import("@/hooks/useTaskSubscription");
    useTaskSubscription("task-missing-retry");

    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(2000);

    expect(getTaskMock).toHaveBeenCalledTimes(2);
    expect(getTaskMock).toHaveBeenNthCalledWith(1, "task-missing-retry");
    expect(getTaskMock).toHaveBeenNthCalledWith(2, "task-missing-retry");
    expect(updateTaskMock).toHaveBeenCalledTimes(1);
    expect(updateTaskMock).toHaveBeenCalledWith(secondTask);
  });
});
