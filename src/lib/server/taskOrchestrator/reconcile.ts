import { getTaskById, upsertTask, upsertTaskJob } from "@/lib/server/db";
import { listTaskJobsByTaskId, summarizeTaskJobs } from "./store";
import type { GenerateTask, TaskJobKind, TaskJobRecord, TaskQueueSummary } from "@/lib/types";

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

const EXPLICIT_PAUSE_JOB_STATUSES = new Set<TaskJobRecord["status"]>(["queued"]);
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

function updateJob(job: TaskJobRecord, patch: Partial<TaskJobRecord>): TaskJobRecord {
  return {
    ...job,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

function getLastCompletedPanelImage(task: GenerateTask, panelIndex: number): string | undefined {
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

function reconcileRunningPanelState(task: GenerateTask, panelIndex: number): boolean {
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

function buildImageQueueStatus(task: GenerateTask, summary: TaskQueueSummary): GenerateTask["status"] {
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

function buildDeepReviewStatus(task: GenerateTask, summary: TaskQueueSummary): GenerateTask["status"] {
  if (summary.queued > 0 || summary.running > 0) {
    return "deep_review_running";
  }
  if (summary.failed > 0 || summary.attachFailed > 0 || summary.paused > 0) {
    return "deep_review_paused";
  }
  return task.status === "deep_review_running" || task.status === "deep_review_paused"
    ? "completed"
    : task.status;
}

function summarizeJobsForKind(jobs: TaskJobRecord[], kind: TaskJobKind): TaskQueueSummary {
  return summarizeTaskJobs(jobs.filter((job) => job.kind === kind));
}

function hasActiveJobsForKind(jobs: TaskJobRecord[], kind: TaskJobKind): boolean {
  return jobs.some((job) => job.kind === kind && NON_TERMINAL_JOB_STATUSES.has(job.status));
}

function getActiveTaskJobKind(task: GenerateTask, jobs: TaskJobRecord[]): TaskJobKind | undefined {
  if (hasActiveJobsForKind(jobs, "deep_review")) {
    return "deep_review";
  }
  if (hasActiveJobsForKind(jobs, "panel_image")) {
    return "panel_image";
  }
  if ((task.status === "deep_review_running" || task.status === "deep_review_paused")
    && jobs.some((job) => job.kind === "deep_review")) {
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

function buildTaskStatus(task: GenerateTask, jobs: TaskJobRecord[]): GenerateTask["status"] {
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
  const completedPanels = task.script.panels.filter((panel) => panel.status === "completed").length;
  if (completedPanels === totalPanels) {
    return 100;
  }
  return 30 + Math.floor((completedPanels / totalPanels) * 70);
}

function isSameQueueSummary(
  left: TaskQueueSummary | undefined,
  right: TaskQueueSummary,
): boolean {
  if (!left) {
    return false;
  }
  return left.queued === right.queued
    && left.running === right.running
    && left.paused === right.paused
    && left.failed === right.failed
    && left.attachFailed === right.attachFailed
    && left.completed === right.completed
    && left.calibrationPending === right.calibrationPending;
}

function finalizeTask(task: GenerateTask, jobs: TaskJobRecord[]): GenerateTask {
  const queueSummary = summarizeTaskJobs(jobs);
  return {
    ...task,
    queueSummary,
    status: buildTaskStatus(task, jobs),
    progress: buildTaskProgress(task),
    updatedAt: new Date(),
  };
}

async function applyJobTransition(
  taskId: string,
  match: (job: TaskJobRecord) => boolean,
  onMatchedJob?: (task: GenerateTask, job: TaskJobRecord) => boolean,
): Promise<GenerateTask> {
  const task = getTaskById(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const jobs = await listTaskJobsByTaskId(taskId);
  let taskChanged = false;
  let jobsChanged = false;
  const nextJobs = jobs.map((job) => {
    if (!match(job)) {
      return job;
    }

    if (onMatchedJob && onMatchedJob(task, job)) {
      taskChanged = true;
    }

    jobsChanged = true;
    return updateJob(job, {
      status: "paused",
      lastError: undefined,
    });
  });

  const nextTask = finalizeTask(task, nextJobs);
  const queueSummaryChanged = !isSameQueueSummary(task.queueSummary, nextTask.queueSummary!);
  const taskStateChanged = task.status !== nextTask.status || task.progress !== nextTask.progress;

  if (!jobsChanged && !taskChanged && !queueSummaryChanged && !taskStateChanged) {
    return nextTask;
  }

  for (let index = 0; index < jobs.length; index += 1) {
    if (jobs[index] !== nextJobs[index]) {
      upsertTaskJob(nextJobs[index]);
    }
  }
  upsertTask(nextTask);
  return nextTask;
}

export async function reconcileTaskJobs(taskId: string): Promise<GenerateTask> {
  return applyJobTransition(
    taskId,
    (job) => RECONCILE_PAUSEABLE_JOB_STATUSES.has(job.status),
    (task, job) => {
      if (job.kind !== "panel_image" || typeof job.panelIndex !== "number") {
        return false;
      }
      if (!RUNNING_JOB_STATUSES.has(job.status)) {
        return false;
      }
      return reconcileRunningPanelState(task, job.panelIndex);
    },
  );
}

export async function pauseTaskJobs(taskId: string): Promise<GenerateTask> {
  return applyJobTransition(
    taskId,
    (job) => EXPLICIT_PAUSE_JOB_STATUSES.has(job.status)
      || (job.kind === "deep_review" && RUNNING_JOB_STATUSES.has(job.status)),
  );
}

export async function resumeTaskJobs(taskId: string): Promise<GenerateTask> {
  const task = getTaskById(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const jobs = await listTaskJobsByTaskId(taskId);
  let jobsChanged = false;
  const nextJobs = jobs.map((job) => {
    if (!RESUMABLE_JOB_STATUSES.has(job.status)) {
      return job;
    }
    jobsChanged = true;
    return updateJob(job, {
      status: "queued",
      lastError: undefined,
    });
  });

  const nextTask = finalizeTask(task, nextJobs);
  const queueSummaryChanged = !isSameQueueSummary(task.queueSummary, nextTask.queueSummary!);
  const taskStateChanged = task.status !== nextTask.status || task.progress !== nextTask.progress;

  if (!jobsChanged && !queueSummaryChanged && !taskStateChanged) {
    return nextTask;
  }

  for (let index = 0; index < jobs.length; index += 1) {
    if (jobs[index] !== nextJobs[index]) {
      upsertTaskJob(nextJobs[index]);
    }
  }
  upsertTask(nextTask);
  return nextTask;
}
