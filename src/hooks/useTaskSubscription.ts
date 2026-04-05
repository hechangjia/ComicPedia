import { useEffect, useState, useRef } from "react";
import { GenerateTask } from "@/lib/types";
import { getTask } from "@/lib/client/db";
import { recoverZombieTask } from "@/lib/client/generator";
import { reconcileTaskLifecycle } from "@/hooks/useTaskPageLifecycle";
import { useTaskStore } from "@/stores/taskStore";

/** Terminal states that no longer need polling */
const TERMINAL_STATUSES = new Set<GenerateTask["status"]>(["completed", "failed"]);

/** Browser-owned active states where real-time updates come via notifyListeners → Zustand store. */
const REALTIME_STATUSES = new Set<GenerateTask["status"]>(["generating", "scripting", "pending"]);
const RECOVERABLE_LOCAL_STATUSES = new Set<GenerateTask["status"]>(["generating", "scripting"]);

/**
 * Subscribe to task state changes.
 * Uses Zustand store selector for real-time updates + adaptive polling fallback.
 * Polling automatically stops when task reaches a terminal state.
 */
export function useTaskSubscription(taskId: string) {
  // Zustand selector: generator pushes changes via notifyListeners → store.updateTask
  const storeTask = useTaskStore((state) => state.tasks[taskId]);
  const [task, setTask] = useState<GenerateTask | null>(null);
  const [error, setError] = useState("");
  const taskRef = useRef(task);

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  // Sync Zustand store changes to local state
  useEffect(() => {
    if (!storeTask) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setTask(storeTask);
      if (storeTask.status === "failed") {
        setError(storeTask.error || "Unknown error");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [storeTask]);

  // Initial load: recover zombie state → hydrate from DB to store
  useEffect(() => {
    if (!taskId) return;

    let cancelled = false;

    async function hydrateTask() {
      try {
        const reconciledTask = await reconcileTaskLifecycle(taskId).catch(() => undefined);
        if (cancelled) return;

        if (reconciledTask) {
          useTaskStore.getState().updateTask(reconciledTask);
          setTask(reconciledTask);
        }

        let loadedTask = await useTaskStore.getState().loadTask(taskId);
        if (!loadedTask) {
          if (!cancelled) {
            setError("Task not found");
          }
          return;
        }

        if (RECOVERABLE_LOCAL_STATUSES.has(loadedTask.status)) {
          await recoverZombieTask(taskId);
          loadedTask = await getTask(taskId) ?? loadedTask;
          useTaskStore.getState().updateTask(loadedTask);
        }

        if (!cancelled) {
          setTask(loadedTask);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Task load failed");
        }
      }
    }

    void hydrateTask();

    return () => {
      cancelled = true;
    };
  }, [taskId]);

  // Adaptive polling fallback (refreshes store via loadTask; store changes auto-trigger selector)
  // Stops automatically when task reaches a terminal state.
  useEffect(() => {
    if (!taskId) return;

    let pollTimer: ReturnType<typeof setTimeout>;
    let stopped = false;

    function schedulePoll() {
      if (stopped) return;

      const current = taskRef.current;

      // Stop polling for terminal states — no further changes expected
      if (current && TERMINAL_STATUSES.has(current.status)) {
        // For failed tasks that still have a script, keep polling
        // (user might retry individual panels)
        if (current.status === "failed" && !current.script) return;
        if (current.status === "completed") return;
      }

      pollTimer = setTimeout(async () => {
        if (stopped) return;

        // Skip server polling during active generation — real-time updates
        // come via notifyListeners → Zustand store. Polling the server would
        // return stale pre-generation data and cause UI flickering.
        const currentStatus = taskRef.current?.status;
        if (currentStatus && REALTIME_STATUSES.has(currentStatus)) {
          schedulePoll();
          return;
        }

        const t = await getTask(taskId);
        if (!t) return;

        // Refresh store (if changed, selector auto-triggers re-render)
        useTaskStore.getState().updateTask(t);

        // Unrecoverable failure: stop polling
        if (t.status === "failed" && !t.script) return;

        schedulePoll();
      }, getPollingInterval(current));
    }

    schedulePoll();

    return () => {
      stopped = true;
      clearTimeout(pollTimer);
    };
  }, [taskId]);

  return { task, setTask, error };
}

/** Return polling interval (ms) based on task status */
function getPollingInterval(task: GenerateTask | null): number {
  if (!task) return 2000;
  switch (task.status) {
    case "created":
    case "research_running":
    case "script_running":
    case "scripting":
    case "generating":
    case "pending":
      return 2000;  // Active states: 2s
    case "script_ready":
      return 5000;  // Script ready, waiting for user: 5s
    case "completed":
    case "failed":
      return 8000;  // Terminal states (fallback, rarely reached): 8s
    default:
      return 5000;
  }
}
