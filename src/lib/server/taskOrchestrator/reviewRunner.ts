import { createServerVisionRuntime } from "../visionRuntime";
import {
  getAllTasks,
  getConfig,
  getTaskById,
  mutateTaskReviewState,
} from "@/lib/server/db";
import type {
  GenerateTask,
  PanelReview,
  PartialLLMConfig,
  TaskJobRecord,
  UserAPIConfigV2,
  UserLLMConfig,
  VisualDiagnosisReport,
} from "@/lib/types";
import {
  evaluateVisualDiagnosis,
  summarizeDiagnosisReport,
} from "@/lib/vlmDiagnosis";
import {
  markDiagnosisFailed,
  markDiagnosisRunning,
  markDiagnosisSucceeded,
} from "@/lib/vlmDiagnosisState";
import { buildTaskReviewStatus } from "@/lib/vlmRetry";
import { evaluateVisualQuality } from "@/lib/vlmScorer";
import { listTaskJobsByTaskId } from "./store";
import { createHash, randomUUID } from "node:crypto";
import { reviewInputFingerprint, syncReviewQueueState } from "./reviewState";

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
    configRole?: "llm" | "vlm";
    fallback?: SanitizedLLMConfig;
    targetPanels?: number[];
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function updateJob(
  job: TaskJobRecord,
  patch: Partial<TaskJobRecord>,
): TaskJobRecord {
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

function matchesLLMConfig(
  candidate: UserLLMConfig,
  config?: SanitizedLLMConfig,
): boolean {
  if (!config) return false;
  return (
    candidate.apiUrl === config.apiUrl &&
    candidate.model === config.model &&
    candidate.protocolType === config.provider
  );
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

function getReviewConfigCandidates(
  config: UserAPIConfigV2 | null,
): UserLLMConfig[] {
  if (!config) {
    return [];
  }
  return [...(config.vlmConfigs ?? []), ...config.llmConfigs];
}

function resolveReviewConfig(
  payload: StoredReviewJobPayload["review"],
  config: UserAPIConfigV2 | null,
): PartialLLMConfig | undefined {
  const candidates =
    payload?.configRole === "llm"
      ? (config?.llmConfigs ?? [])
      : payload?.configRole === "vlm"
        ? (config?.vlmConfigs ?? [])
        : getReviewConfigCandidates(config);

  if (payload?.configId) {
    return buildLLMConfig(
      candidates.find((candidate) => candidate.id === payload.configId),
    );
  }

  if (payload?.fallback) {
    const matched = candidates.find((candidate) =>
      matchesLLMConfig(candidate, payload.fallback),
    );
    if (matched) {
      return buildLLMConfig(matched);
    }

    if (isLocalApiUrl(payload.fallback.apiUrl)) {
      return payload.fallback;
    }
  }

  if (config?.activeVLMId) {
    const matched = (config.vlmConfigs ?? []).find(
      (candidate) => candidate.id === config.activeVLMId,
    );
    if (matched) {
      return buildLLMConfig(matched);
    }
  }

  if (config?.activeLLMId) {
    const matched = config.llmConfigs.find(
      (candidate) => candidate.id === config.activeLLMId,
    );
    if (matched) {
      return buildLLMConfig(matched);
    }
  }

  return buildLLMConfig(candidates[0]);
}

function sanitizeTargetPanels(
  panelIndices: number[] | undefined,
  panelCount: number,
): number[] | undefined {
  const sanitized = [...new Set(panelIndices ?? [])]
    .filter(
      (panelIndex) =>
        Number.isInteger(panelIndex) &&
        panelIndex >= 0 &&
        panelIndex < panelCount,
    )
    .sort((left, right) => left - right);
  return sanitized.length > 0 ? sanitized : undefined;
}

function getTargetPanels(
  job: TaskJobRecord,
  panelCount: number,
): number[] | undefined {
  const payload = job.payload as StoredReviewJobPayload;
  const payloadPanels = sanitizeTargetPanels(
    payload.review?.targetPanels,
    panelCount,
  );
  if (payloadPanels) {
    return payloadPanels;
  }
  if (
    typeof job.panelIndex === "number" &&
    job.panelIndex >= 0 &&
    job.panelIndex < panelCount
  ) {
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

  const panelsByIndex = new Map<
    number,
    VisualDiagnosisReport["panels"][number]
  >();
  for (const panel of existing.panels) {
    panelsByIndex.set(panel.panelIndex, panel);
  }
  for (const panel of incoming.panels) {
    panelsByIndex.set(panel.panelIndex, panel);
  }

  const panels = Array.from(panelsByIndex.values()).sort(
    (left, right) => left.panelIndex - right.panelIndex,
  );
  return {
    ...incoming,
    panels,
    summary: summarizeDiagnosisReport(panels),
  };
}

function buildPanelReviewFromScore(task: GenerateTask): PanelReview[] {
  return (task.visualQualityScore?.panels ?? []).map((panelScore) => ({
    panelIndex: panelScore.panelIndex,
    status: panelScore.overall < 6 ? "needs_repair" : "reviewed",
    score: panelScore.overall,
    issues: panelScore.issues,
  }));
}

class ReviewExecutionStopped extends Error {}

/** All checks and writes share a transaction with the current job and task snapshot. */
function mutateOwnedReview(
  taskId: string,
  jobId: string,
  runId: string,
  fingerprint: string,
  mutate: (task: GenerateTask, job: TaskJobRecord) => void,
): boolean {
  return (
    mutateTaskReviewState(taskId, (task, jobs) => {
      const job = jobs.find(
        (item) => item.id === jobId && item.kind === "deep_review",
      );
      if (
        !job ||
        job.status !== "light_check" ||
        job.payload.reviewExecutionId !== runId
      ) {
        return false;
      }
      if (!task.script || reviewInputFingerprint(task.script) !== fingerprint) {
        Object.assign(
          job,
          updateJob(job, {
            status: "failed",
            lastError: "复审素材已变更，请重新开始复审",
          }),
        );
        task.visualDiagnosisStale = true;
        markDiagnosisFailed(task);
        syncReviewQueueState(task, jobs);
        return false;
      }
      mutate(task, job);
      syncReviewQueueState(task, jobs);
      return true;
    }) === true
  );
}

export async function runTaskDeepReviewQueue(taskId: string): Promise<void> {
  if (!getTaskById(taskId)?.script) return;
  const jobs = (await listTaskJobsByTaskId(taskId))
    .filter(
      (job) =>
        job.kind === "deep_review" &&
        PROCESSABLE_REVIEW_JOB_STATUSES.has(job.status),
    )
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));

  for (const queued of jobs) {
    const claim = mutateTaskReviewState(taskId, (task, currentJobs) => {
      const job = currentJobs.find(
        (item) => item.id === queued.id && item.kind === "deep_review",
      );
      if (
        !task.script ||
        !job ||
        !PROCESSABLE_REVIEW_JOB_STATUSES.has(job.status)
      )
        return undefined;
      const runId = randomUUID();
      const fingerprint = reviewInputFingerprint(task.script);
      Object.assign(
        job,
        updateJob(job, {
          status: "light_check",
          lastError: undefined,
          attemptCount: job.attemptCount + 1,
          payload: { ...job.payload, reviewExecutionId: runId },
        }),
      );
      markDiagnosisRunning(task);
      syncReviewQueueState(task, currentJobs);
      return { task, job, runId, fingerprint };
    });
    if (!claim) continue;
    const { task, job, runId, fingerprint } = claim;
    const commit = (mutate: (task: GenerateTask, job: TaskJobRecord) => void) =>
      mutateOwnedReview(taskId, job.id, runId, fingerprint, mutate);
    const checkpoint = () => {
      if (!commit(() => {})) throw new ReviewExecutionStopped();
    };
    try {
      // Yield to pending pause/delete actions, then recheck before issuing requests.
      await Promise.resolve();
      checkpoint();
      const config = resolveReviewConfig(
        (job.payload as StoredReviewJobPayload).review,
        getConfig(),
      );
      if (!config?.apiUrl || !config.model || !config.provider) {
        throw new Error("缺少可用的视觉评审模型配置，无法继续深度评审");
      }
      const vision = createServerVisionRuntime(checkpoint);
      const mediaFingerprint = await vision.captureImages(
        task
          .script!.panels.filter(
            (panel) => panel.status === "completed" && panel.imageUrl,
          )
          .map((panel) => panel.imageUrl!),
      );
      const modelFingerprint = createHash("sha256")
        .update(
          JSON.stringify({
            apiUrl: config.apiUrl,
            model: config.model,
            provider: config.provider,
          }),
        )
        .digest("hex");
      const sourceFingerprint = `${fingerprint}:${mediaFingerprint}:${modelFingerprint}`;
      let visualScore = task.visualQualityScore;
      if (
        !visualScore ||
        task.visualDiagnosisStale ||
        visualScore.sourceFingerprint !== sourceFingerprint
      ) {
        visualScore = await evaluateVisualQuality(task.script!, config, vision);
        await vision.verifyImages();
        visualScore = { ...visualScore, sourceFingerprint };
        if (
          !commit((current) => {
            current.visualQualityScore = visualScore;
            current.panelReview = buildPanelReviewFromScore(current);
            current.reviewStatus = buildTaskReviewStatus(current.panelReview);
            current.lastReviewAt = visualScore!.evaluatedAt;
          })
        )
          continue;
      }
      checkpoint();
      const report = await evaluateVisualDiagnosis(
        task.script!,
        visualScore,
        config,
        getTargetPanels(job, task.script!.panels.length),
        vision,
      );
      await vision.verifyImages();
      commit((current, currentJob) => {
        // Keep only older panel reports which still refer to current images/prompts.
        const existing = current.visualDiagnosisReport;
        const validExisting =
          existing?.sourceFingerprint === sourceFingerprint
            ? {
                ...existing,
                panels: existing.panels.filter((panel) => {
                  const source = current.script?.panels[panel.panelIndex];
                  return (
                    source?.imageUrl === panel.imageUrl &&
                    source.imagePrompt === panel.promptSnapshot
                  );
                }),
              }
            : undefined;
        markDiagnosisSucceeded(current, {
          ...mergeDiagnosisReports(validExisting, report),
          sourceFingerprint,
        });
        Object.assign(
          currentJob,
          updateJob(currentJob, { status: "completed", lastError: undefined }),
        );
      });
    } catch (error) {
      if (error instanceof ReviewExecutionStopped) continue;
      commit((current, currentJob) => {
        markDiagnosisFailed(current);
        Object.assign(
          currentJob,
          updateJob(currentJob, {
            status: "failed",
            lastError: error instanceof Error ? error.message : "深度评审失败",
          }),
        );
      });
    }
  }
  mutateTaskReviewState(taskId, (task, currentJobs) =>
    syncReviewQueueState(task, currentJobs),
  );
}

export async function listReplayableDeepReviewTasks(): Promise<
  Array<{ taskId: string }>
> {
  const replayableTasks: Array<{ taskId: string }> = [];

  for (const task of getAllTasks()) {
    const jobs = await listTaskJobsByTaskId(task.id);
    const replayableJob = jobs.find(
      (job) =>
        job.kind === "deep_review" &&
        PROCESSABLE_REVIEW_JOB_STATUSES.has(job.status),
    );

    if (!replayableJob) {
      continue;
    }

    replayableTasks.push({ taskId: task.id });
  }

  return replayableTasks;
}
