import { getAllTasks, getConfig, getTaskById, upsertTask, upsertTaskJob } from "@/lib/server/db";
import type {
  PartialLLMConfig,
  TaskJobRecord,
  UserAPIConfigV2,
  UserLLMConfig,
  VisualDiagnosisReport,
} from "@/lib/types";
import { evaluateVisualDiagnosis, summarizeDiagnosisReport } from "@/lib/vlmDiagnosis";
import { markDiagnosisFailed, markDiagnosisRunning, markDiagnosisSucceeded } from "@/lib/vlmDiagnosisState";
import { listTaskJobsByTaskId, summarizeTaskJobs } from "./store";

const PROCESSABLE_REVIEW_JOB_STATUSES = new Set<TaskJobRecord["status"]>([
  "queued",
  "generating",
  "persisting",
  "light_check",
]);

type SanitizedLLMConfig = Omit<PartialLLMConfig, "apiKey">;

interface StoredReviewJobPayload extends Record<string, unknown> {
  review?: {
    configId?: string;
    fallback?: SanitizedLLMConfig;
    targetPanels?: number[];
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function updateJob(job: TaskJobRecord, patch: Partial<TaskJobRecord>): TaskJobRecord {
  return {
    ...job,
    ...patch,
    updatedAt: nowIso(),
  };
}

function isLocalApiUrl(apiUrl?: string): boolean {
  if (!apiUrl) return false;
  try {
    const url = new URL(apiUrl);
    return ["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(url.hostname);
  } catch {
    return false;
  }
}

function matchesLLMConfig(candidate: UserLLMConfig, config?: SanitizedLLMConfig): boolean {
  if (!config) return false;
  return candidate.apiUrl === config.apiUrl
    && candidate.model === config.model
    && candidate.protocolType === config.provider;
}

function buildLLMConfig(config?: UserLLMConfig): PartialLLMConfig | undefined {
  if (!config) return undefined;
  return {
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    model: config.model,
    provider: config.protocolType,
  };
}

function getReviewConfigCandidates(config: UserAPIConfigV2 | null): UserLLMConfig[] {
  if (!config) {
    return [];
  }
  return [
    ...(config.vlmConfigs ?? []),
    ...config.llmConfigs,
  ];
}

function resolveReviewConfig(
  payload: StoredReviewJobPayload["review"],
  config: UserAPIConfigV2 | null,
  fallback?: PartialLLMConfig,
): PartialLLMConfig | undefined {
  const candidates = getReviewConfigCandidates(config);

  if (payload?.configId) {
    const matched = candidates.find((candidate) => candidate.id === payload.configId);
    if (matched) {
      return buildLLMConfig(matched);
    }
  }

  if (payload?.fallback) {
    const matched = candidates.find((candidate) => matchesLLMConfig(candidate, payload.fallback));
    if (matched) {
      return buildLLMConfig(matched);
    }

    if (isLocalApiUrl(payload.fallback.apiUrl)) {
      return payload.fallback;
    }
  }

  if (fallback) {
    return fallback;
  }

  if (config?.activeVLMId) {
    const matched = (config.vlmConfigs ?? []).find((candidate) => candidate.id === config.activeVLMId);
    if (matched) {
      return buildLLMConfig(matched);
    }
  }

  if (config?.activeLLMId) {
    const matched = config.llmConfigs.find((candidate) => candidate.id === config.activeLLMId);
    if (matched) {
      return buildLLMConfig(matched);
    }
  }

  return buildLLMConfig(candidates[0]);
}

function sanitizeTargetPanels(panelIndices: number[] | undefined, panelCount: number): number[] | undefined {
  const sanitized = [...new Set(panelIndices ?? [])]
    .filter((panelIndex) => Number.isInteger(panelIndex) && panelIndex >= 0 && panelIndex < panelCount)
    .sort((left, right) => left - right);
  return sanitized.length > 0 ? sanitized : undefined;
}

function getTargetPanels(job: TaskJobRecord, panelCount: number): number[] | undefined {
  const payload = job.payload as StoredReviewJobPayload;
  const payloadPanels = sanitizeTargetPanels(payload.review?.targetPanels, panelCount);
  if (payloadPanels) {
    return payloadPanels;
  }
  if (typeof job.panelIndex === "number" && job.panelIndex >= 0 && job.panelIndex < panelCount) {
    return [job.panelIndex];
  }
  return undefined;
}

function mergeDiagnosisReports(
  existing: VisualDiagnosisReport | undefined,
  incoming: VisualDiagnosisReport,
): VisualDiagnosisReport {
  if (!existing) {
    return incoming;
  }

  const panelsByIndex = new Map<number, VisualDiagnosisReport["panels"][number]>();
  for (const panel of existing.panels) {
    panelsByIndex.set(panel.panelIndex, panel);
  }
  for (const panel of incoming.panels) {
    panelsByIndex.set(panel.panelIndex, panel);
  }

  const panels = Array.from(panelsByIndex.values()).sort((left, right) => left.panelIndex - right.panelIndex);
  return {
    ...incoming,
    panels,
    summary: summarizeDiagnosisReport(panels),
  };
}

async function persistReviewState(taskId: string): Promise<void> {
  const task = getTaskById(taskId);
  if (!task) {
    return;
  }

  const jobs = await listTaskJobsByTaskId(taskId);
  const queueSummary = summarizeTaskJobs(jobs);
  const deepReviewJobs = jobs.filter((job) => job.kind === "deep_review");
  const deepReviewSummary = summarizeTaskJobs(deepReviewJobs);

  task.queueSummary = queueSummary;
  if (deepReviewSummary.queued > 0 || deepReviewSummary.running > 0 || deepReviewSummary.calibrationPending > 0) {
    task.status = "deep_review_running";
  } else if (deepReviewSummary.paused > 0 || deepReviewSummary.failed > 0 || deepReviewSummary.attachFailed > 0) {
    task.status = "deep_review_paused";
  } else if (task.status === "deep_review_running" || task.status === "deep_review_paused") {
    task.status = task.script?.panels.every((panel) => panel.status === "completed") ? "completed" : "script_ready";
  }
  task.updatedAt = new Date();
  upsertTask(task);
}

export async function runTaskDeepReviewQueue(
  taskId: string,
  input?: {
    llmConfig?: PartialLLMConfig;
  },
): Promise<void> {
  const baseTask = getTaskById(taskId);
  if (!baseTask?.script) {
    throw new Error(`Task not ready for deep review: ${taskId}`);
  }

  const jobs = (await listTaskJobsByTaskId(taskId))
    .filter((job) => job.kind === "deep_review" && PROCESSABLE_REVIEW_JOB_STATUSES.has(job.status))
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));

  if (jobs.length === 0) {
    await persistReviewState(taskId);
    return;
  }

  for (const job of jobs) {
    const task = getTaskById(taskId);
    if (!task?.script) {
      throw new Error(`Task not ready for deep review: ${taskId}`);
    }

    const resolvedConfig = resolveReviewConfig(
      (job.payload as StoredReviewJobPayload).review,
      getConfig(),
      input?.llmConfig,
    );
    if (!resolvedConfig?.apiUrl || !resolvedConfig.model || !resolvedConfig.provider) {
      const message = "缺少可用的视觉评审模型配置，无法继续深度评审";
      markDiagnosisFailed(task);
      task.updatedAt = new Date();
      upsertTask(task);
      upsertTaskJob(updateJob(job, {
        status: "failed",
        lastError: message,
      }));
      await persistReviewState(taskId);
      continue;
    }

    if (!task.visualQualityScore) {
      const message = "视觉评分尚未完成，无法继续深度评审";
      markDiagnosisFailed(task);
      task.updatedAt = new Date();
      upsertTask(task);
      upsertTaskJob(updateJob(job, {
        status: "failed",
        lastError: message,
      }));
      await persistReviewState(taskId);
      continue;
    }

    markDiagnosisRunning(task);
    task.status = "deep_review_running";
    task.updatedAt = new Date();
    upsertTask(task);
    upsertTaskJob(updateJob(job, {
      status: "light_check",
      lastError: undefined,
    }));

    try {
      const report = await evaluateVisualDiagnosis(
        task.script,
        task.visualQualityScore,
        resolvedConfig,
        getTargetPanels(job, task.script.panels.length),
      );
      const latestTask = getTaskById(taskId);
      if (!latestTask) {
        throw new Error(`Task not found after deep review: ${taskId}`);
      }

      const mergedReport = mergeDiagnosisReports(latestTask.visualDiagnosisReport, report);
      markDiagnosisSucceeded(latestTask, mergedReport);
      latestTask.updatedAt = new Date();
      upsertTask(latestTask);
      upsertTaskJob(updateJob(job, {
        status: "completed",
        lastError: undefined,
      }));
    } catch (error) {
      const latestTask = getTaskById(taskId);
      if (latestTask) {
        markDiagnosisFailed(latestTask, error instanceof Error ? error : undefined);
        latestTask.updatedAt = new Date();
        upsertTask(latestTask);
      }
      upsertTaskJob(updateJob(job, {
        status: "failed",
        lastError: error instanceof Error ? error.message : "深度评审失败",
      }));
    }

    await persistReviewState(taskId);
  }
}

export async function listReplayableDeepReviewTasks(): Promise<Array<{ taskId: string }>> {
  const replayableTasks: Array<{ taskId: string }> = [];

  for (const task of getAllTasks()) {
    const jobs = await listTaskJobsByTaskId(task.id);
    const replayableJob = jobs.find((job) =>
      job.kind === "deep_review"
      && PROCESSABLE_REVIEW_JOB_STATUSES.has(job.status),
    );

    if (!replayableJob) {
      continue;
    }

    replayableTasks.push({ taskId: task.id });
  }

  return replayableTasks;
}
