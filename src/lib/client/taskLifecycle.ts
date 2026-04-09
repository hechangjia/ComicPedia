import { GenerateRequest, GenerateTask, ComicStyle, PartialImageGenConfig, PartialLLMConfig, CharacterRelation } from "@/lib/types";
import { getStyleModifier } from "@/lib/config/styles";
import { saveTask, getTask } from "./db";
import { notifyListeners } from "./eventBus";
import { abortControllers } from "./abortManager";
import { generateId } from "./phases/shared";
import { runResearchPhase } from "./phases/research";
import { runScriptPhase } from "./phases/script";
import { runImageGenPhase } from "./phases/imageGen";
import { runQualityPhase } from "./phases/quality";
import { traceStart as traceStartShared, traceEnd as traceEndShared } from "./phases/shared";

// ============================================================
// Pipeline trace helpers
// ============================================================

function initTrace(task: GenerateTask): void {
  task.pipelineTrace = [];
}

const traceStart = traceStartShared;
const traceEnd = traceEndShared;

type TaskActionBody = {
  action: string;
  imageConfigId?: string;
  imageConfig?: PartialImageGenConfig;
  forceAll?: boolean;
  llmConfig?: PartialLLMConfig;
};

type TaskActionError = Error & {
  status?: number;
};

let taskActionsCapability: "unknown" | "supported" | "unsupported" = "unknown";

async function postTaskAction(taskId: string, body: TaskActionBody): Promise<void> {
  if (taskActionsCapability === "unsupported") {
    const error = new Error("Task actions unsupported") as TaskActionError;
    error.status = 501;
    throw error;
  }

  const response = await fetch(`/api/tasks/${taskId}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const responseBody = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(responseBody.error || `API error: ${response.status}`) as TaskActionError;
    error.status = response.status;
    if (response.status === 404 || response.status === 405 || response.status === 501) {
      taskActionsCapability = "unsupported";
    }
    throw error;
  }

  taskActionsCapability = "supported";
}

function shouldFallbackToLegacyTaskAction(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  const status = (error as TaskActionError | undefined)?.status;
  return status === 404 || status === 405 || status === 501;
}

// ============================================================
// 阶段 1：仅生成分镜脚本（停在 script_ready）
// ============================================================

/**
 * 启动分镜脚本生成（仅阶段1）。
 * 生成完成后任务状态为 "script_ready"，等待用户审查后手动触发图片生成。
 */
export async function startGeneration(request: GenerateRequest): Promise<string> {
  const response = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request }),
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error || `API error: ${response.status}`);
  }
  if (!body?.id || typeof body.id !== "string") {
    throw new Error("Task creation response missing id");
  }

  return body.id;
}

/** Phase 1: Generate comic script, stop at script_ready when done */
async function processScripting(taskId: string, request: GenerateRequest) {
  const controller = new AbortController();
  abortControllers.set(`${taskId}:scripting`, controller);

  let task = await getTask(taskId);
  if (!task) {
    abortControllers.delete(`${taskId}:scripting`);
    return;
  }

  try {
    task.status = "scripting";
    task.progress = 5;
    initTrace(task);

    // ── 配置快照：记录生成时使用的模型 ──
    task.generationConfig = {
      llmModel: request.llmConfig?.model,
      llmProvider: request.llmConfig?.provider,
      imageModel: request.imageConfig?.model,
      imageProvider: request.imageConfig?.endpointType,
      quality: request.quality,
      allowGuideCharacter: request.allowGuideCharacter,
      generatedAt: new Date().toISOString(),
      seriesId: request.seriesId,
      characterIds: request.characterIds,
    };

    await saveTask(task);
    notifyListeners(task);

    // ── Phase 0 + 0.5 + 0.7: Research ──
    traceStart(task, "research");
    try {
      var { enhancedTopic } = await runResearchPhase(task, request);
      traceEnd(task, "research");
    } catch (err) {
      traceEnd(task, "research", err instanceof Error ? err.message : "Unknown error");
      throw err;
    }

    // ── Phase 1 + validation + repair + accuracy: Script ──
    traceStart(task, "script");
    try {
      await runScriptPhase(task, request, enhancedTopic, controller.signal);
      traceEnd(task, "script");
    } catch (err) {
      traceEnd(task, "script", err instanceof Error ? err.message : "Unknown error");
      throw err;
    }

  } catch (error) {
    task.status = "failed";
    task.error = error instanceof Error ? error.message : "Unknown error";
    task.streamText = undefined;
    await saveTask(task);
    notifyListeners(task);
  } finally {
    abortControllers.delete(`${taskId}:scripting`);
  }
}

// ============================================================
// Script Regeneration — re-run LLM with optional config override
// ============================================================

/**
 * Regenerate script for an existing task using a different LLM config.
 * Preserves task ID, reference images, and topic; replaces the script.
 * Only allowed when task status is script_ready or completed.
 */
export async function regenerateScript(
  taskId: string,
  llmConfig?: PartialLLMConfig,
): Promise<void> {
  const task = await getTask(taskId);
  if (!task?.script) throw new Error("Task or script not found");
  if (task.status !== "script_ready" && task.status !== "completed") {
    throw new Error(`Cannot regenerate script in status: ${task.status}`);
  }

  const { topic, style, referenceImage, referenceImages, controlMode, referenceEntries } = task.script;
  const panelCount = task.script.panels.length;

  const request: GenerateRequest = {
    topic,
    style,
    panelCount,
    llmConfig,
    referenceImage,
    referenceImages,
    controlMode,
    referenceEntries,
    characterIds: task.character ? [task.character.id] : undefined,
    allowGuideCharacter: task.generationConfig?.allowGuideCharacter,
  };

  task.status = "scripting";
  task.progress = 0;
  task.streamText = undefined;
  task.error = undefined;
  task.updatedAt = new Date();
  await saveTask(task);
  notifyListeners(task);

  processScripting(taskId, request).catch((err) => {
    console.error("Script regeneration failed:", err);
  });
}

/**
 * Change the style of an existing task and regenerate all panel images.
 */
export async function changeStyleAndRegenerate(
  taskId: string,
  newStyle: ComicStyle,
  imageConfig?: PartialImageGenConfig,
  imageConfigId?: string,
): Promise<void> {
  const task = await getTask(taskId);
  if (!task?.script) throw new Error("Task or script not found");
  if (task.status !== "script_ready" && task.status !== "completed") {
    throw new Error(`Cannot change style in status: ${task.status}`);
  }

  const oldStyle = task.script.style;
  if (oldStyle === newStyle) {
    await generateAllImages(taskId, imageConfig, true, undefined, imageConfigId);
    return;
  }

  const oldModifier = getStyleModifier(oldStyle);
  const newModifier = getStyleModifier(newStyle);

  task.script.style = newStyle;
  for (const panel of task.script.panels) {
    if (oldModifier && panel.imagePrompt.includes(oldModifier)) {
      panel.imagePrompt = panel.imagePrompt.replace(oldModifier, newModifier);
    } else if (!panel.imagePrompt.includes(newModifier)) {
      panel.imagePrompt = panel.imagePrompt.replace(/,?\s*$/, `, ${newModifier}`);
    }
    panel.status = "pending";
  }

  task.status = "script_ready";
  task.updatedAt = new Date();
  await saveTask(task);
  notifyListeners(task);

  await generateAllImages(taskId, imageConfig, true, undefined, imageConfigId);
}

// ============================================================
// 阶段 2：图片生成（全部面板）
// ============================================================

/**
 * 生成所有待处理面板的图片。
 * 跳过已有图片（status=completed）的面板，除非 forceAll=true。
 */
export async function generateAllImages(
  taskId: string,
  imageConfig?: PartialImageGenConfig,
  forceAll: boolean = false,
  llmConfig?: PartialLLMConfig,
  imageConfigId?: string,
): Promise<void> {
  try {
    await postTaskAction(taskId, {
      action: "generate_all_images",
      imageConfigId,
      imageConfig,
      forceAll,
      llmConfig,
    });
    return;
  } catch (error) {
    if (!shouldFallbackToLegacyTaskAction(error)) {
      throw error;
    }
  }

  return generateAllImagesLegacy(taskId, imageConfig, forceAll, llmConfig);
}

async function generateAllImagesLegacy(
  taskId: string,
  imageConfig?: PartialImageGenConfig,
  forceAll: boolean = false,
  llmConfig?: PartialLLMConfig,
): Promise<void> {
  const task = await getTask(taskId);
  if (!task?.script) throw new Error("任务或脚本不存在");

  task.status = "generating";
  task.updatedAt = new Date();
  await saveTask(task);
  notifyListeners(task);

  traceStart(task, "images");
  let allCompleted: boolean;
  try {
    allCompleted = await runImageGenPhase(task, imageConfig, forceAll);
    traceEnd(task, "images");
  } catch (err) {
    traceEnd(task, "images", err instanceof Error ? err.message : "Unknown error");
    throw err;
  }

  // ── Quality Gate + VLM ──
  if (allCompleted && llmConfig) {
    traceStart(task, "quality");
    if (task.generationConfig?.quality === "fine") {
      traceStart(task, "vlm");
    }
    await saveTask(task);
    notifyListeners(task);
    runQualityPhase(taskId, llmConfig, task.script, imageConfig, task.generationConfig?.quality);
  }

  // ── Evolution Timeline auto-update (fire-and-forget) ──
  if (allCompleted) {
    updateRelationEvolution(task).catch((err) =>
      console.warn("[Evolution] Auto-update failed (non-fatal):", err),
    );
  }
}

// ============================================================
// Post-completion: auto-update relation evolution timelines
// ============================================================

/**
 * After a task completes, append evolution entries to relations
 * involving the task's characters. Fire-and-forget, non-blocking.
 */
async function updateRelationEvolution(task: GenerateTask): Promise<void> {
  const charIds = task.generationConfig?.characterIds;
  const seriesId = task.generationConfig?.seriesId;
  if (!charIds || charIds.length < 2 || !seriesId || !task.script) return;

  // Fetch series to determine episode number
  let episodeNumber = 1;
  try {
    const seriesRes = await fetch(`/api/series/${seriesId}`);
    if (seriesRes.ok) {
      const series = await seriesRes.json();
      episodeNumber = series.episodes?.length ?? 1;
    }
  } catch { return; }

  // Fetch relations for these characters
  let relations: CharacterRelation[] = [];
  try {
    const relRes = await fetch("/api/relations");
    if (!relRes.ok) return;
    const all: CharacterRelation[] = await relRes.json();
    const idSet = new Set(charIds);
    relations = all.filter(r => idSet.has(r.fromId) && idSet.has(r.toId));
  } catch { return; }

  if (relations.length === 0) return;

  // Build a brief summary from the script title
  const change = `Episode "${task.script.title}": characters appeared together`;

  // Update each relation's evolution
  for (const rel of relations) {
    const newEvolution = [
      ...rel.evolution,
      { episodeNumber, change, newStrength: rel.strength },
    ];
    try {
      await fetch(`/api/relations/${rel.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evolution: newEvolution }),
      });
    } catch { /* individual relation update failure is non-fatal */ }
  }
}
