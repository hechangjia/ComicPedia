import type { GenerateRequest } from "@/lib/types";
import { runResearchAndScriptTask } from "./scriptRunner";

export class TaskRuntime {
  private readonly scriptRuns = new Map<string, Promise<void>>();

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
}

let taskRuntime: TaskRuntime | undefined;

export function getTaskRuntime(): TaskRuntime {
  if (!taskRuntime) {
    taskRuntime = new TaskRuntime();
  }
  return taskRuntime;
}
