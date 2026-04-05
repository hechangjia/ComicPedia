import { listReplayableScriptTasks } from "@/lib/server/db";
import type { GenerateRequest, PartialImageGenConfig, PartialLLMConfig } from "@/lib/types";
import { listReplayableImageTasks, runTaskImageQueue, type RunTaskImageQueueInput } from "./imageRunner";
import { hydrateReplayRequest } from "./replay";
import { runResearchAndScriptTask } from "./scriptRunner";

export class TaskRuntime {
  private readonly scriptRuns = new Map<string, Promise<void>>();
  private readonly imageRuns = new Map<string, Promise<void>>();
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

  enqueueImageQueue(
    taskId: string,
    input?: {
      imageConfig?: PartialImageGenConfig;
      llmConfig?: PartialLLMConfig;
    },
  ): void {
    if (this.imageRuns.has(taskId)) {
      return;
    }

    const run = Promise.resolve()
      .then(() => runTaskImageQueue(taskId, input as RunTaskImageQueueInput | undefined))
      .catch((error) => {
        console.error(`[TaskRuntime] Image queue run failed for ${taskId}:`, error);
      })
      .finally(() => {
        this.imageRuns.delete(taskId);
      });

    this.imageRuns.set(taskId, run);
  }

  ensureReplay(): void {
    if (this.replayInitialized) {
      return;
    }
    this.replayInitialized = true;

    for (const task of listReplayableScriptTasks()) {
      this.enqueueScript(task.taskId, hydrateReplayRequest(task.replayPayload));
    }

    Promise.resolve()
      .then(async () => {
        for (const task of await listReplayableImageTasks()) {
          this.enqueueImageQueue(task.taskId, { imageConfig: task.imageConfig });
        }
      })
      .catch((error) => {
        console.error("[TaskRuntime] Image replay initialization failed:", error);
      });
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
