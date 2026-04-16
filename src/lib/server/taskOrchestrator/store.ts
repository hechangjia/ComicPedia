import { randomUUID } from "node:crypto";
import { listTaskJobsByTaskId as listTaskJobsByTaskIdFromDb, upsertTaskJob } from "@/lib/server/db";
import type { TaskJobKind, TaskJobRecord, TaskJobStatus, TaskQueueSummary } from "@/lib/types";
import { TASK_QUEUE_RUNNING_STATUSES } from "./types";

interface CreateTaskJobInput {
  taskId: string;
  kind: TaskJobKind;
  status: TaskJobStatus;
  panelIndex?: number;
  provider?: string;
  model?: string;
  promptSnapshot?: string;
  outputFileKey?: string;
  lastError?: string;
  attemptCount?: number;
  payload?: Record<string, unknown>;
}

const RUNNING_STATUS_SET = new Set<TaskJobStatus>(TASK_QUEUE_RUNNING_STATUSES);
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
    panelIndex: input.panelIndex,
    provider: input.provider,
    model: input.model,
    promptSnapshot: input.promptSnapshot,
    outputFileKey: input.outputFileKey,
    lastError: input.lastError,
    attemptCount: input.attemptCount ?? 0,
    payload: input.payload ?? {},
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
    failed: 0,
    attachFailed: 0,
    completed: 0,
    calibrationPending: 0,
  };

  for (const job of jobs) {
    if (job.status === "queued") {
      summary.queued += 1;
      continue;
    }
    if (job.status === "calibrating") {
      summary.calibrationPending += 1;
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
    if (job.status === "attach_failed") {
      summary.attachFailed += 1;
      continue;
    }
    if (job.status === "failed") {
      summary.failed += 1;
    }
  }

  return summary;
}
