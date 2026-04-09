import { useEffect, useRef } from "react";
import type { GenerateTask } from "@/lib/types";
import {
  shouldAttemptOffPageTaskReconcile,
  shouldPauseTaskOnLeave as shouldPauseTaskOnLeaveByAuthority,
} from "@/lib/taskStateAuthority";

type TaskLifecycleAction = "pause" | "resume" | "reconcile";

interface TaskActionResponse {
  task?: GenerateTask;
  error?: string;
}

interface BindTaskPageLifecycleOptions {
  getTask: () => GenerateTask | null;
  pauseTask: (task: GenerateTask) => void | Promise<unknown>;
}

function shouldPauseTaskOnLeave(task: GenerateTask | null): task is GenerateTask {
  return !!task && shouldPauseTaskOnLeaveByAuthority(task);
}

export function isTaskPagePauseable(task: GenerateTask | null): task is GenerateTask {
  return shouldPauseTaskOnLeave(task);
}

export function shouldAttemptOffPageReconcile(
  task: Pick<GenerateTask, "status" | "updatedAt"> | null,
  now = Date.now(),
): boolean {
  if (!task) {
    return false;
  }

  return shouldAttemptOffPageTaskReconcile(task, now);
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
      stableMountRef.current = false;
      controller.cleanup();
    };
  }, []);
}
