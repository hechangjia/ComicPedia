import { GenerateRequest, GenerateTask, ComicScript, ComicStyle, ComicPanel, PartialImageGenConfig, PartialLLMConfig } from "@/lib/types";
import { generateScript, generateScriptStream, generateTopicResearch, buildEnhancedTopicFromResearch, StreamChunkCallback } from "@/lib/llm";
import { getImageAdapter } from "@/lib/imageGen";
import { validateScript, applyCanonicalCharacterDesc } from "@/lib/scriptValidator";
import { getStyleModifier, getStyleNegativePrompt, STYLE_META } from "@/lib/config/styles";
import { urlToBase64 } from "@/lib/utils";
import { withConcurrency } from "@/lib/concurrency";
import { withRetry } from "@/lib/retryQueue";
import { QUALITY_PRESETS } from "@/lib/config/quality";
import { saveTask, getTask, getCharacter } from "./db";
import { notifyListeners, saveTaskThrottled, flushThrottledSave, cleanupTaskState } from "./eventBus";
import { abortControllers, abortKey } from "./abortManager";
import { pushImageVersion } from "./panelManager";
import { buildEnhancedPrompt, buildEnhancedPromptWithLog, mergeReferenceImage } from "./promptEnhancer";

// ============================================================
// 辅助函数
// ============================================================

/** 生成唯一 ID */
function generateId(): string {
  return `comic_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 可能触发安全过滤的词（渐进移除） */
const SENSITIVE_TERMS = [
  "blood", "gore", "violence", "weapon", "gun", "knife", "sword",
  "nude", "naked", "sexy", "revealing", "provocative",
  "dead", "death", "kill", "murder", "corpse",
  "drug", "alcohol", "cigarette", "smoking",
];

/**
 * 智能重试：渐进简化 prompt（保留核心语义）。
 * retry 1: 移除可能触发安全过滤的词
 * retry 2: 移除次要修饰词（氛围、光照、背景细节），保留核心主体 + 风格 + 角色
 */
function simplifyPromptForRetry(original: string, retryLevel: number): string {
  if (retryLevel === 1) {
    let prompt = original;
    for (const term of SENSITIVE_TERMS) {
      const regex = new RegExp(`\\b${term}\\b`, "gi");
      prompt = prompt.replace(regex, "");
    }
    return prompt.replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim();
  }

  // retry 2: 移除次要修饰而非截断
  // 保留：主体描述（前60%的词） + 角色标签 + 核心风格词
  // 移除：氛围词、背景细节、光照描述、相机参数
  const atmosphereTerms = [
    "atmospheric", "ethereal", "mystical", "dreamy", "moody",
    "serene", "tranquil", "melancholic", "whimsical", "nostalgic",
    "dramatic lighting", "volumetric", "rim light", "backlight",
    "golden hour", "sunset glow", "chiaroscuro", "bokeh",
    "depth of field", "lens flare", "motion blur",
    "in the background", "background details", "scattered",
  ];

  let prompt = original;
  for (const term of atmosphereTerms) {
    const regex = new RegExp(`\\b${term}\\b`, "gi");
    prompt = prompt.replace(regex, "");
  }

  // 也移除敏感词
  for (const term of SENSITIVE_TERMS) {
    const regex = new RegExp(`\\b${term}\\b`, "gi");
    prompt = prompt.replace(regex, "");
  }

  prompt = prompt.replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim();

  // 如果清理后仍然过长（>200词），才截断，但保留前150词
  const words = prompt.split(/\s+/);
  if (words.length > 200) {
    prompt = words.slice(0, 150).join(" ") + ", high quality illustration";
  }

  return prompt;
}

/** 将 Base64 图片保存到文件系统（非阻塞） */
async function saveImageToFileSystem(
  taskId: string,
  panelIndex: number,
  base64Data: string,
  title?: string,
): Promise<void> {
  try {
    if (!base64Data.startsWith("data:image")) return;
    const res = await fetch("/api/save-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, panelIndex, base64Data, title }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn(`[SaveImage] Failed for panel ${panelIndex}:`, err);
    }
  } catch (err) {
    console.warn(`[SaveImage] Network error for panel ${panelIndex}:`, err);
  }
}

// ============================================================
// 阶段 1：仅生成分镜脚本（停在 script_ready）
// ============================================================

/**
 * 启动分镜脚本生成（仅阶段1）。
 * 生成完成后任务状态为 "script_ready"，等待用户审查后手动触发图片生成。
 */
export async function startGeneration(request: GenerateRequest): Promise<string> {
  const taskId = generateId();

  const task: GenerateTask = {
    id: taskId,
    status: "scripting",
    progress: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await saveTask(task);

  processScripting(taskId, request).catch((err) => {
    console.error("Background scripting failed:", err);
  });

  return taskId;
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

    // ── 配置快照：记录生成时使用的模型 ──
    task.generationConfig = {
      llmModel: request.llmConfig?.model,
      llmProvider: request.llmConfig?.provider,
      imageModel: request.imageConfig?.model,
      imageProvider: request.imageConfig?.endpointType,
      quality: request.quality,
      generatedAt: new Date().toISOString(),
    };

    await saveTask(task);
    notifyListeners(task);

    // ── Phase 0: Topic Research ──
    // For science/general/xiaohongshu topics, call LLM to research the topic first.
    // Poetry/novel modes skip this (user provides full text).
    // Wikipedia mode skips this (article content serves as research).
    const shouldResearch =
      (!request.contentType || request.contentType === "science" || request.contentType === "xiaohongshu")
      && !request.wikipediaContent;

    let enhancedTopic = request.topic;

    if (shouldResearch) {
      try {
        task.streamText = "正在研究主题...（本地模型首次加载可能需要等待）";
        notifyListeners(task);

        const research = await generateTopicResearch(
          request.topic,
          request.llmConfig,
        );

        // Store research result for UI display
        task.topicResearch = {
          expandedDescription: research.expandedDescription,
          keyFacts: research.keyFacts,
          narrativeAngle: research.narrativeAngle,
        };
        task.progress = 10;
        task.streamText = `[Topic Research]\n${research.expandedDescription}\n\nKey Facts:\n${research.keyFacts.map((f, i) => `${i + 1}. ${f}`).join("\n")}\n\nGenerating script...`;
        notifyListeners(task);

        // Build enhanced topic from research
        enhancedTopic = buildEnhancedTopicFromResearch(research);
      } catch (researchErr) {
        // Research failure is non-fatal — fall back to original topic
        console.warn("[Generator] Topic research failed, using original topic:", researchErr);
        task.streamText = undefined;
        notifyListeners(task);
      }
    }

    // ── Phase 1: Script Generation ──
    let lastNotifyTime = 0;
    const NOTIFY_THROTTLE_MS = 100;

    const onChunk: StreamChunkCallback = (_chunk, accumulated) => {
      task!.streamText = accumulated;
      task!.progress = Math.min(25, 10 + Math.floor(accumulated.length / 80));

      const now = Date.now();
      if (now - lastNotifyTime >= NOTIFY_THROTTLE_MS) {
        lastNotifyTime = now;
        notifyListeners(task!);
      }
    };

    let script: ComicScript;

    // Enhance topic with quality preset hint
    const qualityPreset = QUALITY_PRESETS[request.quality || "standard"];
    const finalTopic = qualityPreset.promptHint
      ? `${enhancedTopic}\n\n[Generation quality requirement: ${qualityPreset.promptHint}]`
      : enhancedTopic;

    // Resolve character from characterIds (fix: was previously always undefined)
    let character = undefined;
    if (request.characterIds && request.characterIds.length > 0) {
      try {
        const char = await getCharacter(request.characterIds[0]);
        if (char) {
          character = char;
          task.character = char;
        }
      } catch (charErr) {
        console.warn("[Generator] Failed to load character, proceeding without:", charErr);
      }
    }

    try {
      // 显示等待提示（本地模型加载可能需要较长时间）
      if (!task.streamText) {
        task.streamText = "正在生成脚本...（本地模型首次加载可能需要等待）";
        notifyListeners(task);
      }

      script = await generateScriptStream(
        finalTopic,
        request.style,
        request.panelCount ?? undefined,
        request.llmConfig,
        request.contentType,
        request.poetryGenre,
        request.poetryMeta,
        character,
        onChunk,
        controller.signal,
        request.novelMeta,
        request.wikipediaContent,
      );
    } catch (streamErr) {
      if (controller.signal.aborted) throw streamErr;

      console.warn("[Generator] Stream generation failed, falling back to non-stream:", streamErr);
      task.streamText = undefined;
      notifyListeners(task);

      script = await generateScript(
        finalTopic,
        request.style,
        request.panelCount ?? undefined,
        request.llmConfig,
        request.contentType,
        request.poetryGenre,
        request.poetryMeta,
        character,
        request.novelMeta,
        request.wikipediaContent,
      );
    }

    task.streamText = undefined;

    if (request.referenceImage) {
      script.referenceImage = request.referenceImage;
    }
    if (request.referenceImages && request.referenceImages.length > 0) {
      script.referenceImages = request.referenceImages;
    }
    if (request.controlMode) {
      script.controlMode = request.controlMode;
    }

    task.script = script;
    task.progress = 30;

    // ── 脚本后校验：纯规则，零 LLM 调用 ──
    const validation = validateScript(script);
    task.scriptValidation = validation;
    if (validation.warnings.length > 0) {
      console.log(`[ScriptValidator] ${validation.warnings.length} warnings:`,
        validation.warnings.map(w => `[${w.severity}] ${w.message}`));
    }

    // ── 角色描述标准化：统一各面板中的角色标签为最详细版本 ──
    applyCanonicalCharacterDesc(script);

    task.status = "script_ready";
    task.updatedAt = new Date();
    await saveTask(task);
    notifyListeners(task);

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

  // Preserve existing script metadata for rebuilding
  const { topic, style, referenceImage, referenceImages, controlMode, referenceEntries } = task.script;
  const panelCount = task.script.panels.length;

  // Build a GenerateRequest-like input for processScripting
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
  };

  // Reset task state to scripting
  task.status = "scripting";
  task.progress = 0;
  task.streamText = undefined;
  task.error = undefined;
  task.updatedAt = new Date();
  await saveTask(task);
  notifyListeners(task);

  // Re-run scripting in background
  processScripting(taskId, request).catch((err) => {
    console.error("Script regeneration failed:", err);
  });
}

/**
 * Change the style of an existing task and regenerate all panel images.
 * Preserves the script (scenes, dialogues) but replaces style modifiers in imagePrompts.
 * Old images are archived in imageVersions for comparison.
 */
export async function changeStyleAndRegenerate(
  taskId: string,
  newStyle: ComicStyle,
  imageConfig?: PartialImageGenConfig,
): Promise<void> {
  const task = await getTask(taskId);
  if (!task?.script) throw new Error("Task or script not found");
  if (task.status !== "script_ready" && task.status !== "completed") {
    throw new Error(`Cannot change style in status: ${task.status}`);
  }

  const oldStyle = task.script.style;
  if (oldStyle === newStyle) {
    // Same style — just regenerate all images
    await generateAllImages(taskId, imageConfig, true);
    return;
  }

  // Replace style modifier in each panel's imagePrompt
  const oldModifier = getStyleModifier(oldStyle);
  const newModifier = getStyleModifier(newStyle);

  task.script.style = newStyle;
  for (const panel of task.script.panels) {
    if (oldModifier && panel.imagePrompt.includes(oldModifier)) {
      panel.imagePrompt = panel.imagePrompt.replace(oldModifier, newModifier);
    } else if (!panel.imagePrompt.includes(newModifier)) {
      // Fallback: append new modifier if old one wasn't found
      panel.imagePrompt = panel.imagePrompt.replace(/,?\s*$/, `, ${newModifier}`);
    }
    // Reset panel status to trigger regeneration
    panel.status = "pending";
  }

  task.status = "script_ready";
  task.updatedAt = new Date();
  await saveTask(task);
  notifyListeners(task);

  // Auto-trigger image generation
  await generateAllImages(taskId, imageConfig, true);
}

// ============================================================
// 阶段 2：图片生成（全部面板）
// ============================================================

/** 默认图片生成并发数（可通过环境变量 MAX_IMAGE_WORKERS 覆盖） */
const IMAGE_CONCURRENCY = typeof window !== "undefined"
  ? parseInt(localStorage.getItem("image_concurrency") || "6", 10)
  : 6;

/**
 * 生成所有待处理面板的图片。
 * 跳过已有图片（status=completed）的面板，除非 forceAll=true。
 */
export async function generateAllImages(
  taskId: string,
  imageConfig?: PartialImageGenConfig,
  forceAll: boolean = false,
): Promise<void> {
  const task = await getTask(taskId);
  if (!task?.script) throw new Error("任务或脚本不存在");

  task.status = "generating";
  task.updatedAt = new Date();
  await saveTask(task);
  notifyListeners(task);

  const { script } = task;
  const characterDesc = script.characterDescription;
  const baseSeed = script.seed;
  const totalPanels = script.panels.length;

  const panelIndices = script.panels
    .map((p, i) => ({ panel: p, index: i }))
    .filter(({ panel }) => forceAll || panel.status !== "completed")
    .map(({ index }) => index);

  // 归档旧图并标记为 generating
  for (const idx of panelIndices) {
    const panel = script.panels[idx];
    if (panel.imageUrl && panel.imageUrl.startsWith("data:image")) {
      const lastVersion = panel.imageVersions?.[panel.imageVersions.length - 1];
      if (!lastVersion || lastVersion.imageUrl !== panel.imageUrl) {
        pushImageVersion(panel, panel.imageUrl);
      }
    }
    panel.status = "generating";
  }
  task.updatedAt = new Date();
  await saveTask(task);
  notifyListeners(task);

  // ============================================================
  // 角色一致性优化：如果有角色但无用户参考图，先生成首格作为视觉锚点
  // 后续面板以首格输出作为 img2img 参考，确保角色外貌一致
  // ============================================================
  const hasUserRef = !!(script.referenceImage || script.referenceImages?.length ||
    script.referenceEntries?.length);
  const hasCharacter = !!characterDesc;
  const shouldUseFirstPanelAsRef = hasCharacter && !hasUserRef && panelIndices.length > 1;

  let firstPanelImage: string | undefined;

  if (shouldUseFirstPanelAsRef) {
    const firstIdx = panelIndices[0];
    const firstPanel = script.panels[firstIdx];
    const panelController = new AbortController();
    abortControllers.set(abortKey(taskId, firstIdx), panelController);

    try {
      const prompt = buildEnhancedPrompt(firstPanel.imagePrompt, firstIdx, characterDesc, script.style, totalPanels);
      const mergedConfig = mergeReferenceImage(imageConfig, script, firstPanel, firstIdx);
      const adapter = getImageAdapter(mergedConfig);
      const panelSeed = baseSeed !== undefined ? baseSeed + firstIdx : undefined;
      const imageUrl = await withRetry(
        () => adapter.generate(prompt, script.style, panelSeed, panelController.signal),
        { maxRetries: 2, baseDelay: 1000 },
        panelController.signal,
      );

      firstPanel.status = "completed";
      firstPanel.imageUrl = imageUrl;

      // 同步转换为 Base64（需要作为后续面板的参考图）
      try {
        const base64 = await urlToBase64(imageUrl);
        firstPanel.imageUrl = base64;
        firstPanelImage = base64;
        pushImageVersion(firstPanel, base64);
        saveImageToFileSystem(task.id, firstIdx, base64, script.title);
      } catch {
        // Base64 转换失败，降级但仍尝试用原始 URL 作为参考
        pushImageVersion(firstPanel, imageUrl);
        firstPanelImage = imageUrl.startsWith("data:image") ? imageUrl : undefined;
      }
    } catch (err) {
      console.error(`First panel generation failed:`, err);
      firstPanel.status = "failed";
      if (firstPanel.imageVersions?.length) {
        firstPanel.imageUrl = firstPanel.imageVersions[firstPanel.imageVersions.length - 1].imageUrl;
        firstPanel.status = "completed";
      }
    } finally {
      abortControllers.delete(abortKey(taskId, firstIdx));
    }

    const completedCount = script.panels.filter((p) => p.status === "completed").length;
    task.progress = 30 + Math.floor((completedCount / totalPanels) * 70);
    task.updatedAt = new Date();
    await saveTask(task);
    notifyListeners(task);
  }

  // 确定剩余需要生成的面板
  const remainingIndices = shouldUseFirstPanelAsRef
    ? panelIndices.slice(1)
    : panelIndices;

  // 为每个面板构建异步任务工厂
  const taskFactories = remainingIndices.map((panelIndex) => async () => {
    const panel = script.panels[panelIndex];

    const panelController = new AbortController();
    abortControllers.set(abortKey(taskId, panelIndex), panelController);

    try {
      const enhanceResult = buildEnhancedPromptWithLog(panel.imagePrompt, panelIndex, characterDesc, panel.styleOverride ?? script.style, totalPanels);
      const prompt = enhanceResult.enhanced;
      panel.enhancementLog = enhanceResult;
      let mergedConfig = mergeReferenceImage(imageConfig, script, panel, panelIndex);

      // 如果首格生成了参考图且当前面板无自定义参考图，使用首格作为参考
      // 仅对支持 img2img 的 API 类型传递（chat/comfyui 不支持 image+strength）
      const supportsImg2Img = mergedConfig?.endpointType === "images" || mergedConfig?.endpointType === "auto";
      if (firstPanelImage && supportsImg2Img && !panel.referenceImage && !panel.referenceImages?.length) {
        mergedConfig = {
          ...mergedConfig,
          extraBody: {
            ...mergedConfig?.extraBody,
            image: firstPanelImage,
            strength: 0.3,  // 低强度：保留构图自由度，仅保持角色一致
          },
        };
      }

      const adapter = getImageAdapter(mergedConfig);
      const panelSeed = baseSeed !== undefined ? baseSeed + panelIndex : undefined;

      // 智能重试：每次失败后渐进简化 prompt
      let retryCount = 0;
      const imageUrl = await withRetry(
        () => {
          const currentPrompt = retryCount === 0 ? prompt
            : simplifyPromptForRetry(prompt, retryCount);
          retryCount++;
          return adapter.generate(currentPrompt, panel.styleOverride ?? script.style, panelSeed, panelController.signal);
        },
        { maxRetries: 2, baseDelay: 1000 },
        panelController.signal,
      );

      // 先标记为完成，异步转换 Base64（不阻塞并发队列）
      panel.status = "completed";
      panel.imageUrl = imageUrl; // 临时使用原始 URL

      // 后台异步转换 + 保存
      urlToBase64(imageUrl)
        .then((base64) => {
          panel.imageUrl = base64;
          pushImageVersion(panel, base64);
          saveImageToFileSystem(task.id, panelIndex, base64, script.title);
          // 触发一次额外的 UI 更新（确保 Base64 显示）
          notifyListeners(task);
        })
        .catch((err) => {
          console.warn(`Panel ${panelIndex} Base64 conversion failed:`, err);
          // 降级：保留原始 URL
          pushImageVersion(panel, imageUrl);
        });
    } catch (err) {
      console.error(`Panel ${panelIndex} generation failed:`, err);
      panel.status = "failed";

      if (panel.imageVersions && panel.imageVersions.length > 0) {
        const lastVersion = panel.imageVersions[panel.imageVersions.length - 1];
        panel.imageUrl = lastVersion.imageUrl;
        panel.status = "completed";
      }
    } finally {
      abortControllers.delete(abortKey(taskId, panelIndex));
    }

    const completedCount = script.panels.filter((p) => p.status === "completed").length;
    task.progress = 30 + Math.floor((completedCount / totalPanels) * 70);
    task.updatedAt = new Date();
    await saveTaskThrottled(task);
    notifyListeners(task);
  });

  await withConcurrency(taskFactories, { limit: IMAGE_CONCURRENCY });

  const allCompleted = script.panels.every((p) => p.status === "completed");
  task.status = allCompleted ? "completed" : "script_ready";
  task.progress = allCompleted ? 100 : task.progress;
  task.updatedAt = new Date();
  await flushThrottledSave(task);
  notifyListeners(task);

  // 生成完成后清理 eventBus 中该任务的临时状态，防止内存泄漏
  if (allCompleted) {
    cleanupTaskState(taskId);
  }
}
