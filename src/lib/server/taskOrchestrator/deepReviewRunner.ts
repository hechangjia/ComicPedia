import { getConfig, mutateTaskReviewState } from "@/lib/server/db";
import type {
  GenerateTask,
  PartialLLMConfig,
  UserAPIConfigV2,
  UserLLMConfig,
} from "@/lib/types";
import { randomUUID } from "node:crypto";
import { syncReviewQueueState } from "./reviewState";

type SanitizedLLMConfig = Omit<PartialLLMConfig, "apiKey">;

interface StartDeepReviewInput {
  panelIndices?: number[];
  vlmConfig: PartialLLMConfig;
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

function sanitizePanelIndices(
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

function getReviewConfigCandidates(
  config: UserAPIConfigV2 | null,
): UserLLMConfig[] {
  if (!config) {
    return [];
  }
  return [...(config.vlmConfigs ?? []), ...config.llmConfigs];
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

function sanitizeLLMConfig(
  vlmConfig: PartialLLMConfig,
): SanitizedLLMConfig | undefined {
  const { apiKey: _apiKey, ...safeConfig } = vlmConfig;
  return Object.values(safeConfig).some((value) => value !== undefined)
    ? safeConfig
    : undefined;
}

function buildDeepReviewPayload(
  vlmConfig: PartialLLMConfig,
  targetPanels?: number[],
): Record<string, unknown> {
  const config = getConfig();
  const candidates = getReviewConfigCandidates(config);
  const sanitizedConfig = sanitizeLLMConfig(vlmConfig);
  if (vlmConfig.configId && vlmConfig.configRole === "image") {
    throw new Error("视觉评审必须使用文字或视觉模型配置");
  }
  const matched = candidates.find((candidate) =>
    matchesLLMConfig(candidate, sanitizedConfig),
  );
  const resolvedConfigId = vlmConfig.configId ?? matched?.id;
  const configRole = vlmConfig.configId
    ? (vlmConfig.configRole ?? "vlm")
    : matched
      ? (config?.vlmConfigs ?? []).includes(matched)
        ? "vlm"
        : "llm"
      : undefined;
  const safeFallback =
    sanitizedConfig && isLocalApiUrl(sanitizedConfig.apiUrl)
      ? sanitizedConfig
      : undefined;

  if (!resolvedConfigId && !safeFallback) {
    throw new Error(
      "缺少可重放的视觉评审配置，请重新选择有效的视觉模型配置后再试",
    );
  }

  return {
    review: {
      configId: resolvedConfigId,
      configRole,
      fallback: resolvedConfigId ? undefined : safeFallback,
      targetPanels,
    },
  };
}

export async function startDeepReview(
  taskId: string,
  input: StartDeepReviewInput,
): Promise<GenerateTask> {
  const updated = mutateTaskReviewState(taskId, (task, jobs) => {
    if (!task.script) throw new Error("任务脚本尚未生成");
    const targetPanels = sanitizePanelIndices(
      input.panelIndices,
      task.script.panels.length,
    );
    if (input.panelIndices && !targetPanels)
      throw new Error("没有有效的目标分镜");
    const completedPanels = task.script.panels.filter(
      (panel, index) =>
        panel.status === "completed" &&
        !!panel.imageUrl &&
        (!targetPanels || targetPanels.includes(index)),
    );
    if (!completedPanels.length)
      throw new Error("没有可用于深度复审的已生成面板");
    const now = new Date().toISOString();
    jobs.push({
      id: randomUUID(),
      taskId,
      kind: "deep_review",
      status: "queued",
      attemptCount: 0,
      payload: buildDeepReviewPayload(input.vlmConfig, targetPanels),
      createdAt: now,
      updatedAt: now,
    });
    task.visualDiagnosisState = "running";
    syncReviewQueueState(task, jobs);
    return task;
  });
  if (!updated) throw new Error("任务不存在，无法开始深度复审");
  return updated;
}
