import { listReplayableScriptTasks } from "@/lib/server/db";
import type { GenerateRequest } from "@/lib/types";
import { hydrateReplayRequest } from "./replay";
import { runResearchAndScriptTask } from "./scriptRunner";

export class TaskRuntime {
  private readonly scriptRuns = new Map<string, Promise<void>>();
  private replayInitialized = false;

  enqueueScript(taskId: string, request: GenerateRequest): void {
    if (this.scriptRuns.has(taskId)) {
      return;
    }

    const run = Promise.resolve()
      .then(() => runResearchAndScriptTask(taskId, request))
      .catch((error) => {
        console.error(`[TaskRuntime] Script run failed for ${taskId}:`, error);
      })
      .finally(() => {
        this.scriptRuns.delete(taskId);
      });

    this.scriptRuns.set(taskId, run);
  }

  ensureReplay(): void {
    if (this.replayInitialized) {
      return;
    }
    this.replayInitialized = true;

    for (const task of listReplayableScriptTasks()) {
      this.enqueueScript(task.taskId, hydrateReplayRequest(task.replayPayload));
    }
  }
}

let taskRuntime: TaskRuntime | undefined;

export function getTaskRuntime(): TaskRuntime {
  if (!taskRuntime) {
    taskRuntime = new TaskRuntime();
  }
  taskRuntime.ensureReplay();
  return taskRuntime;
}
