import {
  getAllRelations,
  getCharacterById,
  getConfig,
  getEpisodeArcSnapshots,
  getSeriesById,
  getTaskById,
  upsertTask,
} from "@/lib/server/db";
import { runAccuracyResearch } from "@/lib/accuracy/research";
import { repairAccuracyIssues } from "@/lib/accuracy/repair";
import { reviewPanelClaims } from "@/lib/accuracy/claimReview";
import { buildCharacterContext, inferAppearingCharacters } from "@/lib/characterContext";
import { QUALITY_PRESETS } from "@/lib/config/quality";
import { generateNarrativeOutline } from "@/lib/director";
import { stripDisallowedGuideCharacterFromScript } from "@/lib/guideCharacterPolicy";
import {
  buildEnhancedTopicFromResearch,
  generateScript,
  generateScriptStream,
  generateTopicResearch,
  type StreamChunkCallback,
} from "@/lib/llm";
import { repairScript } from "@/lib/scriptRepair";
import { applyCanonicalCharacterDesc, validateScript } from "@/lib/scriptValidator";
import { getWikipediaSummary, searchWikipedia } from "@/lib/server/wikipedia";
import type {
  Character,
  CharacterRelation,
  ComicScript,
  GenerateRequest,
  GenerateTask,
  PipelineStageTrace,
} from "@/lib/types";

function persistTask(task: GenerateTask): void {
  task.updatedAt = new Date();
  upsertTask(task);
}

export async function patchTask(
  taskId: string,
  patch: Partial<GenerateTask>,
): Promise<GenerateTask> {
  const task = getTaskById(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const updatedTask: GenerateTask = {
    ...task,
    ...patch,
    updatedAt: new Date(),
  };
  upsertTask(updatedTask);
  return updatedTask;
}

function initTrace(task: GenerateTask): void {
  task.pipelineTrace = [];
}

function traceStart(task: GenerateTask, stage: PipelineStageTrace["stage"]): void {
  if (!task.pipelineTrace) {
    task.pipelineTrace = [];
  }
  task.pipelineTrace.push({
    stage,
    status: "running",
    startedAt: Date.now(),
    retryCount: 0,
  });
}

function traceEnd(task: GenerateTask, stage: PipelineStageTrace["stage"], error?: string): void {
  const entry = task.pipelineTrace?.find((item) => item.stage === stage && item.status === "running");
  if (!entry) {
    return;
  }

  entry.status = error ? "failed" : "completed";
  entry.completedAt = Date.now();
  if (error) {
    entry.error = error;
  }
}

function traceSkip(task: GenerateTask, stage: PipelineStageTrace["stage"]): void {
  if (!task.pipelineTrace) {
    task.pipelineTrace = [];
  }
  task.pipelineTrace.push({
    stage,
    status: "skipped",
    retryCount: 0,
  });
}

async function maybeEnrichResearchFromWikipedia(
  request: GenerateRequest,
  research: Awaited<ReturnType<typeof generateTopicResearch>>,
): Promise<void> {
  try {
    const isEnglishTopic = /^[\x00-\x7F]+$/.test(request.topic.trim());
    const wikiLang = isEnglishTopic ? "en" : "zh";
    const results = await searchWikipedia(request.topic, wikiLang);
    const topResult = results[0];
    if (!topResult) {
      return;
    }

    const summary = await getWikipediaSummary(topResult.title, wikiLang);
    if (!summary?.extract) {
      return;
    }

    const wikiSnippet = summary.extract.slice(0, 500).replace(/\n+/g, " ").trim();
    if (wikiSnippet.length <= 50) {
      return;
    }

    research.keyFacts.push(`[Wikipedia] ${wikiSnippet}`);
    if (summary.sections && research.knowledgeMap) {
      for (const section of summary.sections.slice(0, 5)) {
        if (!research.knowledgeMap.related.includes(section)) {
          research.knowledgeMap.related.push(section);
        }
      }
    }
  } catch (error) {
    console.warn("[TaskScriptRunner] Wikipedia enrichment failed (non-fatal):", error);
  }
}

async function runResearchPhase(task: GenerateTask, request: GenerateRequest): Promise<string> {
  let enhancedTopic = request.topic;
  const qualityLevel = request.quality || "standard";

  const canUseTopicResearch =
    (!request.contentType || request.contentType === "science" || request.contentType === "xiaohongshu")
    && !request.wikipediaContent;
  const shouldResearch = qualityLevel === "fine" && canUseTopicResearch;

  if (shouldResearch) {
    try {
      const research = await generateTopicResearch(request.topic, request.llmConfig);
      await maybeEnrichResearchFromWikipedia(request, research);

      task.topicResearch = {
        expandedDescription: research.expandedDescription,
        keyFacts: research.keyFacts,
        narrativeAngle: research.narrativeAngle,
        narrativeAngles: research.narrativeAngles,
        knowledgeMap: research.knowledgeMap,
      };
      task.progress = 10;
      enhancedTopic = buildEnhancedTopicFromResearch(research);
      persistTask(task);
    } catch (error) {
      console.warn("[TaskScriptRunner] Topic research failed, using original topic:", error);
    }
  }

  const shouldRunAccuracyResearch =
    qualityLevel !== "fast"
    && (request.contentType === "science" || request.contentType === "wikipedia");
  if (shouldRunAccuracyResearch) {
    try {
      const config = getConfig();
      if (!config) {
        console.warn("[TaskScriptRunner] Accuracy config missing, skipping fact research");
      } else {
        const accuracyResearch = await runAccuracyResearch({
          topic: request.topic,
          contentType: request.contentType,
          wikipediaContent: request.wikipediaContent,
          accuracyConfig: config.accuracyConfig,
        });
        task.factPack = accuracyResearch.factPack;
        task.researchBrief = accuracyResearch.researchBrief;
        persistTask(task);
      }
    } catch (error) {
      console.warn("[TaskScriptRunner] Accuracy research failed (non-fatal):", error);
    }
  }

  if (qualityLevel === "fine") {
    traceStart(task, "director");
    try {
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
        persistTask(task);
      }
      traceEnd(task, "director");
    } catch (error) {
      traceEnd(task, "director", error instanceof Error ? error.message : "Director failed");
      console.warn("[TaskScriptRunner] Outline generation failed (non-fatal):", error);
    }
  } else {
    traceSkip(task, "director");
  }

  return enhancedTopic;
}

function loadCharacters(request: GenerateRequest): Character[] {
  if (!request.characterIds?.length) {
    return [];
  }

  const characters: Character[] = [];
  for (const id of request.characterIds) {
    try {
      const character = getCharacterById(id);
      if (character) {
        characters.push(character);
      }
    } catch (error) {
      console.warn(`[TaskScriptRunner] Failed to load character ${id}, continuing without it:`, error);
    }
  }
  return characters;
}

function buildSeriesContext(
  request: GenerateRequest,
  characters: Character[],
): { episodeNumber: number; seriesTitle: string; previousRecap?: string } | undefined {
  if (!request.seriesId || characters.length === 0) {
    return undefined;
  }

  try {
    const series = getSeriesById(request.seriesId);
    if (!series) {
      return undefined;
    }

    const snapshots = getEpisodeArcSnapshots(
      series.episodes.map((episode) => episode.taskId),
      characters.map((character) => character.name),
    );
    const recap = snapshots
      .map((snapshot) => `Episode ${snapshot.episodeNumber} "${snapshot.title}": ${snapshot.characterSummary}`)
      .join("\n");

    return {
      episodeNumber: (series.episodes?.length ?? 0) + 1,
      seriesTitle: series.title,
      previousRecap: recap || undefined,
    };
  } catch (error) {
    console.warn("[TaskScriptRunner] Failed to load series context, continuing without it:", error);
    return undefined;
  }
}

async function runScriptPhase(
  task: GenerateTask,
  request: GenerateRequest,
  enhancedTopic: string,
): Promise<void> {
  const qualityPreset = QUALITY_PRESETS[request.quality || "standard"];
  const finalTopic = qualityPreset.promptHint
    ? `${enhancedTopic}\n\n[Generation quality requirement: ${qualityPreset.promptHint}]`
    : enhancedTopic;

  const characters = loadCharacters(request);
  const character = characters[0];
  if (character) {
    task.character = character;
  }

  let relations: CharacterRelation[] = [];
  if (characters.length > 0) {
    try {
      const characterIds = new Set(characters.map((item) => item.id));
      relations = getAllRelations().filter((relation) =>
        characterIds.has(relation.fromId) || characterIds.has(relation.toId),
      );
    } catch (error) {
      console.warn("[TaskScriptRunner] Failed to load character relations, continuing without them:", error);
    }
  }

  const seriesContext = buildSeriesContext(request, characters);
  const characterContext = buildCharacterContext(characters, relations, seriesContext);
  const topicWithCharacters = characterContext.text
    ? `${finalTopic}\n\n${characterContext.text}`
    : finalTopic;

  const onChunk: StreamChunkCallback = (_chunk, accumulated) => {
    task.streamText = accumulated;
    task.progress = Math.min(25, 10 + Math.floor(accumulated.length / 80));
  };

  let script: ComicScript;
  try {
    script = await generateScriptStream(
      topicWithCharacters,
      request.style,
      request.panelCount ?? undefined,
      request.llmConfig,
      request.contentType,
      request.poetryGenre,
      request.poetryMeta,
      character,
      onChunk,
      undefined,
      request.novelMeta,
      request.wikipediaContent,
      request.allowGuideCharacter,
      task.narrativeOutline,
      task.factPack,
    );
  } catch (error) {
    console.warn("[TaskScriptRunner] Stream generation failed, falling back to non-stream:", error);
    script = await generateScript(
      topicWithCharacters,
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
  if (request.referenceImages?.length) {
    script.referenceImages = request.referenceImages;
  }
  if (request.controlMode) {
    script.controlMode = request.controlMode;
  }

  if (characterContext.characterNames.length > 0) {
    for (const panel of script.panels) {
      panel.appearingCharacters = inferAppearingCharacters(
        panel.scene || "",
        panel.dialogue || "",
        characterContext.characterNames,
      );
    }
  }

  task.script = script;
  task.progress = 30;

  traceStart(task, "validate");
  let validation = validateScript(script, {
    contentType: request.contentType,
    narrativeOutline: task.narrativeOutline,
  });
  const actionableWarnings = validation.warnings.filter(
    (warning) => warning.severity === "critical" || warning.severity === "warning",
  );
  traceEnd(task, "validate");

  if (actionableWarnings.length > 0) {
    traceStart(task, "repair");
    let repairRounds = 0;
    let currentWarnings = actionableWarnings;
    while (currentWarnings.length > 0 && repairRounds < 2) {
      repairRounds += 1;
      try {
        const repaired = await repairScript(script, currentWarnings, request.llmConfig, {
          contentType: request.contentType,
          narrativeOutline: task.narrativeOutline,
        });
        if (!repaired) {
          break;
        }

        script = repaired;
        validation = validateScript(script, {
          contentType: request.contentType,
          narrativeOutline: task.narrativeOutline,
        });
        currentWarnings = validation.warnings.filter(
          (warning) => warning.severity === "critical" || warning.severity === "warning",
        );
      } catch (error) {
        console.warn("[TaskScriptRunner] Script repair failed, keeping current script:", error);
        break;
      }
    }

    if (repairRounds > 0) {
      task.scriptRepairRounds = repairRounds;
    }
    traceEnd(task, "repair");
  } else {
    traceSkip(task, "repair");
  }

  task.script = script;
  task.scriptValidation = validation;
  applyCanonicalCharacterDesc(script);

  if (task.factPack && (request.contentType === "science" || request.contentType === "wikipedia")) {
    traceStart(task, "accuracy");
    let accuracyReview = reviewPanelClaims(script, task.factPack);
    let accuracyRepairRounds = 0;
    while (accuracyReview.status === "repair_required" && accuracyRepairRounds < 2) {
      accuracyRepairRounds += 1;
      const repaired = await repairAccuracyIssues(script, accuracyReview, task.factPack, request.llmConfig);
      if (!repaired) {
        break;
      }
      script = repaired;
      task.script = script;
      accuracyReview = reviewPanelClaims(script, task.factPack);
    }

    task.accuracyReview = accuracyReview;

    if (accuracyReview.status === "blocked") {
      traceEnd(task, "accuracy", "高风险事实冲突，脚本未通过准确性校验");
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
      persistTask(task);
      return;
    }

    traceEnd(task, "accuracy");
  } else {
    traceSkip(task, "accuracy");
  }

  task.script = script;
  task.status = "script_ready";
  task.error = undefined;
  persistTask(task);
}

export async function runResearchAndScriptTask(
  taskId: string,
  request: GenerateRequest,
): Promise<void> {
  const task = getTaskById(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  try {
    task.status = "research_running";
    task.progress = 5;
    task.error = undefined;
    task.streamText = undefined;
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
    if (request.presetSnapshot) {
      task.presetSnapshot = request.presetSnapshot;
    }
    initTrace(task);
    persistTask(task);

    traceStart(task, "research");
    let enhancedTopic: string;
    try {
      enhancedTopic = await runResearchPhase(task, request);
      traceEnd(task, "research");
    } catch (error) {
      traceEnd(task, "research", error instanceof Error ? error.message : "Unknown error");
      throw error;
    }

    task.status = "script_running";
    persistTask(task);

    traceStart(task, "script");
    try {
      await runScriptPhase(task, request, enhancedTopic);
      traceEnd(task, "script");
      persistTask(task);
    } catch (error) {
      traceEnd(task, "script", error instanceof Error ? error.message : "Unknown error");
      throw error;
    }

    // Auto-continue to image generation if preset allows it
    if ((task.status as string) === "script_ready" && !request.presetSnapshot?.pauseAfterScript) {
      try {
        // Lazy import to avoid circular dependency (runtime.ts imports scriptRunner.ts)
        const { getTaskRuntime } = await import("./runtime");
        const runtime = getTaskRuntime();
        console.log(`[TaskScriptRunner] Auto-continuing to image generation for task ${task.id}`);
        // Avoid nested event loop blocking by deferring to next tick
        setTimeout(() => {
          try {
            runtime.enqueueImageQueue(task.id, {
              llmConfig: request.llmConfig,
              imageConfig: request.imageConfig,
            });
          } catch (err) {
            console.error(`[TaskScriptRunner] Deferred auto-enqueue failed for ${task.id}:`, err);
          }
        }, 0);
      } catch (error) {
        console.error(`[TaskScriptRunner] Failed to auto-enqueue image queue for ${task.id}:`, error);
        // Task stays at script_ready; user can manually continue
      }
    }
  } catch (error) {
    task.status = "failed";
    task.error = error instanceof Error ? error.message : "Unknown error";
    task.streamText = undefined;
    persistTask(task);
  }
}
