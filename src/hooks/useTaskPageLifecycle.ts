import { useEffect, useRef } from "react";
import type { GenerateTask } from "@/lib/types";

const PAGEHIDE_PAUSEABLE_STATUSES = new Set<GenerateTask["status"]>([
  "image_queue_running",
  "deep_review_running",
]);

type TaskLifecycleAction = "pause" | "resume" | "reconcile";

interface TaskActionResponse {
  task?: GenerateTask;
  error?: string;
}

interface BindTaskPageLifecycleOptions {
  getTask: () => GenerateTask | null;
  pauseTask: (task: GenerateTask) => void | Promise<void>;
}

function isTaskPagePauseable(task: GenerateTask | null): task is GenerateTask {
  return !!task && PAGEHIDE_PAUSEABLE_STATUSES.has(task.status);
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

export function bindTaskPageLifecycle(
  target: Pick<Window, "addEventListener" | "removeEventListener">,
  options: BindTaskPageLifecycleOptions,
): () => void {
  let pauseRequested = false;

  const handlePageHide = () => {
    const task = options.getTask();
    if (!isTaskPagePauseable(task) || pauseRequested) {
      return;
    }

    pauseRequested = true;
    void Promise.resolve(options.pauseTask(task)).catch((error) => {
      console.warn("[useTaskPageLifecycle] Failed to pause task on pagehide:", error);
    });
  };

  target.addEventListener("pagehide", handlePageHide);

  return () => {
    target.removeEventListener("pagehide", handlePageHide);
  };
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

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    return bindTaskPageLifecycle(window, {
      getTask: () => taskRef.current,
      pauseTask: (currentTask) => pauseTaskLifecycle(currentTask.id, true),
    });
  }, []);
}
