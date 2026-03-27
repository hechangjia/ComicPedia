import { GenerateRequest, GenerateTask, ComicScript, ComicStyle, ComicPanel, PartialImageGenConfig, PartialLLMConfig } from "@/lib/types";
import { generateScript, generateScriptStream, generateTopicResearch, buildEnhancedTopicFromResearch, StreamChunkCallback } from "@/lib/llm";
import { getImageAdapter } from "@/lib/imageGen";
import { validateScript, applyCanonicalCharacterDesc } from "@/lib/scriptValidator";
import { repairScript } from "@/lib/scriptRepair";
import { evaluateQuality } from "@/lib/qualityScore";
import { evaluateVisualQuality } from "@/lib/vlmScorer";
import { generateNarrativeOutline } from "@/lib/director";
import { shouldAutoRetry, generatePromptPatch, applyPromptPatch, buildPanelReview, buildTaskReviewStatus } from "@/lib/vlmRetry";
import { getStyleModifier, getStyleNegativePrompt, STYLE_META } from "@/lib/config/styles";
import { stripDisallowedGuideCharacterFromScript } from "@/lib/guideCharacterPolicy";
import { urlToBase64 } from "@/lib/utils";
import { withConcurrency } from "@/lib/concurrency";
import { withRetry } from "@/lib/retryQueue";
import { QUALITY_PRESETS } from "@/lib/config/quality";
import { saveTask, getTask, getCharacter } from "./db";
import { notifyListeners, saveTaskThrottled, flushThrottledSave, cleanupTaskState } from "./eventBus";
import { abortControllers, abortKey } from "./abortManager";
import { pushImageVersion } from "./panelManager";
import { buildEnhancedPrompt, buildEnhancedPromptWithLog, mergeReferenceImage } from "./promptEnhancer";
import { getStoredRequestConfigs } from "@/hooks/useAPIConfig";

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

/** 次要氛围/光照修饰词（可安全移除） */
const ATMOSPHERE_TERMS = [
  "atmospheric", "ethereal", "mystical", "dreamy", "moody",
  "serene", "tranquil", "melancholic", "whimsical", "nostalgic",
  "dramatic lighting", "volumetric", "rim light", "backlight",
  "golden hour", "sunset glow", "chiaroscuro", "bokeh",
  "depth of field", "lens flare", "motion blur",
  "in the background", "background details", "scattered",
];

/** 移除敏感词 */
function removeSensitiveTerms(prompt: string): string {
  let result = prompt;
  for (const term of SENSITIVE_TERMS) {
    result = result.replace(new RegExp(`\\b${term}\\b`, "gi"), "");
  }
  return result.replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim();
}

/** 移除次要修饰词（保留核心语义） */
function removeAtmosphereTerms(prompt: string): string {
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
function adaptPromptForRetry(original: string, retryLevel: number, lastError: Error | null): string {
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

function applyVisualReviewResult(task: GenerateTask, visualScore: NonNullable<GenerateTask["visualQualityScore"]>) {
  task.visualQualityScore = visualScore;
  task.panelReview = buildPanelReview(visualScore);
  task.reviewStatus = buildTaskReviewStatus(task.panelReview);
  task.lastReviewAt = visualScore.evaluatedAt;
}

function markRetryingPanelReview(
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

function markFailedPanelReview(task: GenerateTask, panelIndex: number) {
  task.panelReview = (task.panelReview ?? []).map((panel) =>
    panel.panelIndex === panelIndex
      ? { ...panel, status: "failed" as const }
      : panel,
  );
  task.reviewStatus = buildTaskReviewStatus(task.panelReview);
}

function finalizeRetryCycleFailure(task: GenerateTask, attemptedPanels: number[]) {
  const attempted = new Set(attemptedPanels);
  task.panelReview = (task.panelReview ?? []).map((panel) =>
    attempted.has(panel.panelIndex) && panel.status === "retrying"
      ? { ...panel, status: "needs_repair" as const }
      : panel,
  );
  task.reviewStatus = buildTaskReviewStatus(task.panelReview);
}

async function runAutomaticVisualRetryCycle(
  taskId: string,
  visualScore: NonNullable<GenerateTask["visualQualityScore"]>,
  imageConfig: PartialImageGenConfig | undefined,
  vlmConfig: PartialLLMConfig,
): Promise<void> {
  const freshTask = await getTask(taskId);
  if (!freshTask?.script) return;

  applyVisualReviewResult(freshTask, visualScore);

  if (freshTask.visualRetrySummary) {
    freshTask.updatedAt = new Date();
    await saveTask(freshTask);
    notifyListeners(freshTask);
    console.log(`[VLM] Visual score: ${visualScore.overall}/10, retry skipped because cycle already exists`);
    return;
  }

  const retryCandidates = [...visualScore.panels]
    .sort((a, b) => a.panelIndex - b.panelIndex)
    .filter(shouldAutoRetry)
    .flatMap((panelScore) => {
      const panel = freshTask.script?.panels[panelScore.panelIndex];
      if (!panel) return [];

      const patch = generatePromptPatch(panelScore);
      const refinedPrompt = applyPromptPatch(panel.imagePrompt, patch);
      const mergedConfig = mergeReferenceImage(imageConfig, freshTask.script!, panel, panelScore.panelIndex);
      const existingNeg = mergedConfig?.extraBody?.negative_prompt || "";
      const hasNewNegative = patch.negative.some(
        (item) => !existingNeg.toLowerCase().includes(item.toLowerCase()),
      );

      if (refinedPrompt === panel.imagePrompt && !hasNewNegative) {
        return [];
      }

      return [{ panelScore, panel, patch, refinedPrompt }];
    })
    .slice(0, 3);

  if (retryCandidates.length === 0) {
    const now = new Date().toISOString();
    freshTask.visualRetrySummary = {
      status: "skipped",
      startedAt: now,
      finishedAt: now,
      initialOverallScore: visualScore.overall,
      finalOverallScore: visualScore.overall,
      attemptedPanels: [],
      outcomes: [],
    };
    freshTask.updatedAt = new Date();
    await saveTask(freshTask);
    notifyListeners(freshTask);
    console.log(`[VLM] Visual score: ${visualScore.overall}/10, no retryable panels`);
    return;
  }

  const startedAt = new Date().toISOString();
  const attemptedPanels = retryCandidates.map(({ panelScore }) => panelScore.panelIndex);
  freshTask.visualRetrySummary = {
    status: "running",
    startedAt,
    initialOverallScore: visualScore.overall,
    attemptedPanels,
    outcomes: attemptedPanels.map((panelIndex) => ({
      panelIndex,
      status: "retrying" as const,
    })),
  };
  freshTask.panelReview = markRetryingPanelReview(visualScore, attemptedPanels);
  freshTask.reviewStatus = buildTaskReviewStatus(freshTask.panelReview);
  freshTask.updatedAt = new Date();
  await saveTask(freshTask);
  notifyListeners(freshTask);
  console.log(`[VLM-Retry] Auto-retrying ${attemptedPanels.length} low-scoring panels...`);

  let hasFailure = false;

  for (const { panelScore, panel, patch, refinedPrompt } of retryCandidates) {
    const originalPrompt = panel.imagePrompt;
    if (panel.imageUrl?.startsWith("data:image")) {
      pushImageVersion(panel, panel.imageUrl);
    }
    panel.imagePrompt = refinedPrompt;
    panel.status = "generating";

    try {
      let mergedConfig = mergeReferenceImage(imageConfig, freshTask.script, panel, panelScore.panelIndex);

      if (patch.negative.length > 0) {
        const existingNeg = mergedConfig?.extraBody?.negative_prompt || "";
        const newNeg = patch.negative
          .filter((item) => !existingNeg.toLowerCase().includes(item.toLowerCase()))
          .join(", ");
        if (newNeg) {
          mergedConfig = {
            ...mergedConfig,
            extraBody: {
              ...mergedConfig?.extraBody,
              negative_prompt: existingNeg ? `${existingNeg}, ${newNeg}` : newNeg,
            },
          };
        }
      }

      const adapter = getImageAdapter(mergedConfig);
      const panelSeed = freshTask.script.seed !== undefined
        ? freshTask.script.seed + panelScore.panelIndex + 1000
        : undefined;

      const imageUrl = await withRetry(
        () => adapter.generate(refinedPrompt, panel.styleOverride ?? freshTask.script!.style, panelSeed),
        { maxRetries: 1, baseDelay: 1000 },
      );

      panel.status = "completed";
      panel.imageUrl = imageUrl;
      try {
        const base64 = await urlToBase64(imageUrl);
        panel.imageUrl = base64;
        pushImageVersion(panel, base64);
        saveImageToFileSystem(taskId, panelScore.panelIndex, base64, freshTask.script.title);
      } catch {
        pushImageVersion(panel, imageUrl);
      }

      const outcome = freshTask.visualRetrySummary.outcomes.find((item) => item.panelIndex === panelScore.panelIndex);
      if (outcome) outcome.status = "completed";
      console.log(`[VLM-Retry] Panel ${panelScore.panelIndex + 1} regenerated successfully`);
    } catch (err) {
      hasFailure = true;
      console.warn(`[VLM-Retry] Panel ${panelScore.panelIndex + 1} retry failed:`, err);
      panel.imagePrompt = originalPrompt;
      panel.status = "completed";
      if (panel.imageVersions?.length) {
        panel.imageUrl = panel.imageVersions[panel.imageVersions.length - 1].imageUrl;
      }
      const outcome = freshTask.visualRetrySummary.outcomes.find((item) => item.panelIndex === panelScore.panelIndex);
      if (outcome) outcome.status = "failed";
      markFailedPanelReview(freshTask, panelScore.panelIndex);
    }

    freshTask.updatedAt = new Date();
    await saveTask(freshTask);
    notifyListeners(freshTask);
  }

  if (hasFailure) {
    finalizeRetryCycleFailure(freshTask, attemptedPanels);
    freshTask.visualRetrySummary = {
      ...freshTask.visualRetrySummary,
      status: "failed",
      finishedAt: new Date().toISOString(),
      finalOverallScore: freshTask.visualQualityScore?.overall ?? visualScore.overall,
    };
    freshTask.updatedAt = new Date();
    await saveTask(freshTask);
    notifyListeners(freshTask);
    return;
  }

  try {
    const reevaluatedScore = await evaluateVisualQuality(freshTask.script, vlmConfig);
    applyVisualReviewResult(freshTask, reevaluatedScore);
    freshTask.visualRetrySummary = {
      ...freshTask.visualRetrySummary,
      status: "completed",
      finishedAt: new Date().toISOString(),
      finalOverallScore: reevaluatedScore.overall,
    };
    freshTask.updatedAt = new Date();
    await saveTask(freshTask);
    notifyListeners(freshTask);
    console.log(`[VLM-Retry] Re-evaluated score: ${reevaluatedScore.overall}/10`);
  } catch (err) {
    console.warn("[VLM-Retry] Re-evaluation failed:", err);
    finalizeRetryCycleFailure(freshTask, attemptedPanels);
    freshTask.visualRetrySummary = {
      ...freshTask.visualRetrySummary,
      status: "failed",
      finishedAt: new Date().toISOString(),
      finalOverallScore: freshTask.visualQualityScore?.overall ?? visualScore.overall,
    };
    freshTask.updatedAt = new Date();
    await saveTask(freshTask);
    notifyListeners(freshTask);
  }
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
      allowGuideCharacter: request.allowGuideCharacter,
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

        // ── P3: Wikipedia 自动整合 — 尝试从 Wikipedia 获取权威知识补充 ──
        try {
          // 智能语言选择：纯英文/数字主题用 en，否则用 zh
          const isEnglishTopic = /^[\x00-\x7F]+$/.test(request.topic.trim());
          const wikiLang = isEnglishTopic ? "en" : "zh";
          const wikiRes = await fetch(`/api/wikipedia?q=${encodeURIComponent(request.topic)}&lang=${wikiLang}`);
          if (wikiRes.ok) {
            const wikiData = await wikiRes.json();
            const results = wikiData.results as Array<{ title: string; description?: string }>;
            if (results && results.length > 0) {
              // 取第一条搜索结果的摘要
              const topResult = results[0];
              const summaryRes = await fetch(`/api/wikipedia?title=${encodeURIComponent(topResult.title)}&lang=${wikiLang}`);
              if (summaryRes.ok) {
                const summary = await summaryRes.json();
                if (summary.extract) {
                  // 将 Wikipedia 摘要前 500 字作为补充事实注入 keyFacts
                  const wikiSnippet = summary.extract.slice(0, 500).replace(/\n+/g, " ").trim();
                  if (wikiSnippet.length > 50) {
                    research.keyFacts.push(`[Wikipedia] ${wikiSnippet}`);
                    // 将 Wikipedia 章节结构加入知识图谱
                    if (summary.sections && research.knowledgeMap) {
                      const wikiSections = (summary.sections as string[]).slice(0, 5);
                      for (const section of wikiSections) {
                        if (!research.knowledgeMap.related.includes(section)) {
                          research.knowledgeMap.related.push(section);
                        }
                      }
                    }
                    console.log(`[Research] Wikipedia enrichment: "${topResult.title}" (${wikiSnippet.length} chars)`);
                  }
                }
              }
            }
          }
        } catch (wikiErr) {
          // Wikipedia 整合失败不阻断主流程
          console.warn("[Research] Wikipedia auto-lookup failed (non-fatal):", wikiErr);
        }

        // Store research result for UI display
        task.topicResearch = {
          expandedDescription: research.expandedDescription,
          keyFacts: research.keyFacts,
          narrativeAngle: research.narrativeAngle,
          narrativeAngles: research.narrativeAngles,
          knowledgeMap: research.knowledgeMap,
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

    // ── Phase 0.5: Director Outline (standard + fine 自动触发) ──
    const qualityPreset = QUALITY_PRESETS[request.quality || "standard"];
    const qualityLevel = request.quality || "standard";

    if (qualityLevel === "fine" || qualityLevel === "standard") {
      try {
        task.streamText = "正在规划叙事大纲...";
        notifyListeners(task);

        const outline = await generateNarrativeOutline(
          enhancedTopic,
          request.style,
          request.panelCount ?? undefined,
          request.llmConfig,
          request.contentType,
          task.topicResearch?.expandedDescription,
        );

        if (outline) {
          task.narrativeOutline = outline;
          console.log(`[Director] Outline generated: ${outline.totalPanels} panels, arc: ${outline.narrativeArc}`);
        }
      } catch (dirErr) {
        console.warn("[Director] Outline generation failed (non-fatal):", dirErr);
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
        request.allowGuideCharacter,
        task.narrativeOutline,
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
        request.allowGuideCharacter,
        task.narrativeOutline,
      );
    }

    task.streamText = undefined;

    if (request.allowGuideCharacter === false && !character) {
      script = stripDisallowedGuideCharacterFromScript(script);
    }

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
    let validation = validateScript(script, {
      contentType: request.contentType,
      narrativeOutline: task.narrativeOutline,
    });

    // ── P0: 脚本自修复 Agent — 将 warning 反馈给 LLM 自动修正，最多 2 轮 ──
    const actionableWarnings = validation.warnings.filter(w => w.severity === "critical" || w.severity === "warning");
    if (actionableWarnings.length > 0) {
      let repairRounds = 0;
      const MAX_REPAIR_ROUNDS = 2;
      let currentWarnings = actionableWarnings;

      while (currentWarnings.length > 0 && repairRounds < MAX_REPAIR_ROUNDS) {
        repairRounds++;
        try {
          task.streamText = `正在自动修复脚本（第${repairRounds}轮，${currentWarnings.length}个问题）...`;
          notifyListeners(task);

          const repaired = await repairScript(script, currentWarnings, request.llmConfig);
          if (!repaired) break;

          script = repaired;
          validation = validateScript(script, {
            contentType: request.contentType,
            narrativeOutline: task.narrativeOutline,
          });
          currentWarnings = validation.warnings.filter(w => w.severity === "critical" || w.severity === "warning");
        } catch (repairErr) {
          console.warn("[ScriptRepair] Repair round failed, keeping current script:", repairErr);
          break;
        }
      }

      if (repairRounds > 0) {
        task.scriptRepairRounds = repairRounds;
        console.log(`[ScriptRepair] ${repairRounds} round(s) completed, remaining actionable: ${currentWarnings.length}`);
      }
    }

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
    allowGuideCharacter: task.generationConfig?.allowGuideCharacter,
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
  llmConfig?: PartialLLMConfig,
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
      const prompt = buildEnhancedPrompt(firstPanel.imagePrompt, firstIdx, characterDesc, script.style, totalPanels, task.narrativeOutline?.panels[firstIdx]?.suggestedComposition);
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
      const directorComp = task.narrativeOutline?.panels[panelIndex]?.suggestedComposition;
      const enhanceResult = buildEnhancedPromptWithLog(panel.imagePrompt, panelIndex, characterDesc, panel.styleOverride ?? script.style, totalPanels, directorComp);
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

      // P2: 智能重试 — 捕获错误类型，选择针对性策略
      let retryCount = 0;
      let lastRetryError: Error | null = null;
      const imageUrl = await withRetry(
        async () => {
          const currentPrompt = retryCount === 0 ? prompt
            : adaptPromptForRetry(prompt, retryCount, lastRetryError);
          retryCount++;
          try {
            return await adapter.generate(currentPrompt, panel.styleOverride ?? script.style, panelSeed, panelController.signal);
          } catch (err) {
            lastRetryError = err instanceof Error ? err : new Error(String(err));
            throw err;
          }
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

  // ── P1: Quality Gate — 自动评估漫画质量（非阻塞，不影响完成状态） ──
  if (allCompleted && llmConfig) {
    evaluateQuality(script, llmConfig)
      .then(async (quality) => {
        const freshTask = await getTask(taskId);
        if (freshTask) {
          freshTask.qualityScore = quality;
          freshTask.updatedAt = new Date();
          await saveTask(freshTask);
          notifyListeners(freshTask);
          console.log(`[QualityGate] Score: ${quality.overall}/10, suggestions: ${quality.suggestions.length}`);
        }
      })
      .catch((err) => {
        console.warn("[QualityGate] Auto-evaluation failed (non-fatal):", err);
      });

    // ── P0: VLM Visual Scoring — 用视觉语言模型评估实际生成的图片（非阻塞） ──
    // 仅在精细质量档位自动触发，其他档位用户可手动触发
    const qualityLevel = task.generationConfig?.quality;
    if (qualityLevel === "fine") {
      // Use dedicated VLM config if available, otherwise fall back to llmConfig
      const vlmConfig = getStoredRequestConfigs().vlmConfig || llmConfig;
      evaluateVisualQuality(script, vlmConfig)
        .then(async (visualScore) => {
          await runAutomaticVisualRetryCycle(taskId, visualScore, imageConfig, vlmConfig);
        })
        .catch((err) => {
          console.warn("[VLM] Visual evaluation failed (non-fatal):", err);
        });
    }
  }

  // 生成完成后清理 eventBus 中该任务的临时状态，防止内存泄漏
  if (allCompleted) {
    cleanupTaskState(taskId);
  }
}
