import { getAllTasks } from "@/lib/server/db";
import type { GenerateRequest, GenerateTask } from "@/lib/types";
import { runResearchAndScriptTask } from "./scriptRunner";

const REPLAYABLE_SCRIPT_STATUSES = new Set<GenerateTask["status"]>([
  "created",
  "research_running",
  "script_running",
]);

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

    for (const task of getAllTasks()) {
      if (!REPLAYABLE_SCRIPT_STATUSES.has(task.status)) {
        continue;
      }
      if (!task.requestSnapshot) {
        console.warn(`[TaskRuntime] Skipping replay for ${task.id}: missing request snapshot`);
        continue;
      }
      this.enqueueScript(task.id, task.requestSnapshot);
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
