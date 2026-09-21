import { mutateTaskQueueState } from "@/lib/server/db";
import {
  countRecoverableComfyJobs,
  hasReplayableComfyPrompt,
} from "./queueMeta";
import { summarizeTaskJobs } from "./store";
import type {
  GenerateTask,
  TaskJobKind,
  TaskJobRecord,
  TaskQueueSummary,
} from "@/lib/types";

const RUNNING_JOB_STATUSES = new Set<TaskJobRecord["status"]>([
  "generating",
  "persisting",
  "light_check",
]);

const RECONCILE_PAUSEABLE_JOB_STATUSES = new Set<TaskJobRecord["status"]>([
  "queued",
  "generating",
  "persisting",
  "light_check",
]);

const EXPLICIT_PAUSE_JOB_STATUSES = new Set<TaskJobRecord["status"]>([
  "queued",
]);
const RESUMABLE_JOB_STATUSES = new Set<TaskJobRecord["status"]>(["paused"]);
const NON_TERMINAL_JOB_STATUSES = new Set<TaskJobRecord["status"]>([
  "queued",
  "calibrating",
  "generating",
  "persisting",
  "light_check",
  "paused",
  "attach_failed",
  "failed",
]);

function shouldKeepRecoveringRemoteImageJob(job: TaskJobRecord): boolean {
  return job.status === "generating" && hasReplayableComfyPrompt(job);
}

function updateJob(
  job: TaskJobRecord,
  patch: Partial<TaskJobRecord>,
): TaskJobRecord {
  return {
    ...job,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

function getLastCompletedPanelImage(
  task: GenerateTask,
  panelIndex: number,
): string | undefined {
  const panel = task.script?.panels[panelIndex];
  if (!panel) {
    return undefined;
  }
  if (panel.imageUrl) {
    return panel.imageUrl;
  }
  const latestVersion = panel.imageVersions?.[panel.imageVersions.length - 1];
  return latestVersion?.imageUrl;
}

function reconcileRunningPanelState(
  task: GenerateTask,
  panelIndex: number,
): boolean {
  const panel = task.script?.panels[panelIndex];
  if (!panel || panel.status !== "generating") {
    return false;
  }

  const previousImageUrl = getLastCompletedPanelImage(task, panelIndex);
  if (previousImageUrl) {
    panel.imageUrl = previousImageUrl;
    panel.status = "completed";
    return true;
  }

  panel.imageUrl = undefined;
  panel.status = "pending";
  return true;
}

function buildImageQueueStatus(
  task: GenerateTask,
  summary: TaskQueueSummary,
): GenerateTask["status"] {
  if (summary.calibrationPending > 0) {
    return "calibrating";
  }
  if (summary.queued > 0 || summary.running > 0) {
    return "image_queue_running";
  }
  if (summary.failed > 0 || summary.attachFailed > 0 || summary.paused > 0) {
    return "image_queue_paused";
  }
  if (task.script?.panels.every((panel) => panel.status === "completed")) {
    return "completed";
  }
  return "script_ready";
}

function buildDeepReviewStatus(
  task: GenerateTask,
  summary: TaskQueueSummary,
): GenerateTask["status"] {
  if (summary.queued > 0 || summary.running > 0) {
    return "deep_review_running";
  }
  if (summary.failed > 0 || summary.attachFailed > 0 || summary.paused > 0) {
    return "deep_review_paused";
  }
  return task.status === "deep_review_running" ||
    task.status === "deep_review_paused"
    ? "completed"
    : task.status;
}

function summarizeJobsForKind(
  jobs: TaskJobRecord[],
  kind: TaskJobKind,
): TaskQueueSummary {
  return summarizeTaskJobs(jobs.filter((job) => job.kind === kind));
}

function hasActiveJobsForKind(
  jobs: TaskJobRecord[],
  kind: TaskJobKind,
): boolean {
  return jobs.some(
    (job) => job.kind === kind && NON_TERMINAL_JOB_STATUSES.has(job.status),
  );
}

function getActiveTaskJobKind(
  task: GenerateTask,
  jobs: TaskJobRecord[],
): TaskJobKind | undefined {
  if (hasActiveJobsForKind(jobs, "deep_review")) {
    return "deep_review";
  }
  if (hasActiveJobsForKind(jobs, "panel_image")) {
    return "panel_image";
  }
  if (
    (task.status === "deep_review_running" ||
      task.status === "deep_review_paused") &&
    jobs.some((job) => job.kind === "deep_review")
  ) {
    return "deep_review";
  }
  if (jobs.some((job) => job.kind === "panel_image")) {
    return "panel_image";
  }
  if (jobs.some((job) => job.kind === "deep_review")) {
    return "deep_review";
  }
  return undefined;
}

function buildTaskStatus(
  task: GenerateTask,
  jobs: TaskJobRecord[],
): GenerateTask["status"] {
  const activeKind = getActiveTaskJobKind(task, jobs);
  if (activeKind === "panel_image") {
    return buildImageQueueStatus(task, summarizeJobsForKind(jobs, activeKind));
  }
  if (activeKind === "deep_review") {
    return buildDeepReviewStatus(task, summarizeJobsForKind(jobs, activeKind));
  }
  return task.status;
}

function buildTaskProgress(task: GenerateTask): number {
  if (!task.script?.panels.length) {
    return task.progress;
  }

  const totalPanels = task.script.panels.length;
  const completedPanels = task.script.panels.filter(
    (panel) => panel.status === "completed",
  ).length;
  if (completedPanels === totalPanels) {
    return 100;
  }
  return 30 + Math.floor((completedPanels / totalPanels) * 70);
}

function finalizeTask(task: GenerateTask, jobs: TaskJobRecord[]): GenerateTask {
  const queueSummary = summarizeTaskJobs(jobs);
  return {
    ...task,
    queueSummary,
    comfyuiRemotePendingCount: countRecoverableComfyJobs(jobs),
    status: buildTaskStatus(task, jobs),
    progress: buildTaskProgress(task),
    updatedAt: new Date(),
  };
}

function transitionTask(
  taskId: string,
  transition: (task: GenerateTask, job: TaskJobRecord) => TaskJobRecord,
): GenerateTask {
  const result = mutateTaskQueueState(taskId, (task, jobs) => {
    for (let index = 0; index < jobs.length; index++)
      jobs[index] = transition(task, jobs[index]);
    Object.assign(task, finalizeTask(task, jobs));
    const reviews = jobs.filter((job) => job.kind === "deep_review");
    if (
      reviews.length &&
      !reviews.some((job) => RUNNING_JOB_STATUSES.has(job.status)) &&
      task.visualDiagnosisState === "running"
    ) {
      task.visualDiagnosisState = task.visualDiagnosisReport
        ? "succeeded"
        : "idle";
    }
    return task;
  });
  if (!result) throw new Error(`Task not found: ${taskId}`);
  return result;
}

function withoutReviewExecution(job: TaskJobRecord): TaskJobRecord["payload"] {
  if (job.kind !== "deep_review") return job.payload;
  const { reviewExecutionId: _runId, ...payload } = job.payload;
  return payload;
}

export async function reconcileTaskJobs(taskId: string): Promise<GenerateTask> {
  return transitionTask(taskId, (task, job) => {
    if (
      !RECONCILE_PAUSEABLE_JOB_STATUSES.has(job.status) ||
      shouldKeepRecoveringRemoteImageJob(job)
    )
      return job;
    if (
      job.kind === "panel_image" &&
      typeof job.panelIndex === "number" &&
      RUNNING_JOB_STATUSES.has(job.status)
    ) {
      reconcileRunningPanelState(task, job.panelIndex);
    }
    return updateJob(job, {
      status: "paused",
      lastError: undefined,
      payload: withoutReviewExecution(job),
    });
  });
}

export async function pauseTaskJobs(taskId: string): Promise<GenerateTask> {
  return transitionTask(taskId, (_task, job) => {
    if (
      !EXPLICIT_PAUSE_JOB_STATUSES.has(job.status) &&
      !(job.kind === "deep_review" && RUNNING_JOB_STATUSES.has(job.status))
    )
      return job;
    return updateJob(job, {
      status: "paused",
      lastError: undefined,
      payload: withoutReviewExecution(job),
    });
  });
}

export async function resumeTaskJobs(taskId: string): Promise<GenerateTask> {
  return transitionTask(taskId, (_task, job) => {
    if (
      !RESUMABLE_JOB_STATUSES.has(job.status) &&
      !(job.status === "failed" && hasReplayableComfyPrompt(job))
    )
      return job;
    return updateJob(job, {
      status: "queued",
      lastError: undefined,
      payload: withoutReviewExecution(job),
    });
  });
}
