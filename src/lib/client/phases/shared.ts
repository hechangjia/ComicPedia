import { GenerateTask, PipelineStageTrace } from "@/lib/types";
import { shouldAutoRetry, generatePromptPatch, applyPromptPatch, buildPanelReview, buildTaskReviewStatus } from "@/lib/vlmRetry";
import { persistClientImage, type PersistedImageLocation } from "../persistedImage";

// Re-export commonly needed deps for phase modules
export { saveTask, getTask, getCharacter } from "../db";
export { notifyListeners, saveTaskThrottled, flushThrottledSave, cleanupTaskState } from "../eventBus";
export { abortControllers, abortKey } from "../abortManager";
export { pushImageVersion } from "../panelManager";
export { buildEnhancedPrompt, buildEnhancedPromptWithLog, mergeReferenceImage } from "../promptEnhancer";

// ============================================================
// Pipeline trace helpers
// ============================================================

export function traceStart(task: GenerateTask, stage: PipelineStageTrace["stage"]): void {
  if (!task.pipelineTrace) task.pipelineTrace = [];
  task.pipelineTrace.push({ stage, status: "running", startedAt: Date.now(), retryCount: 0 });
}

export function traceEnd(task: GenerateTask, stage: PipelineStageTrace["stage"], error?: string): void {
  const entry = task.pipelineTrace?.find(t => t.stage === stage && t.status === "running");
  if (entry) {
    entry.status = error ? "failed" : "completed";
    entry.completedAt = Date.now();
    if (error) entry.error = error;
  }
}

export function traceSkip(task: GenerateTask, stage: PipelineStageTrace["stage"]): void {
  if (!task.pipelineTrace) task.pipelineTrace = [];
  task.pipelineTrace.push({ stage, status: "skipped", retryCount: 0 });
}

// ============================================================
// 辅助函数
// ============================================================

/** 生成唯一 ID */
export function generateId(): string {
  return `comic_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 可能触发安全过滤的词（渐进移除） */
export const SENSITIVE_TERMS = [
  "blood", "gore", "violence", "weapon", "gun", "knife", "sword",
  "nude", "naked", "sexy", "revealing", "provocative",
  "dead", "death", "kill", "murder", "corpse",
  "drug", "alcohol", "cigarette", "smoking",
];

/** 次要氛围/光照修饰词（可安全移除） */
export const ATMOSPHERE_TERMS = [
  "atmospheric", "ethereal", "mystical", "dreamy", "moody",
  "serene", "tranquil", "melancholic", "whimsical", "nostalgic",
  "dramatic lighting", "volumetric", "rim light", "backlight",
  "golden hour", "sunset glow", "chiaroscuro", "bokeh",
  "depth of field", "lens flare", "motion blur",
  "in the background", "background details", "scattered",
];

/** 移除敏感词 */
export function removeSensitiveTerms(prompt: string): string {
  let result = prompt;
  for (const term of SENSITIVE_TERMS) {
    result = result.replace(new RegExp(`\\b${term}\\b`, "gi"), "");
  }
  return result.replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim();
}

/** 移除次要修饰词（保留核心语义） */
export function removeAtmosphereTerms(prompt: string): string {
  let result = removeSensitiveTerms(prompt);
  for (const term of ATMOSPHERE_TERMS) {
    result = result.replace(new RegExp(`\\b${term}\\b`, "gi"), "");
  }
  result = result.replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim();
  const words = result.split(/\s+/);
  if (words.length > 200) {
    result = words.slice(0, 150).join(" ") + ", high quality illustration";
  }
  return result;
}

/**
 * P2: 智能重试 — 根据错误类型选择不同的 prompt 适配策略。
 * 替代原先的"盲降级"，让每种失败模式得到针对性处理。
 */
export function adaptPromptForRetry(original: string, retryLevel: number, lastError: Error | null): string {
  const msg = lastError?.message?.toLowerCase() || "";

  // Strategy 1: 安全过滤 → 仅移除敏感词，保留其余
  if (msg.includes("safety") || msg.includes("content_filter") ||
      msg.includes("blocked") || msg.includes("nsfw") ||
      msg.includes("inappropriate") || msg.includes("violat")) {
    console.log("[RetryStrategy] Content safety → removing sensitive terms");
    return removeSensitiveTerms(original);
  }

  // Strategy 2: 速率限制 → 保持原 prompt（延迟由 withRetry 处理）
  // Must check before "too long" because "429 Too Many Requests" contains "too many"
  if (msg.includes("rate") || msg.includes("429") || msg.includes("quota")) {
    console.log("[RetryStrategy] Rate limit → keeping original prompt");
    return original;
  }

  // Strategy 3: Prompt 过长 → 截断到 120 词
  if (msg.includes("too long") || msg.includes("token") ||
      msg.includes("maximum") || msg.includes("length")) {
    console.log("[RetryStrategy] Prompt too long → truncating");
    const words = original.split(/\s+/).slice(0, 120);
    return words.join(" ") + ", high quality illustration";
  }

  // Strategy 4: 默认 → 渐进移除修饰词
  console.log(`[RetryStrategy] Default strategy level ${retryLevel}`);
  if (retryLevel === 1) return removeSensitiveTerms(original);
  return removeAtmosphereTerms(original);
}

/** 将 Base64 图片保存到文件系统（非阻塞） */
export async function saveImageToFileSystem(
  taskId: string,
  panelIndex: number,
  base64Data: string,
  title?: string,
): Promise<PersistedImageLocation | null> {
  try {
    if (!base64Data.startsWith("data:image")) return null;
    const persisted = await persistClientImage({
      taskId,
      panelIndex,
      title,
      base64Data,
      type: "panel",
    });
    if (!persisted) {
      console.warn(`[SaveImage] Failed for panel ${panelIndex}`);
    }
    return persisted;
  } catch (err) {
    console.warn(`[SaveImage] Network error for panel ${panelIndex}:`, err);
    return null;
  }
}

// ============================================================
// VLM review helpers (used by vlm phase and orchestrator)
// ============================================================

export function applyVisualReviewResult(task: GenerateTask, visualScore: NonNullable<GenerateTask["visualQualityScore"]>) {
  task.visualQualityScore = visualScore;
  task.panelReview = buildPanelReview(visualScore);
  task.reviewStatus = buildTaskReviewStatus(task.panelReview);
  task.lastReviewAt = visualScore.evaluatedAt;
}

export function markRetryingPanelReview(
  visualScore: NonNullable<GenerateTask["visualQualityScore"]>,
  attemptedPanels: number[],
) {
  const retryingPanels = new Set(attemptedPanels);
  return buildPanelReview(visualScore).map((panel) =>
    retryingPanels.has(panel.panelIndex)
      ? { ...panel, status: "retrying" as const }
      : panel,
  );
}

export function markFailedPanelReview(task: GenerateTask, panelIndex: number) {
  task.panelReview = (task.panelReview ?? []).map((panel) =>
    panel.panelIndex === panelIndex
      ? { ...panel, status: "failed" as const }
      : panel,
  );
  task.reviewStatus = buildTaskReviewStatus(task.panelReview);
}

export function finalizeRetryCycleFailure(task: GenerateTask, attemptedPanels: number[]) {
  const attempted = new Set(attemptedPanels);
  task.panelReview = (task.panelReview ?? []).map((panel) =>
    attempted.has(panel.panelIndex) && panel.status === "retrying"
      ? { ...panel, status: "needs_repair" as const }
      : panel,
  );
  task.reviewStatus = buildTaskReviewStatus(task.panelReview);
}
