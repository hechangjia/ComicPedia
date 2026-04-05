import { randomUUID } from "node:crypto";
import { listTaskJobsByTaskId as listTaskJobsByTaskIdFromDb, upsertTaskJob } from "@/lib/server/db";
import type { TaskJobKind, TaskJobRecord, TaskJobStatus, TaskQueueSummary } from "@/lib/types";
import { TASK_QUEUE_FAILED_STATUSES, TASK_QUEUE_RUNNING_STATUSES } from "./types";

interface CreateTaskJobInput {
  taskId: string;
  kind: TaskJobKind;
  status: TaskJobStatus;
  payload?: Record<string, unknown>;
  error?: string;
}

const RUNNING_STATUS_SET = new Set<TaskJobStatus>(TASK_QUEUE_RUNNING_STATUSES);
const FAILED_STATUS_SET = new Set<TaskJobStatus>(TASK_QUEUE_FAILED_STATUSES);
let lastIssuedTimestampMs = 0;

function nextIsoTimestamp(): string {
  const now = Date.now();
  const timestampMs = now <= lastIssuedTimestampMs ? lastIssuedTimestampMs + 1 : now;
  lastIssuedTimestampMs = timestampMs;
  return new Date(timestampMs).toISOString();
}

export async function createTaskJob(input: CreateTaskJobInput): Promise<TaskJobRecord> {
  const now = nextIsoTimestamp();
  const job: TaskJobRecord = {
    id: randomUUID(),
    taskId: input.taskId,
    kind: input.kind,
    status: input.status,
    payload: input.payload,
    error: input.error,
    createdAt: now,
    updatedAt: now,
  };
  upsertTaskJob(job);
  return job;
}

export async function listTaskJobsByTaskId(taskId: string): Promise<TaskJobRecord[]> {
  return listTaskJobsByTaskIdFromDb(taskId);
}

export function summarizeTaskJobs(jobs: TaskJobRecord[]): TaskQueueSummary {
  const summary: TaskQueueSummary = {
    queued: 0,
    running: 0,
    paused: 0,
    completed: 0,
    failed: 0,
    total: jobs.length,
  };

  for (const job of jobs) {
    if (job.status === "queued") {
      summary.queued += 1;
      continue;
    }
    if (RUNNING_STATUS_SET.has(job.status)) {
      summary.running += 1;
      continue;
    }
    if (job.status === "paused") {
      summary.paused += 1;
      continue;
    }
    if (job.status === "completed") {
      summary.completed += 1;
      continue;
    }
    if (FAILED_STATUS_SET.has(job.status)) {
      summary.failed += 1;
    }
  }

  return summary;
}
