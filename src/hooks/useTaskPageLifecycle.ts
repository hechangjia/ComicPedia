import { useEffect, useRef } from "react";
import type { GenerateTask } from "@/lib/types";

const PAGEHIDE_PAUSEABLE_STATUSES = new Set<GenerateTask["status"]>([
  "image_queue_running",
  "deep_review_running",
]);
const OFF_PAGE_RECONCILE_STATUSES = new Set<GenerateTask["status"]>([
  "image_queue_running",
  "deep_review_running",
]);
const OFF_PAGE_RECONCILE_STALE_MS = 5 * 60 * 1000;

type TaskLifecycleAction = "pause" | "resume" | "reconcile";

interface TaskActionResponse {
  task?: GenerateTask;
  error?: string;
}

interface BindTaskPageLifecycleOptions {
  getTask: () => GenerateTask | null;
  pauseTask: (task: GenerateTask) => void | Promise<unknown>;
}

export function isTaskPagePauseable(task: GenerateTask | null): task is GenerateTask {
  return !!task && PAGEHIDE_PAUSEABLE_STATUSES.has(task.status);
}

function getTaskTimestamp(value: Date | string | undefined): number | null {
  if (!value) {
    return null;
  }

  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function shouldAttemptOffPageReconcile(task: GenerateTask | null, now = Date.now()): task is GenerateTask {
  if (!task || !OFF_PAGE_RECONCILE_STATUSES.has(task.status)) {
    return false;
  }

  const updatedAt = getTaskTimestamp(task.updatedAt);
  if (updatedAt === null) {
    return false;
  }

  return now - updatedAt >= OFF_PAGE_RECONCILE_STALE_MS;
}

async function postTaskLifecycleAction(
  taskId: string,
  action: TaskLifecycleAction,
  init?: { keepalive?: boolean },
): Promise<GenerateTask | undefined> {
  const response = await fetch(`/api/tasks/${taskId}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
    keepalive: init?.keepalive,
  });

  const body = await response.json().catch(() => ({} as TaskActionResponse));
  if (!response.ok) {
    throw new Error(body.error || `Task action failed: ${response.status}`);
  }

  return body.task;
}

export function createTaskPageLifecycleController(
  target: Pick<Window, "addEventListener" | "removeEventListener">,
  options: BindTaskPageLifecycleOptions,
): {
  cleanup: () => void;
  requestPause: () => boolean;
} {
  let pauseRequested = false;

  const requestPause = () => {
    const task = options.getTask();
    if (!isTaskPagePauseable(task) || pauseRequested) {
      return false;
    }

    pauseRequested = true;
    void Promise.resolve(options.pauseTask(task)).catch((error) => {
      console.warn("[useTaskPageLifecycle] Failed to pause task on pagehide:", error);
      pauseRequested = false;
    });
    return true;
  };

  const handlePageHide = () => {
    requestPause();
  };

  target.addEventListener("pagehide", handlePageHide);

  return {
    cleanup: () => {
      target.removeEventListener("pagehide", handlePageHide);
    },
    requestPause,
  };
}

export function bindTaskPageLifecycle(
  target: Pick<Window, "addEventListener" | "removeEventListener">,
  options: BindTaskPageLifecycleOptions,
): () => void {
  return createTaskPageLifecycleController(target, options).cleanup;
}

export async function pauseTaskLifecycle(taskId: string, keepalive = false): Promise<GenerateTask | undefined> {
  return postTaskLifecycleAction(taskId, "pause", { keepalive });
}

export async function resumeTaskLifecycle(taskId: string): Promise<GenerateTask | undefined> {
  return postTaskLifecycleAction(taskId, "resume");
}

export async function reconcileTaskLifecycle(taskId: string): Promise<GenerateTask | undefined> {
  return postTaskLifecycleAction(taskId, "reconcile");
}

export function useTaskPageLifecycle(task: GenerateTask | null) {
  const taskRef = useRef(task);
  const stableMountRef = useRef(false);

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const controller = createTaskPageLifecycleController(window, {
      getTask: () => taskRef.current,
      pauseTask: (currentTask) => pauseTaskLifecycle(currentTask.id, true),
    });
    const rafId = window.requestAnimationFrame(() => {
      stableMountRef.current = true;
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      if (stableMountRef.current) {
        controller.requestPause();
      }
      stableMountRef.current = false;
      controller.cleanup();
    };
  }, []);
}
