import { GenerateRequest, GenerateTask, ComicScript } from "@/lib/types";
import { generateScript, generateScriptStream, StreamChunkCallback } from "@/lib/llm";
import { validateScript, applyCanonicalCharacterDesc } from "@/lib/scriptValidator";
import { repairScript } from "@/lib/scriptRepair";
import { reviewPanelClaims } from "@/lib/accuracy/claimReview";
import { repairAccuracyIssues } from "@/lib/accuracy/repair";
import { stripDisallowedGuideCharacterFromScript } from "@/lib/guideCharacterPolicy";
import { QUALITY_PRESETS } from "@/lib/config/quality";
import { getCharacter, saveTask, notifyListeners } from "./shared";

/**
 * Phase 1: Script Generation + validation + repair + accuracy review.
 * Mutates task in place. Returns when task reaches script_ready or failed.
 */
export async function runScriptPhase(
  task: GenerateTask,
  request: GenerateRequest,
  enhancedTopic: string,
  signal?: AbortSignal,
): Promise<void> {
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

  const qualityPreset = QUALITY_PRESETS[request.quality || "standard"];
  const finalTopic = qualityPreset.promptHint
    ? `${enhancedTopic}\n\n[Generation quality requirement: ${qualityPreset.promptHint}]`
    : enhancedTopic;

  // Resolve character from characterIds
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
      signal,
      request.novelMeta,
      request.wikipediaContent,
      request.allowGuideCharacter,
      task.narrativeOutline,
      task.factPack,
    );
  } catch (streamErr) {
    if (signal?.aborted) throw streamErr;

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
      task.factPack,
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

  // ── P0: 脚本自修复 Agent ──
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

        const repaired = await repairScript(script, currentWarnings, request.llmConfig, {
          contentType: request.contentType,
          narrativeOutline: task.narrativeOutline,
        });
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

  // ── 角色描述标准化 ──
  applyCanonicalCharacterDesc(script);

  if (task.factPack && (request.contentType === "science" || request.contentType === "wikipedia")) {
    let accuracyReview = reviewPanelClaims(script, task.factPack);

    let accuracyRepairRounds = 0;
    while (accuracyReview.status === "repair_required" && accuracyRepairRounds < 2) {
      accuracyRepairRounds += 1;
      const repaired = await repairAccuracyIssues(script, accuracyReview, task.factPack, request.llmConfig);
      if (!repaired) break;
      script = repaired;
      task.script = script;
      accuracyReview = reviewPanelClaims(script, task.factPack);
    }

    task.accuracyReview = accuracyReview;

    if (accuracyReview.status === "blocked") {
      task.script = script;
      task.status = "failed";
      task.error = "高风险事实冲突，脚本未通过准确性校验";
      task.accuracyErrorSummary = {
        status: "blocked",
        blockingIssueCount: accuracyReview.blockingIssueCount,
        panels: accuracyReview.panels,
        generatedAt: new Date().toISOString(),
        sourceCoverage: accuracyReview.sourceCoverage,
      };
      task.updatedAt = new Date();
      await saveTask(task);
      notifyListeners(task);
      return;
    }
  }

  task.status = "script_ready";
  task.updatedAt = new Date();
  await saveTask(task);
  notifyListeners(task);
}
