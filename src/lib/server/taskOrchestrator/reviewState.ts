import { createHash } from "node:crypto";
import type { ComicScript, GenerateTask, TaskJobRecord } from "@/lib/types";
import { countRecoverableComfyJobs } from "./queueMeta";
import { summarizeTaskJobs } from "./store";

/** Full structured input identity. Local media bytes are verified by server vision I/O. */
export function reviewInputFingerprint(script: ComicScript): string {
  return createHash("sha256").update(JSON.stringify(script)).digest("hex");
}

export function syncReviewQueueState(
  task: GenerateTask,
  jobs: TaskJobRecord[],
): void {
  task.queueSummary = summarizeTaskJobs(jobs);
  task.comfyuiRemotePendingCount = countRecoverableComfyJobs(jobs);
  const reviews = summarizeTaskJobs(
    jobs.filter((job) => job.kind === "deep_review"),
  );
  if (reviews.queued || reviews.running || reviews.calibrationPending)
    task.status = "deep_review_running";
  else if (reviews.paused || reviews.failed || reviews.attachFailed)
    task.status = "deep_review_paused";
  else if (
    task.status === "deep_review_running" ||
    task.status === "deep_review_paused"
  ) {
    task.status = task.script?.panels.every(
      (panel) => panel.status === "completed",
    )
      ? "completed"
      : "script_ready";
  }
  if (
    !reviews.running &&
    !reviews.queued &&
    task.visualDiagnosisState === "running"
  ) {
    task.visualDiagnosisState = task.visualDiagnosisReport
      ? "succeeded"
      : "idle";
  }
}
