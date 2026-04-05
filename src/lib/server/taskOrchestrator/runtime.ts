import { listReplayableScriptTasks } from "@/lib/server/db";
import type { GenerateRequest, PartialImageGenConfig, PartialLLMConfig } from "@/lib/types";
import { listReplayableImageTasks, runTaskImageQueue, type RunTaskImageQueueInput } from "./imageRunner";
import { hydrateReplayRequest } from "./replay";
import { runResearchAndScriptTask } from "./scriptRunner";

async function runTaskDeepReview(_taskId: string): Promise<void> {
  // Deep-review orchestration lands in a later task; Task 5 only needs an
  // explicit runtime dispatch surface so pause/resume/reconcile can round-trip
  // the currently active durable job kind without misrouting to image queues.
}

export class TaskRuntime {
  private readonly scriptRuns = new Map<string, Promise<void>>();
  private readonly imageRuns = new Map<string, Promise<void>>();
  private readonly pendingImageRuns = new Map<string, RunTaskImageQueueInput | undefined>();
  private readonly deepReviewRuns = new Map<string, Promise<void>>();
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
      this.pendingImageRuns.set(
        taskId,
        this.mergeImageRunInput(this.pendingImageRuns.get(taskId), input as RunTaskImageQueueInput | undefined),
      );
      return;
    }

    this.startImageQueueRun(taskId, input as RunTaskImageQueueInput | undefined);
  }

  enqueueDeepReview(taskId: string): void {
    if (this.deepReviewRuns.has(taskId)) {
      return;
    }

    const run = Promise.resolve()
      .then(() => runTaskDeepReview(taskId))
      .catch((error) => {
        console.error(`[TaskRuntime] Deep review run failed for ${taskId}:`, error);
      })
      .finally(() => {
        this.deepReviewRuns.delete(taskId);
      });

    this.deepReviewRuns.set(taskId, run);
  }

  private startImageQueueRun(taskId: string, input?: RunTaskImageQueueInput): void {
    const run = Promise.resolve()
      .then(() => runTaskImageQueue(taskId, input))
      .catch((error) => {
        console.error(`[TaskRuntime] Image queue run failed for ${taskId}:`, error);
      })
      .finally(() => {
        this.imageRuns.delete(taskId);
        const pendingInput = this.pendingImageRuns.get(taskId);
        if (this.pendingImageRuns.has(taskId)) {
          this.pendingImageRuns.delete(taskId);
          this.startImageQueueRun(taskId, pendingInput);
        }
      });

    this.imageRuns.set(taskId, run);
  }

  private mergeImageRunInput(
    current?: RunTaskImageQueueInput,
    next?: RunTaskImageQueueInput,
  ): RunTaskImageQueueInput | undefined {
    if (!current) {
      return next;
    }
    if (!next) {
      return current;
    }

    return {
      imageConfig: next.imageConfig ?? current.imageConfig,
      llmConfig: next.llmConfig ?? current.llmConfig,
    };
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
          this.enqueueImageQueue(task.taskId);
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
