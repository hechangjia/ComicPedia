# ComicPedia Enhancement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor oversized files, build deep character relationship system, redesign result page UX, and enhance pipeline observability — in 4 incremental phases.

**Architecture:** Each phase interleaves refactoring (file splits + tests) with feature work. Phase boundaries are merge-safe — each phase produces working software. File splits preserve public API via re-exports from original paths.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest, Zustand, better-sqlite3, d3-force (Phase 2), Tailwind CSS

---

## Phase 1 — Foundation (Architecture + Result Page)

### Task 1.1: Split `taskLifecycle.ts` into phase modules

**Files:**
- Create: `src/lib/client/phases/research.ts`
- Create: `src/lib/client/phases/script.ts`
- Create: `src/lib/client/phases/imageGen.ts`
- Create: `src/lib/client/phases/vlm.ts`
- Create: `src/lib/client/phases/quality.ts`
- Create: `src/lib/client/phases/shared.ts`
- Modify: `src/lib/client/taskLifecycle.ts`

- [ ] **Step 1: Create shared helpers module**

Extract utility functions that multiple phases depend on into `phases/shared.ts`:

```typescript
// src/lib/client/phases/shared.ts
import { GenerateTask } from "@/lib/types";
import { saveTask, getTask } from "../db";
import { notifyListeners } from "../eventBus";
import { pushImageVersion } from "../panelManager";
import { buildEnhancedPrompt, buildEnhancedPromptWithLog, mergeReferenceImage } from "../promptEnhancer";
import { abortControllers } from "../abortManager";

// --- Sensitive/atmosphere term lists (moved from taskLifecycle.ts) ---

export const SENSITIVE_TERMS = [
  "blood", "gore", "violence", "weapon", "gun", "knife", "sword",
  "nude", "naked", "sexy", "revealing", "provocative",
  "dead", "death", "kill", "murder", "corpse",
  "drug", "alcohol", "cigarette", "smoking",
];

export const ATMOSPHERE_TERMS = [
  "atmospheric", "ethereal", "mystical", "dreamy", "moody",
  "serene", "tranquil", "melancholic", "whimsical", "nostalgic",
  "dramatic lighting", "volumetric", "rim light", "backlight",
  "golden hour", "sunset glow", "chiaroscuro", "bokeh",
  "depth of field", "lens flare", "motion blur",
  "in the background", "background details", "scattered",
];

export function removeSensitiveTerms(prompt: string): string {
  let result = prompt;
  for (const term of SENSITIVE_TERMS) {
    result = result.replace(new RegExp(`\\b${term}\\b`, "gi"), "");
  }
  return result.replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim();
}

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

export function adaptPromptForRetry(original: string, retryLevel: number, lastError: Error | null): string {
  const msg = lastError?.message?.toLowerCase() || "";
  if (msg.includes("safety") || msg.includes("content_filter") ||
      msg.includes("blocked") || msg.includes("nsfw") ||
      msg.includes("inappropriate") || msg.includes("violat")) {
    return removeSensitiveTerms(original);
  }
  if (msg.includes("rate") || msg.includes("429") || msg.includes("quota")) {
    return original;
  }
  if (msg.includes("too long") || msg.includes("token") ||
      msg.includes("maximum") || msg.includes("length")) {
    const words = original.split(/\s+/).slice(0, 120);
    return words.join(" ") + ", high quality illustration";
  }
  if (retryLevel === 1) return removeSensitiveTerms(original);
  return removeAtmosphereTerms(original);
}

export function generateId(): string {
  return `comic_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveImageToFileSystem(
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

// Re-export commonly needed deps for phase modules
export { saveTask, getTask, notifyListeners, pushImageVersion, abortControllers };
export { buildEnhancedPrompt, buildEnhancedPromptWithLog, mergeReferenceImage };
```

- [ ] **Step 2: Extract research phase**

Move Phase 0 (Topic Research) and Phase 0.5 (Accuracy Research) and Phase 0.7 (Director Outline) from `processScripting` into `phases/research.ts`:

```typescript
// src/lib/client/phases/research.ts
import { GenerateTask, GenerateRequest, PartialLLMConfig, NarrativeOutline, FactPack } from "@/lib/types";
import { generateTopicResearch, buildEnhancedTopicFromResearch } from "@/lib/llm";
import { generateNarrativeOutline } from "@/lib/director";
import { QUALITY_PRESETS } from "@/lib/config/quality";
import { notifyListeners } from "./shared";

export interface ResearchResult {
  enhancedTopic: string;
  narrativeOutline?: NarrativeOutline;
  factPack?: FactPack;
  researchBrief?: GenerateTask["researchBrief"];
  topicResearch?: GenerateTask["topicResearch"];
}

/**
 * Run topic research, accuracy research, and director outline.
 * Non-fatal — falls back gracefully on any failure.
 */
export async function runResearchPhase(
  task: GenerateTask,
  request: GenerateRequest,
): Promise<ResearchResult> {
  let enhancedTopic = request.topic;

  // Phase 0: Topic Research
  const shouldResearch =
    (!request.contentType || request.contentType === "science" || request.contentType === "xiaohongshu")
    && !request.wikipediaContent;

  if (shouldResearch) {
    try {
      task.streamText = "正在研究主题...（本地模型首次加载可能需要等待）";
      notifyListeners(task);

      const research = await generateTopicResearch(request.topic, request.llmConfig);

      // Wikipedia auto-enrichment
      try {
        const isEnglishTopic = /^[\x00-\x7F]+$/.test(request.topic.trim());
        const wikiLang = isEnglishTopic ? "en" : "zh";
        const wikiRes = await fetch(`/api/wikipedia?q=${encodeURIComponent(request.topic)}&lang=${wikiLang}`);
        if (wikiRes.ok) {
          const wikiData = await wikiRes.json();
          const results = wikiData.results as Array<{ title: string; description?: string }>;
          if (results && results.length > 0) {
            const summaryRes = await fetch(`/api/wikipedia?title=${encodeURIComponent(results[0].title)}&lang=${wikiLang}`);
            if (summaryRes.ok) {
              const summary = await summaryRes.json();
              if (summary.extract) {
                const wikiSnippet = summary.extract.slice(0, 500).replace(/\n+/g, " ").trim();
                if (wikiSnippet.length > 50) {
                  research.keyFacts.push(`[Wikipedia] ${wikiSnippet}`);
                  if (summary.sections && research.knowledgeMap) {
                    const wikiSections = (summary.sections as string[]).slice(0, 5);
                    for (const section of wikiSections) {
                      if (!research.knowledgeMap.related.includes(section)) {
                        research.knowledgeMap.related.push(section);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      } catch {
        // Wikipedia enrichment failure is non-fatal
      }

      task.topicResearch = {
        expandedDescription: research.expandedDescription,
        keyFacts: research.keyFacts,
        narrativeAngle: research.narrativeAngle,
        narrativeAngles: research.narrativeAngles,
        knowledgeMap: research.knowledgeMap,
      };
      task.progress = 10;
      notifyListeners(task);

      enhancedTopic = buildEnhancedTopicFromResearch(research);
    } catch {
      task.streamText = undefined;
      notifyListeners(task);
    }
  }

  // Phase 0.5: Accuracy Research
  const shouldRunAccuracyResearch = request.contentType === "science" || request.contentType === "wikipedia";
  let factPack: FactPack | undefined;
  let researchBrief: GenerateTask["researchBrief"];

  if (shouldRunAccuracyResearch) {
    try {
      task.streamText = "正在构建事实约束...";
      notifyListeners(task);

      const res = await fetch("/api/accuracy/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: request.topic,
          contentType: request.contentType,
          wikipediaContent: request.wikipediaContent,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        factPack = data.factPack;
        researchBrief = data.researchBrief;
      }
    } catch {
      // Non-fatal
    }
  }

  // Phase 0.7: Director Outline
  const qualityLevel = request.quality || "standard";
  let narrativeOutline: NarrativeOutline | undefined;

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
        narrativeOutline = outline;
      }
    } catch {
      // Non-fatal
    }
  }

  return { enhancedTopic, narrativeOutline, factPack, researchBrief, topicResearch: task.topicResearch };
}
```

- [ ] **Step 3: Extract script phase**

Move Phase 1 (Script Generation) + validation + repair + accuracy review into `phases/script.ts`:

```typescript
// src/lib/client/phases/script.ts
import {
  GenerateTask, GenerateRequest, ComicScript, Character,
  NarrativeOutline, FactPack, PartialLLMConfig,
} from "@/lib/types";
import { generateScript, generateScriptStream, StreamChunkCallback } from "@/lib/llm";
import { validateScript, applyCanonicalCharacterDesc } from "@/lib/scriptValidator";
import { repairScript } from "@/lib/scriptRepair";
import { reviewPanelClaims } from "@/lib/accuracy/claimReview";
import { repairAccuracyIssues } from "@/lib/accuracy/repair";
import { stripDisallowedGuideCharacterFromScript } from "@/lib/guideCharacterPolicy";
import { QUALITY_PRESETS } from "@/lib/config/quality";
import { getCharacter } from "../db";
import { notifyListeners } from "./shared";

export interface ScriptPhaseResult {
  script: ComicScript;
  character?: Character;
}

/**
 * Generate script via LLM, run validation/repair/accuracy review.
 * Returns the finalized script and resolved character.
 */
export async function runScriptPhase(
  task: GenerateTask,
  request: GenerateRequest,
  enhancedTopic: string,
  narrativeOutline?: NarrativeOutline,
  factPack?: FactPack,
  signal?: AbortSignal,
): Promise<ScriptPhaseResult> {
  const qualityPreset = QUALITY_PRESETS[request.quality || "standard"];

  // Resolve character
  let character: Character | undefined;
  if (request.characterIds && request.characterIds.length > 0) {
    try {
      const char = await getCharacter(request.characterIds[0]);
      if (char) {
        character = char;
        task.character = char;
      }
    } catch {
      // Proceed without character
    }
  }

  // Build final topic
  const finalTopic = qualityPreset.promptHint
    ? `${enhancedTopic}\n\n[Generation quality requirement: ${qualityPreset.promptHint}]`
    : enhancedTopic;

  // Stream script generation
  let lastNotifyTime = 0;
  const NOTIFY_THROTTLE_MS = 100;
  const onChunk: StreamChunkCallback = (_chunk, accumulated) => {
    task.streamText = accumulated;
    task.progress = Math.min(25, 10 + Math.floor(accumulated.length / 80));
    const now = Date.now();
    if (now - lastNotifyTime >= NOTIFY_THROTTLE_MS) {
      lastNotifyTime = now;
      notifyListeners(task);
    }
  };

  let script: ComicScript;

  try {
    if (!task.streamText) {
      task.streamText = "正在生成脚本...（本地模型首次加载可能需要等待）";
      notifyListeners(task);
    }

    script = await generateScriptStream(
      finalTopic, request.style, request.panelCount ?? undefined,
      request.llmConfig, request.contentType, request.poetryGenre,
      request.poetryMeta, character, onChunk, signal,
      request.novelMeta, request.wikipediaContent,
      request.allowGuideCharacter, narrativeOutline, factPack,
    );
  } catch (streamErr) {
    if (signal?.aborted) throw streamErr;
    task.streamText = undefined;
    notifyListeners(task);

    script = await generateScript(
      finalTopic, request.style, request.panelCount ?? undefined,
      request.llmConfig, request.contentType, request.poetryGenre,
      request.poetryMeta, character, request.novelMeta,
      request.wikipediaContent, request.allowGuideCharacter,
      narrativeOutline, factPack,
    );
  }

  task.streamText = undefined;

  // Guide character policy
  if (request.allowGuideCharacter === false && !character) {
    script = stripDisallowedGuideCharacterFromScript(script);
  }

  // Preserve reference images from request
  if (request.referenceImage) script.referenceImage = request.referenceImage;
  if (request.referenceImages?.length) script.referenceImages = request.referenceImages;
  if (request.controlMode) script.controlMode = request.controlMode;

  task.script = script;
  task.progress = 30;

  // Script validation + repair
  let validation = validateScript(script, {
    contentType: request.contentType,
    narrativeOutline,
  });

  const actionableWarnings = validation.warnings.filter(
    w => w.severity === "critical" || w.severity === "warning"
  );
  if (actionableWarnings.length > 0) {
    let repairRounds = 0;
    let currentWarnings = actionableWarnings;

    while (currentWarnings.length > 0 && repairRounds < 2) {
      repairRounds++;
      try {
        task.streamText = `正在自动修复脚本（第${repairRounds}轮，${currentWarnings.length}个问题）...`;
        notifyListeners(task);

        const repaired = await repairScript(script, currentWarnings, request.llmConfig, {
          contentType: request.contentType,
          narrativeOutline,
        });
        if (!repaired) break;

        script = repaired;
        validation = validateScript(script, { contentType: request.contentType, narrativeOutline });
        currentWarnings = validation.warnings.filter(
          w => w.severity === "critical" || w.severity === "warning"
        );
      } catch {
        break;
      }
    }

    if (repairRounds > 0) {
      task.scriptRepairRounds = repairRounds;
    }
  }

  task.scriptValidation = validation;
  applyCanonicalCharacterDesc(script);

  // Accuracy claim review + repair
  if (factPack && (request.contentType === "science" || request.contentType === "wikipedia")) {
    let accuracyReview = reviewPanelClaims(script, factPack);
    let accuracyRepairRounds = 0;

    while (accuracyReview.status === "repair_required" && accuracyRepairRounds < 2) {
      accuracyRepairRounds++;
      const repaired = await repairAccuracyIssues(script, accuracyReview, factPack, request.llmConfig);
      if (!repaired) break;
      script = repaired;
      task.script = script;
      accuracyReview = reviewPanelClaims(script, factPack);
    }

    task.accuracyReview = accuracyReview;

    if (accuracyReview.status === "blocked") {
      throw new Error("高风险事实冲突，脚本未通过准确性校验");
    }
  }

  task.script = script;
  return { script, character };
}
```

- [ ] **Step 4: Extract image generation phase**

Move `runGenerationPipeline` image generation loop into `phases/imageGen.ts`. This contains the concurrent image generation with retry logic. Copy the full implementation from `taskLifecycle.ts` lines ~830-1000 (the `runGenerationPipeline` function's image generation section).

```typescript
// src/lib/client/phases/imageGen.ts
import { GenerateTask, ComicScript, ComicPanel, PartialImageGenConfig } from "@/lib/types";
import { getImageAdapter } from "@/lib/imageGen";
import { withConcurrency } from "@/lib/concurrency";
import { withRetry } from "@/lib/retryQueue";
import { urlToBase64 } from "@/lib/utils";
import { getStyleModifier, getStyleNegativePrompt } from "@/lib/config/styles";
import {
  saveTask, getTask, notifyListeners, pushImageVersion,
  abortControllers, buildEnhancedPromptWithLog, mergeReferenceImage,
  adaptPromptForRetry, saveImageToFileSystem,
} from "./shared";
import { saveTaskThrottled, flushThrottledSave, cleanupTaskState } from "../eventBus";
import { abortKey } from "../abortManager";

/**
 * Run concurrent image generation for all pending panels.
 * Handles retry logic, prompt enhancement, and file system persistence.
 */
export async function runImageGenPhase(
  taskId: string,
  imageConfig: PartialImageGenConfig | undefined,
): Promise<void> {
  // Full implementation moved from taskLifecycle.ts runGenerationPipeline.
  // This is a direct extraction — the body is the image generation loop
  // from the original file, unchanged.
  //
  // The implementing agent should copy lines ~830-1000 from the original
  // taskLifecycle.ts (the section inside runGenerationPipeline that handles
  // image generation), adapting only the imports to use ./shared re-exports.
}
```

> **Note to implementing agent**: The image generation phase is the largest section (~170 lines). Copy it verbatim from `taskLifecycle.ts`'s `runGenerationPipeline` function, changing only imports.

- [ ] **Step 5: Extract VLM phase**

Move VLM scoring, auto-retry cycle, and related helpers into `phases/vlm.ts`:

```typescript
// src/lib/client/phases/vlm.ts
import { GenerateTask, PartialImageGenConfig, PartialLLMConfig, VisualQualityScore } from "@/lib/types";
import { evaluateVisualQuality } from "@/lib/vlmScorer";
import { shouldAutoRetry, generatePromptPatch, applyPromptPatch, buildPanelReview, buildTaskReviewStatus } from "@/lib/vlmRetry";
import { getImageAdapter } from "@/lib/imageGen";
import { withRetry } from "@/lib/retryQueue";
import { urlToBase64 } from "@/lib/utils";
import {
  saveTask, getTask, notifyListeners, pushImageVersion,
  mergeReferenceImage, saveImageToFileSystem,
} from "./shared";

// Move these functions from taskLifecycle.ts:
// - applyVisualReviewResult
// - markRetryingPanelReview
// - markFailedPanelReview
// - finalizeRetryCycleFailure
// - runAutomaticVisualRetryCycle

export function applyVisualReviewResult(task: GenerateTask, visualScore: NonNullable<GenerateTask["visualQualityScore"]>) {
  task.visualQualityScore = visualScore;
  task.panelReview = buildPanelReview(visualScore);
  task.reviewStatus = buildTaskReviewStatus(task.panelReview);
  task.lastReviewAt = visualScore.evaluatedAt;
}

// ... (copy remaining helpers verbatim from taskLifecycle.ts lines 111-339)

/**
 * Evaluate visual quality and run auto-retry cycle.
 */
export async function runVlmPhase(
  taskId: string,
  imageConfig: PartialImageGenConfig | undefined,
  vlmConfig: PartialLLMConfig,
): Promise<void> {
  const task = await getTask(taskId);
  if (!task?.script) return;

  const visualScore = await evaluateVisualQuality(task.script, vlmConfig);
  await runAutomaticVisualRetryCycle(taskId, visualScore, imageConfig, vlmConfig);
}
```

> **Note to implementing agent**: Copy `applyVisualReviewResult`, `markRetryingPanelReview`, `markFailedPanelReview`, `finalizeRetryCycleFailure`, and `runAutomaticVisualRetryCycle` verbatim from `taskLifecycle.ts` lines 111-339.

- [ ] **Step 6: Extract quality phase**

```typescript
// src/lib/client/phases/quality.ts
import { GenerateTask, PartialLLMConfig } from "@/lib/types";
import { evaluateQuality } from "@/lib/qualityScore";
import { saveTask, getTask, notifyListeners } from "./shared";

/**
 * Evaluate text quality score for the completed task.
 */
export async function runQualityPhase(
  taskId: string,
  llmConfig?: PartialLLMConfig,
): Promise<void> {
  const task = await getTask(taskId);
  if (!task?.script) return;

  try {
    const score = await evaluateQuality(task.script, llmConfig);
    task.qualityScore = score;
    task.updatedAt = new Date();
    await saveTask(task);
    notifyListeners(task);
  } catch (err) {
    console.warn("[QualityScore] Evaluation failed:", err);
  }
}
```

- [ ] **Step 7: Rewrite `taskLifecycle.ts` as orchestrator**

Replace the body of `taskLifecycle.ts` with imports from phase modules. Keep all existing exports with the same signatures — the file becomes a thin orchestration layer:

```typescript
// src/lib/client/taskLifecycle.ts (rewritten as orchestrator)
import { GenerateRequest, GenerateTask } from "@/lib/types";
import { QUALITY_PRESETS } from "@/lib/config/quality";
import { getStoredRequestConfigs } from "@/hooks/useAPIConfig";
import { saveTask, getTask, notifyListeners, generateId, abortControllers } from "./phases/shared";
import { runResearchPhase } from "./phases/research";
import { runScriptPhase } from "./phases/script";
import { runImageGenPhase } from "./phases/imageGen";
import { runVlmPhase } from "./phases/vlm";
import { runQualityPhase } from "./phases/quality";
import { cleanupTaskState } from "./eventBus";

// Re-export phase-level functions for stage-level restart (Phase 4 feature)
export { runResearchPhase, runScriptPhase, runImageGenPhase, runVlmPhase, runQualityPhase };

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
  processScripting(taskId, request).catch(console.error);
  return taskId;
}

async function processScripting(taskId: string, request: GenerateRequest) {
  const controller = new AbortController();
  abortControllers.set(`${taskId}:scripting`, controller);

  let task = await getTask(taskId);
  if (!task) { abortControllers.delete(`${taskId}:scripting`); return; }

  try {
    task.status = "scripting";
    task.progress = 5;
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

    // Phase 0/0.5/0.7: Research
    const research = await runResearchPhase(task, request);
    task.factPack = research.factPack;
    task.researchBrief = research.researchBrief;
    task.narrativeOutline = research.narrativeOutline;

    // Phase 1: Script
    const { script, character } = await runScriptPhase(
      task, request, research.enhancedTopic,
      research.narrativeOutline, research.factPack,
      controller.signal,
    );

    if (task.accuracyReview?.status === "blocked") {
      task.status = "failed";
      task.error = "高风险事实冲突，脚本未通过准确性校验";
      task.accuracyErrorSummary = { /* ... existing logic ... */ };
      await saveTask(task);
      notifyListeners(task);
      return;
    }

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

// Keep existing runGenerationPipeline, regenerateScript, etc.
// but delegate to phase modules internally.
// Copy signatures exactly from original file.
```

- [ ] **Step 8: Run tests to verify zero behavior change**

Run: `pnpm test`
Expected: All 31 existing test files pass. The `taskLifecycle.test.ts` tests pass because public API is identical.

- [ ] **Step 9: Commit**

```bash
git add src/lib/client/phases/ src/lib/client/taskLifecycle.ts
git commit -m "refactor: split taskLifecycle.ts into phase modules

Extract research, script, imageGen, vlm, quality phases into
separate modules under src/lib/client/phases/. Main file becomes
thin orchestrator. Zero behavior change — all existing tests pass."
```

---

### Task 1.2: Split `characters/page.tsx` into components

**Files:**
- Create: `src/components/characters/CharacterDialog.tsx`
- Create: `src/components/characters/CharacterList.tsx`
- Create: `src/components/characters/CharacterVLMPanel.tsx`
- Create: `src/hooks/useCharacterForm.ts`
- Modify: `src/app/characters/page.tsx`

- [ ] **Step 1: Read the full `characters/page.tsx`**

Read the entire file to identify component boundaries. Key sections to extract:
- `CharacterDialog` function component (~800 lines, starting around line 106)
- Character list rendering logic
- VLM scoring UI within the dialog
- Form state management into a custom hook

- [ ] **Step 2: Extract `useCharacterForm` hook**

Move all form state (`form`, `tagInput`, `entries`, `avatarIndex`, `aiGenerating`, `vlmScore`, `vlmLoading`, etc.) and their handlers into `src/hooks/useCharacterForm.ts`. The hook should accept an optional `Character` for edit mode and return all state + handlers.

- [ ] **Step 3: Extract `CharacterVLMPanel`**

Move VLM scoring UI (score display, retry button, loading state) into `src/components/characters/CharacterVLMPanel.tsx`. Props: `vlmScore`, `vlmLoading`, `vlmError`, `vlmRetrying`, `onEvaluate`, `onRetry`.

- [ ] **Step 4: Extract `CharacterDialog`**

Move the dialog component into `src/components/characters/CharacterDialog.tsx`. It should import `useCharacterForm` and `CharacterVLMPanel`. Props: `character?`, `onSave`, `onClose`.

- [ ] **Step 5: Extract `CharacterList`**

Move the character card grid rendering into `src/components/characters/CharacterList.tsx`. Props: `characters`, `onEdit`, `onDelete`, `onSelect`.

- [ ] **Step 6: Rewrite `characters/page.tsx` as composition root**

The page component becomes ~100-150 lines: data fetching, state for dialog open/close, and composition of `CharacterList` + `CharacterDialog`.

- [ ] **Step 7: Run `pnpm test` and manually verify `/characters` page**

Expected: All tests pass, characters page renders identically.

- [ ] **Step 8: Commit**

```bash
git add src/components/characters/ src/hooks/useCharacterForm.ts src/app/characters/page.tsx
git commit -m "refactor: split characters page into focused components

Extract CharacterDialog, CharacterList, CharacterVLMPanel components
and useCharacterForm hook. Page component reduced from 2102 to ~150 lines."
```

---

### Task 1.3: Add tests for `llm.ts`

**Files:**
- Create: `src/__tests__/llm.test.ts`

- [ ] **Step 1: Write tests for `callLLM` with mocked fetch**

```typescript
// src/__tests__/llm.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

// Must import after mocking fetch
const { callLLM } = await import("@/lib/llm");

describe("callLLM", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("routes to OpenAI-compatible endpoint via /api/llm proxy", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: "test response" } }],
      }),
    });

    const result = await callLLM("test prompt", {
      apiUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      model: "gpt-4o",
      provider: "openai-compatible",
    });

    expect(result).toBe("test response");
    expect(fetchMock).toHaveBeenCalledWith("/api/llm", expect.objectContaining({
      method: "POST",
    }));
  });

  it("throws on missing apiUrl", async () => {
    await expect(callLLM("test", {})).rejects.toThrow("未配置 LLM API");
  });

  it("throws descriptive error on 4xx responses", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });

    await expect(
      callLLM("test", { apiUrl: "https://api.test.com/v1", apiKey: "bad" })
    ).rejects.toThrow("LLM API 错误 (401)");
  });

  it("routes to Anthropic handler when provider is anthropic", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        content: [{ type: "text", text: "claude response" }],
      }),
    });

    const result = await callLLM("test", {
      apiUrl: "https://api.anthropic.com",
      apiKey: "sk-ant-test",
      model: "claude-3-sonnet",
      provider: "anthropic",
    });

    expect(result).toBe("claude response");
  });
});
```

- [ ] **Step 2: Write tests for script generation parsing**

Test `generateScript` with mocked LLM responses, verifying JSON parsing of comic scripts.

- [ ] **Step 3: Run tests**

Run: `pnpm test src/__tests__/llm.test.ts`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/llm.test.ts
git commit -m "test: add unit tests for llm.ts core functions"
```

---

### Task 1.4: Add tests for `series.ts`

**Files:**
- Create: `src/__tests__/series.test.ts`

- [ ] **Step 1: Write tests for series CRUD and context generation**

```typescript
// src/__tests__/series.test.ts
import { describe, it, expect } from "vitest";
import { createSeries, addEpisode, updateSeriesCover, getSeriesContinuationContext } from "@/lib/series";

describe("createSeries", () => {
  it("creates a series with correct defaults", () => {
    const s = createSeries("Test Series", "science", "flat", "A test series");
    expect(s.id).toMatch(/^series_/);
    expect(s.title).toBe("Test Series");
    expect(s.contentType).toBe("science");
    expect(s.style).toBe("flat");
    expect(s.description).toBe("A test series");
    expect(s.episodes).toEqual([]);
    expect(s.seed).toBeTypeOf("number");
    expect(s.seed).toBeGreaterThanOrEqual(0);
  });
});

describe("addEpisode", () => {
  it("appends episode with correct episodeNumber", () => {
    const s = createSeries("S", "science", "flat");
    const s2 = addEpisode(s, "task_1", "Episode 1");
    expect(s2.episodes).toHaveLength(1);
    expect(s2.episodes[0].episodeNumber).toBe(1);
    expect(s2.episodes[0].taskId).toBe("task_1");
    expect(s2.episodes[0].status).toBe("draft");

    const s3 = addEpisode(s2, "task_2", "Episode 2");
    expect(s3.episodes).toHaveLength(2);
    expect(s3.episodes[1].episodeNumber).toBe(2);
  });

  it("does not mutate original series", () => {
    const s = createSeries("S", "science", "flat");
    addEpisode(s, "task_1", "E1");
    expect(s.episodes).toHaveLength(0);
  });
});

describe("updateSeriesCover", () => {
  it("sets coverUrl and updates timestamp", () => {
    const s = createSeries("S", "science", "flat");
    const s2 = updateSeriesCover(s, "data:image/png;base64,abc");
    expect(s2.coverUrl).toBe("data:image/png;base64,abc");
    expect(s2.updatedAt).not.toBe(s.updatedAt);
  });
});

describe("getSeriesContinuationContext", () => {
  it("includes episode number and series title", () => {
    const s = createSeries("My Series", "science", "flat", "About science");
    const ctx = getSeriesContinuationContext(s);
    expect(ctx).toContain("episode 1");
    expect(ctx).toContain("My Series");
    expect(ctx).toContain("About science");
  });

  it("includes previous ending when provided", () => {
    const s = addEpisode(createSeries("S", "science", "flat"), "t1", "E1");
    const ctx = getSeriesContinuationContext(s, "The hero discovered a clue.");
    expect(ctx).toContain("Previous episode ended with");
    expect(ctx).toContain("The hero discovered a clue.");
    expect(ctx).toContain("Continue the story naturally");
  });

  it("includes character description when set", () => {
    const s = createSeries("S", "science", "flat");
    s.characterDescription = "A young scientist named Ada";
    const ctx = getSeriesContinuationContext(s);
    expect(ctx).toContain("A young scientist named Ada");
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm test src/__tests__/series.test.ts`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/series.test.ts
git commit -m "test: add unit tests for series.ts"
```

---

### Task 1.5: Result page progressive disclosure

**Files:**
- Create: `src/components/result/CompositeScore.tsx`
- Create: `src/components/result/DetailTabs.tsx`
- Create: `src/components/result/StickyActionBar.tsx`
- Modify: `src/app/result/[id]/page.tsx`

- [ ] **Step 1: Create `CompositeScore` component**

Computes and displays a single weighted score from quality, accuracy, and VLM scores:

```typescript
// src/components/result/CompositeScore.tsx
"use client";

import { GenerateTask } from "@/lib/types";

interface Props {
  task: GenerateTask;
}

/** Weighted composite: quality 0.4 + accuracy 0.3 + vlm 0.3. Missing components redistribute. */
export function computeCompositeScore(task: GenerateTask): number | null {
  const components: { score: number; weight: number }[] = [];

  if (task.qualityScore) {
    const qs = task.qualityScore;
    const avg = (qs.knowledge + qs.visualConsistency + qs.narrativeCoherence + qs.compositionDiversity) / 4;
    components.push({ score: avg, weight: 0.4 });
  }

  if (task.accuracyReview && task.accuracyReview.overallScore != null) {
    components.push({ score: task.accuracyReview.overallScore, weight: 0.3 });
  }

  if (task.visualQualityScore) {
    components.push({ score: task.visualQualityScore.overall, weight: 0.3 });
  }

  if (components.length === 0) return null;

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  return components.reduce((sum, c) => sum + c.score * (c.weight / totalWeight), 0);
}

export function CompositeScore({ task }: Props) {
  const score = computeCompositeScore(task);
  if (score === null) return null;

  const rounded = Math.round(score * 10) / 10;
  const filled = Math.round(score);
  const color = score >= 7 ? "text-green-600" : score >= 5 ? "text-amber-600" : "text-red-600";

  // Count issues
  const accuracyIssues = task.accuracyReview?.panels?.filter(
    p => p.claims?.some(c => c.status === "mismatched")
  ).length ?? 0;
  const vlmPassed = task.visualQualityScore ? task.visualQualityScore.overall >= 6 : null;

  return (
    <div className="flex items-center justify-center gap-3 py-2">
      <span className={`text-lg font-bold ${color}`}>{rounded}/10</span>
      <div className="flex gap-0.5">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={`w-2 h-2 rounded-full ${i < filled ? "bg-current " + color : "bg-muted"}`} />
        ))}
      </div>
      <div className="flex gap-2 text-xs text-muted-foreground">
        {accuracyIssues > 0 && (
          <span className="text-amber-600">⚠ {accuracyIssues} 条准确性问题</span>
        )}
        {vlmPassed !== null && (
          <span className={vlmPassed ? "text-green-600" : "text-amber-600"}>
            {vlmPassed ? "✓ VLM 通过" : "⚠ VLM 需注意"}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `DetailTabs` component**

Wraps Quality, Accuracy, VLM Diagnosis, and Script Validation panels in a tab interface:

```typescript
// src/components/result/DetailTabs.tsx
"use client";

import { useState, ReactNode } from "react";

interface Tab {
  id: string;
  label: string;
  badge?: number;
  content: ReactNode;
  visible: boolean;
}

interface Props {
  tabs: Tab[];
}

export function DetailTabs({ tabs }: Props) {
  const visibleTabs = tabs.filter(t => t.visible);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  if (visibleTabs.length === 0) return null;

  return (
    <div className="border rounded-xl overflow-hidden no-print">
      {/* Tab bar */}
      <div className="flex border-b bg-muted/30">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(activeTab === tab.id ? null : tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              activeTab === tab.id
                ? "text-foreground bg-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.badge != null && tab.badge > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full bg-red-500 text-white font-medium">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab && (
        <div className="p-4">
          {visibleTabs.find(t => t.id === activeTab)?.content}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `StickyActionBar` component**

Fixed bottom action bar with Export, Share, Edit Script, Regenerate:

```typescript
// src/components/result/StickyActionBar.tsx
"use client";

import { GenerateTask } from "@/lib/types";

interface Props {
  task: GenerateTask;
  onExportMarkdown: () => void;
  onRegenerateScript: () => void;
  generatingAll: boolean;
}

export function StickyActionBar({ task, onExportMarkdown, onRegenerateScript, generatingAll }: Props) {
  const isCompleted = task.status === "completed";
  const isScriptReady = task.status === "script_ready";

  if (!isCompleted && !isScriptReady) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t z-50 no-print">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-center gap-3">
        {isCompleted && (
          <button
            onClick={onExportMarkdown}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors"
          >
            导出 ▼
          </button>
        )}
        <button
          onClick={onRegenerateScript}
          disabled={generatingAll}
          className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
        >
          重新生成
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Refactor `result/[id]/page.tsx` to use new components**

Replace the flat panel layout with:
1. `CompositeScore` after the title section
2. `DetailTabs` wrapping existing QualityScorePanel, AccuracySummary, ScriptValidationPanel
3. `StickyActionBar` at the bottom
4. Remove scattered action buttons

Key changes in the result page:
- Move `QualityScorePanel`, `AccuracySummary`, `ScriptValidationPanel` into `DetailTabs` as tab content
- Add `CompositeScore` between the title and the tab bar
- Hide tabs that have no data (e.g., no accuracy tab in fast mode)
- Add badge counts for tabs with issues
- Add `pb-20` to main container to account for sticky bar height

- [ ] **Step 5: Test manually**

Navigate to `/result/[id]` with a completed task. Verify:
- Composite score displays correctly
- Tabs show/hide based on available data
- Tab badges show issue counts
- Sticky action bar is visible at bottom

- [ ] **Step 6: Run `pnpm test`**

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/result/CompositeScore.tsx src/components/result/DetailTabs.tsx \
  src/components/result/StickyActionBar.tsx src/app/result/\\[id\\]/page.tsx
git commit -m "feat: add progressive disclosure to result page

Composite score bar, tabbed detail panels with badge counts,
and sticky bottom action bar. Reduces information overload by
hiding details until user expands a tab."
```

---

## Phase 2 — Character System Core

### Task 2.1: Character relation data model + SQLite migration

**Files:**
- Modify: `src/lib/types.ts` (add new types)
- Modify: `src/lib/server/db.ts` (add table + CRUD)
- Create: `src/__tests__/characterRelations.test.ts`

- [ ] **Step 1: Add types to `types.ts`**

Append after the existing `Character` type:

```typescript
// --- Character Relations ---

export type RelationType = "friend" | "rival" | "mentor" | "lover" | "family" | "ally" | "enemy";

export interface CharacterRelation {
  id: string;
  fromId: string;
  toId: string;
  type: RelationType;
  label: string;
  strength: number; // 0-1
  bidirectional: boolean;
  evolution: RelationEvent[];
  createdAt: number;
  updatedAt: number;
}

export interface RelationEvent {
  episodeNumber: number;
  change: string;
  newStrength: number;
  newType?: RelationType;
}

// --- Character Personality ---

export interface PersonalityTrait {
  dimension: string;
  value: number; // -1 to 1
  label: string;
}

export interface EmotionalState {
  primary: string;
  intensity: number; // 0-1
  trigger?: string;
}

export interface CharacterArc {
  seriesId: string;
  startState: string;
  endState?: string;
  currentState?: string;
  turningPoints: { episodeNumber: number; event: string; stateAfter: string }[];
}

export interface CharacterPersonality {
  traits: PersonalityTrait[];
  speechStyle: string;
  emotionalState: EmotionalState;
  arc?: CharacterArc;
}
```

Also add `personality?: CharacterPersonality` to the existing `Character` interface.

- [ ] **Step 2: Add SQLite table and CRUD to `db.ts`**

Add to the `db.exec()` block:

```sql
CREATE TABLE IF NOT EXISTS character_relations (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  type TEXT NOT NULL,
  label TEXT DEFAULT '',
  strength REAL DEFAULT 0.5,
  bidirectional INTEGER DEFAULT 1,
  evolution TEXT DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_relations_from ON character_relations(from_id);
CREATE INDEX IF NOT EXISTS idx_relations_to ON character_relations(to_id);
```

Add column migration for `characters` table:

```typescript
runAddColumnMigration("characters", "personality TEXT");
```

Add CRUD functions:

```typescript
export function upsertRelation(r: CharacterRelation): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO character_relations
    (id, from_id, to_id, type, label, strength, bidirectional, evolution, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(r.id, r.fromId, r.toId, r.type, r.label, r.strength,
    r.bidirectional ? 1 : 0, JSON.stringify(r.evolution), r.createdAt, r.updatedAt);
}

export function getRelationsForCharacter(charId: string): CharacterRelation[] {
  const rows = db.prepare(
    "SELECT * FROM character_relations WHERE from_id = ? OR to_id = ?"
  ).all(charId, charId) as any[];
  return rows.map(rowToRelation);
}

export function getAllRelations(): CharacterRelation[] {
  const rows = db.prepare("SELECT * FROM character_relations").all() as any[];
  return rows.map(rowToRelation);
}

export function deleteRelation(id: string): boolean {
  return db.prepare("DELETE FROM character_relations WHERE id = ?").run(id).changes > 0;
}

export function deleteRelationsForCharacter(charId: string): number {
  return db.prepare(
    "DELETE FROM character_relations WHERE from_id = ? OR to_id = ?"
  ).run(charId, charId).changes;
}

function rowToRelation(row: any): CharacterRelation {
  return {
    id: row.id,
    fromId: row.from_id,
    toId: row.to_id,
    type: row.type,
    label: row.label || "",
    strength: row.strength ?? 0.5,
    bidirectional: row.bidirectional === 1,
    evolution: JSON.parse(row.evolution || "[]"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

- [ ] **Step 3: Add API routes for relations**

Create `src/app/api/relations/route.ts` (GET all, POST create) and `src/app/api/relations/[id]/route.ts` (GET, PUT, DELETE).

- [ ] **Step 4: Write tests**

```typescript
// src/__tests__/characterRelations.test.ts
import { describe, it, expect } from "vitest";
import type { CharacterRelation } from "@/lib/types";

describe("CharacterRelation type", () => {
  it("has correct shape", () => {
    const r: CharacterRelation = {
      id: "rel_1",
      fromId: "char_a",
      toId: "char_b",
      type: "friend",
      label: "青梅竹马",
      strength: 0.8,
      bidirectional: true,
      evolution: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    expect(r.type).toBe("friend");
    expect(r.strength).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 5: Run tests**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/server/db.ts src/app/api/relations/ src/__tests__/characterRelations.test.ts
git commit -m "feat: add character relation data model and SQLite CRUD

New character_relations table, personality column on characters,
API routes for relation management, and type definitions for
RelationType, CharacterPersonality, CharacterArc."
```

---

### Task 2.2: Relationship graph UI with d3-force

**Files:**
- Create: `src/components/characters/RelationGraph.tsx`
- Create: `src/components/characters/RelationEdge.tsx`
- Create: `src/components/characters/CharacterNode.tsx`
- Create: `src/components/characters/RelationDetailPanel.tsx`
- Create: `src/app/characters/relations/page.tsx`
- Create: `src/hooks/useRelations.ts`

- [ ] **Step 1: Install d3-force**

Run: `pnpm add d3-force d3-zoom d3-selection`
Run: `pnpm add -D @types/d3-force @types/d3-zoom @types/d3-selection`

- [ ] **Step 2: Create `useRelations` hook**

```typescript
// src/hooks/useRelations.ts
"use client";

import { useState, useEffect, useCallback } from "react";
import type { Character, CharacterRelation } from "@/lib/types";

export function useRelations() {
  const [relations, setRelations] = useState<CharacterRelation[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [relRes, charRes] = await Promise.all([
        fetch("/api/relations"),
        fetch("/api/characters"),
      ]);
      if (relRes.ok) setRelations(await relRes.json());
      if (charRes.ok) {
        const data = await charRes.json();
        setCharacters(data.characters || data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addRelation = useCallback(async (rel: Omit<CharacterRelation, "id" | "createdAt" | "updatedAt">) => {
    const res = await fetch("/api/relations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rel),
    });
    if (res.ok) await load();
  }, [load]);

  const deleteRelation = useCallback(async (id: string) => {
    await fetch(`/api/relations/${id}`, { method: "DELETE" });
    await load();
  }, [load]);

  return { relations, characters, loading, addRelation, deleteRelation, reload: load };
}
```

- [ ] **Step 3: Create `CharacterNode` component**

SVG group rendering avatar circle + name label for d3 graph.

- [ ] **Step 4: Create `RelationEdge` component**

SVG line with color-coded relation type and width based on strength.

Color map:
```typescript
const RELATION_COLORS: Record<string, string> = {
  friend: "#3b82f6",   // blue
  rival: "#ef4444",    // red
  mentor: "#eab308",   // gold
  lover: "#ec4899",    // pink
  family: "#22c55e",   // green
  ally: "#14b8a6",     // teal
  enemy: "#991b1b",    // dark red
};
```

- [ ] **Step 5: Create `RelationGraph` main component**

Uses `d3-force` simulation with `forceLink`, `forceManyBody`, `forceCenter`. Renders in an SVG canvas. Handles:
- Node drag (pauses simulation)
- Zoom/pan via `d3-zoom`
- Click node to highlight neighbors
- Click edge to open detail panel

- [ ] **Step 6: Create `RelationDetailPanel`**

Slide-out panel showing relation details (type, label, strength slider, evolution history). Edit and delete buttons.

- [ ] **Step 7: Create `/characters/relations` page**

```typescript
// src/app/characters/relations/page.tsx
"use client";

import { useRelations } from "@/hooks/useRelations";
import { RelationGraph } from "@/components/characters/RelationGraph";

export default function RelationsPage() {
  const { relations, characters, loading, addRelation, deleteRelation } = useRelations();

  if (loading) return <div className="flex justify-center p-8">加载中...</div>;

  return (
    <div className="h-[calc(100vh-4rem)]">
      <RelationGraph
        characters={characters}
        relations={relations}
        onAddRelation={addRelation}
        onDeleteRelation={deleteRelation}
      />
    </div>
  );
}
```

- [ ] **Step 8: Test manually, then commit**

```bash
git add src/components/characters/Relation*.tsx src/components/characters/CharacterNode.tsx \
  src/hooks/useRelations.ts src/app/characters/relations/
git commit -m "feat: add Obsidian-style character relationship graph

d3-force graph with color-coded relation edges, node drag,
zoom/pan, detail panel, and full-page /characters/relations route."
```

---

### Task 2.3: Multi-character prompt orchestration

**Files:**
- Modify: `src/lib/client/phases/script.ts`
- Modify: `src/lib/contentRegistry.ts`
- Modify: `src/lib/types.ts` (add `appearingCharacters` to `ComicPanel`)
- Create: `src/lib/characterContext.ts`

- [ ] **Step 1: Create `characterContext.ts`**

Builds the character + relationship context block for prompt injection:

```typescript
// src/lib/characterContext.ts
import { Character, CharacterRelation, CharacterPersonality } from "./types";

export interface CharacterContextBlock {
  text: string;
  characterNames: string[];
}

/**
 * Build a prompt context block describing characters and their relationships.
 */
export function buildCharacterContext(
  characters: Character[],
  relations: CharacterRelation[],
  seriesContext?: { episodeNumber: number; seriesTitle: string; previousRecap?: string },
): CharacterContextBlock {
  if (characters.length === 0) return { text: "", characterNames: [] };

  const lines: string[] = ["CHARACTERS IN THIS STORY:"];

  for (const char of characters) {
    const personality = char.personality;
    let desc = `- ${char.name}: ${char.appearance}`;
    if (personality) {
      if (personality.speechStyle) desc += `. Speech style: ${personality.speechStyle}`;
      if (personality.emotionalState) desc += `. Current mood: ${personality.emotionalState.primary}`;
    }
    lines.push(desc);
  }

  // Relationships
  const charMap = new Map(characters.map(c => [c.id, c]));
  const relevantRelations = relations.filter(
    r => charMap.has(r.fromId) && charMap.has(r.toId)
  );

  if (relevantRelations.length > 0) {
    lines.push("");
    lines.push("CHARACTER RELATIONSHIPS:");
    for (const rel of relevantRelations) {
      const from = charMap.get(rel.fromId)!;
      const to = charMap.get(rel.toId)!;
      lines.push(`- ${from.name} and ${to.name}: ${rel.label || rel.type} (${rel.type})`);
    }
  }

  // Series continuity
  if (seriesContext) {
    lines.push("");
    lines.push("STORY CONTINUITY:");
    lines.push(`- Episode ${seriesContext.episodeNumber} of "${seriesContext.seriesTitle}"`);
    if (seriesContext.previousRecap) {
      lines.push(`- ${seriesContext.previousRecap}`);
    }
  }

  return {
    text: lines.join("\n"),
    characterNames: characters.map(c => c.name),
  };
}

/**
 * Infer which characters appear in a panel based on scene/dialogue content.
 */
export function inferAppearingCharacters(
  scene: string,
  dialogue: string,
  characterNames: string[],
): string[] {
  const combined = `${scene} ${dialogue}`.toLowerCase();
  return characterNames.filter(name => combined.toLowerCase().includes(name.toLowerCase()));
}
```

- [ ] **Step 2: Add `appearingCharacters` to `ComicPanel` in types.ts**

```typescript
// Add to ComicPanel interface:
/** Characters appearing in this panel (inferred or user-edited) */
appearingCharacters?: string[];
```

- [ ] **Step 3: Modify `phases/script.ts` to load all characters and inject context**

Replace the single-character lookup with loading all `characterIds`, fetching their relations, and injecting the context block into the prompt.

- [ ] **Step 4: Write tests for `characterContext.ts`**

```typescript
// src/__tests__/characterContext.test.ts
import { describe, it, expect } from "vitest";
import { buildCharacterContext, inferAppearingCharacters } from "@/lib/characterContext";

describe("buildCharacterContext", () => {
  it("builds context block with characters and relations", () => {
    const chars = [
      { id: "1", name: "Alice", appearance: "blonde hair, blue eyes" },
      { id: "2", name: "Bob", appearance: "dark hair, tall" },
    ] as any[];

    const relations = [
      { fromId: "1", toId: "2", type: "friend", label: "childhood friends" },
    ] as any[];

    const ctx = buildCharacterContext(chars, relations);
    expect(ctx.text).toContain("Alice: blonde hair");
    expect(ctx.text).toContain("Bob: dark hair");
    expect(ctx.text).toContain("Alice and Bob: childhood friends");
    expect(ctx.characterNames).toEqual(["Alice", "Bob"]);
  });

  it("returns empty for no characters", () => {
    expect(buildCharacterContext([], []).text).toBe("");
  });
});

describe("inferAppearingCharacters", () => {
  it("detects character names in scene text", () => {
    const result = inferAppearingCharacters(
      "Alice walks into the lab",
      "Bob says hello",
      ["Alice", "Bob", "Carol"],
    );
    expect(result).toEqual(["Alice", "Bob"]);
  });
});
```

- [ ] **Step 5: Run tests and commit**

```bash
git add src/lib/characterContext.ts src/__tests__/characterContext.test.ts \
  src/lib/types.ts src/lib/client/phases/script.ts
git commit -m "feat: multi-character prompt orchestration

Load all selected characters and their relations, inject context
block into script generation prompts, infer appearing characters
per panel from scene/dialogue content."
```

---

### Task 2.4: Split `downloadUtils.ts` and `llm.ts`

**Files:**
- Create: `src/lib/export/shared.ts`
- Create: `src/lib/export/pdf.ts`
- Create: `src/lib/export/zip.ts`
- Create: `src/lib/export/xhs.ts`
- Create: `src/lib/export/seedance.ts`
- Create: `src/lib/export/markdown.ts`
- Create: `src/lib/export/image.ts`
- Modify: `src/lib/downloadUtils.ts` (re-export hub)
- Create: `src/lib/llm/client.ts`
- Create: `src/lib/llm/parsers.ts`
- Create: `src/lib/llm/characterGen.ts`
- Modify: `src/lib/llm.ts` (re-export hub)

- [ ] **Step 1: Split `downloadUtils.ts` by export format**

Move each `download*` function family into its format-specific file. Keep shared helpers (watermark, loadImage, triggerBlobDownload, etc.) in `export/shared.ts`.

Rewrite `downloadUtils.ts` as a re-export hub:
```typescript
// src/lib/downloadUtils.ts (re-export hub)
export { getWatermarkText, setWatermarkText } from "./export/shared";
export { downloadSingleImage, downloadComicAsImage, generateComicImageBlob, copyComicImageToClipboard, shareComic } from "./export/image";
export { downloadAsZip } from "./export/zip";
export { downloadAsPdf } from "./export/pdf";
export { downloadForXiaohongshu, downloadForXiaohongshuSingle, downloadForXiaohongshuPages } from "./export/xhs";
export type { XHSExportMode } from "./export/xhs";
export { downloadForSeedanceJSON, downloadForSeedanceText, downloadForSeedanceZip, buildSeedanceData } from "./export/seedance";
export type { SeedanceSegment, SeedanceExportData } from "./export/seedance";
export { downloadMarkdownWithImages } from "./export/markdown";
export { downloadTextFile } from "./export/shared";
```

- [ ] **Step 2: Split `llm.ts` into client/parsers/characterGen**

- `llm/client.ts`: `callLLM`, `callOpenAICompatible`, `callAnthropic`, `callLLMStream`, `getLLMConfig`
- `llm/parsers.ts`: `parseScriptResponse` helpers, JSON extraction
- `llm/characterGen.ts`: `generateCharacterProfile`, `generateCharacterReferencePrompt`

Rewrite `llm.ts` as re-export hub.

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: All tests pass (imports unchanged via re-exports).

- [ ] **Step 4: Commit**

```bash
git add src/lib/export/ src/lib/downloadUtils.ts src/lib/llm/ src/lib/llm.ts
git commit -m "refactor: split downloadUtils.ts and llm.ts into focused modules

downloadUtils.ts -> 7 format modules under export/.
llm.ts -> 3 modules under llm/ (client, parsers, characterGen).
Original files become re-export hubs — zero breaking changes."
```

---

## Phase 3 — Editor + Gallery + Topics

### Task 3.1: WYSIWYG script editor

**Files:**
- Create: `src/components/editor/ScriptEditor.tsx`
- Create: `src/components/editor/PanelCard.tsx`
- Create: `src/components/editor/EditorPreview.tsx`
- Create: `src/hooks/useScriptEditor.ts`
- Modify: `src/app/result/[id]/page.tsx`

- [ ] **Step 1: Create `useScriptEditor` hook**

Manages panel list state with undo/redo (leveraging existing `useUndoRedo`), drag reorder, add/delete/duplicate:

```typescript
// src/hooks/useScriptEditor.ts
import { useState, useCallback } from "react";
import { ComicPanel, ComicScript } from "@/lib/types";
import { useUndoRedo } from "./useUndoRedo";

export function useScriptEditor(initialScript: ComicScript) {
  const { state: panels, set: setPanels, undo, redo, canUndo, canRedo } =
    useUndoRedo(initialScript.panels);

  // Store original panels for per-panel reset
  const [originals] = useState(() => new Map(
    initialScript.panels.map((p, i) => [p.id ?? i, { ...p }])
  ));

  const updatePanel = useCallback((index: number, updates: Partial<ComicPanel>) => {
    setPanels(prev => prev.map((p, i) => i === index ? { ...p, ...updates } : p));
  }, [setPanels]);

  const deletePanel = useCallback((index: number) => {
    setPanels(prev => prev.filter((_, i) => i !== index));
  }, [setPanels]);

  const duplicatePanel = useCallback((index: number) => {
    setPanels(prev => {
      const dup = { ...prev[index], id: Date.now(), status: "pending" as const, imageUrl: undefined };
      return [...prev.slice(0, index + 1), dup, ...prev.slice(index + 1)];
    });
  }, [setPanels]);

  const addPanel = useCallback(() => {
    setPanels(prev => [...prev, {
      id: Date.now(),
      scene: "",
      dialogue: "",
      imagePrompt: "",
      status: "pending" as const,
    }]);
  }, [setPanels]);

  const reorder = useCallback((fromIndex: number, toIndex: number) => {
    setPanels(prev => {
      const arr = [...prev];
      const [moved] = arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, moved);
      return arr;
    });
  }, [setPanels]);

  const resetPanel = useCallback((index: number) => {
    const panel = panels[index];
    const original = originals.get(panel.id ?? index);
    if (original) updatePanel(index, original);
  }, [panels, originals, updatePanel]);

  return {
    panels, updatePanel, deletePanel, duplicatePanel, addPanel,
    reorder, resetPanel, undo, redo, canUndo, canRedo,
  };
}
```

- [ ] **Step 2: Create `PanelCard` component**

Editable card for a single panel with scene, dialogue, imagePrompt textareas, character tags, and action buttons (duplicate, delete, reset).

- [ ] **Step 3: Create `EditorPreview` component**

Read-only comic layout preview of the current panel list — shows thumbnails + scene text in a grid.

- [ ] **Step 4: Create `ScriptEditor` component**

Two-column layout composing `PanelCard` list (left, draggable) and `EditorPreview` (right).

- [ ] **Step 5: Integrate into result page**

When `isScriptReady`, render `ScriptEditor` instead of the current `ScriptReadyBar` + `PanelGrid`. Save edits back to task on "Confirm" button.

- [ ] **Step 6: Test manually, commit**

```bash
git add src/components/editor/ src/hooks/useScriptEditor.ts src/app/result/\\[id\\]/page.tsx
git commit -m "feat: add WYSIWYG script editor for script_ready state

Two-column editor with draggable panel cards, undo/redo,
per-panel reset, add/delete/duplicate, and live preview."
```

---

### Task 3.2: Gallery upgrade (favorites, tags, multi-view)

**Files:**
- Modify: `src/lib/server/db.ts` (add columns)
- Modify: `src/lib/types.ts` (add fields)
- Modify: `src/app/gallery/page.tsx`
- Create: `src/components/gallery/GalleryFilters.tsx`
- Create: `src/components/gallery/TimelineView.tsx`
- Create: `src/components/gallery/SeriesView.tsx`

- [ ] **Step 1: Add `tags` and `favorited` columns to tasks table**

In `db.ts`, add migrations:
```typescript
runAddColumnMigration("tasks", "tags TEXT DEFAULT '[]'");
runAddColumnMigration("tasks", "favorited INTEGER DEFAULT 0");
```

Update `taskToRow` and `rowToTask` to handle new fields.

- [ ] **Step 2: Add fields to `GenerateTask` type**

```typescript
// Add to GenerateTask:
tags?: string[];
favorited?: boolean;
```

- [ ] **Step 3: Add API support for favorite/tag updates**

Modify `src/app/api/tasks/[id]/route.ts` to support PATCH with `{ tags, favorited }`.

- [ ] **Step 4: Create `GalleryFilters` component**

Combinable filters: content type, style, tags (multi-select), date range, favorites-only toggle. Search bar with fuzzy matching.

- [ ] **Step 5: Create `TimelineView` component**

Vertical scroll layout grouped by date (today, yesterday, this week, this month, older).

- [ ] **Step 6: Create `SeriesView` component**

Groups tasks by series, shows episodes in order within each series card.

- [ ] **Step 7: Refactor gallery page to use new components**

Add view toggle (Grid / Timeline / Series), integrate filters, add favorite heart icon on cards.

- [ ] **Step 8: Test and commit**

```bash
git add src/lib/server/db.ts src/lib/types.ts src/app/api/tasks/ \
  src/components/gallery/ src/app/gallery/page.tsx
git commit -m "feat: gallery upgrade with favorites, tags, and multi-view

Add favorites (heart icon), user tags, combinable filters,
fuzzy search, and three view modes: grid, timeline, series."
```

---

### Task 3.3: Topic recommendation presets ("Inspiration Square")

**Files:**
- Create: `src/lib/config/topicPresets.ts`
- Create: `src/components/InspirationSquare.tsx`
- Modify: `src/app/create/page.tsx` (or main create entry point)

- [ ] **Step 1: Create topic presets data**

```typescript
// src/lib/config/topicPresets.ts
import { ContentType } from "@/lib/types";

export interface TopicPreset {
  label: string;
  topic: string;
  category: string;
}

export const TOPIC_PRESETS: Record<ContentType, TopicPreset[]> = {
  science: [
    { label: "太阳系", topic: "太阳系的八大行星", category: "天文" },
    { label: "DNA", topic: "DNA双螺旋结构与基因遗传", category: "生物" },
    { label: "量子力学", topic: "量子力学的基本原理", category: "物理" },
    { label: "板块构造", topic: "地球板块构造与大陆漂移", category: "地理" },
    { label: "光合作用", topic: "植物光合作用的过程", category: "生物" },
    { label: "黑洞", topic: "黑洞的形成与特性", category: "天文" },
    { label: "元素周期表", topic: "化学元素周期表的发现", category: "化学" },
    { label: "人工智能", topic: "人工智能的发展历程", category: "科技" },
    // ... 50+ total
  ],
  poetry: [
    { label: "静夜思", topic: "床前明月光，疑是地上霜。举头望明月，低头思故乡。", category: "唐诗/李白" },
    { label: "春晓", topic: "春眠不觉晓，处处闻啼鸟。夜来风雨声，花落知多少。", category: "唐诗/孟浩然" },
    { label: "水调歌头", topic: "明月几时有，把酒问青天。", category: "宋词/苏轼" },
    // ... more grouped by dynasty/poet
  ],
  novel: [
    { label: "武侠", topic: "一位少年在山中偶得一本古老剑谱", category: "武侠" },
    { label: "科幻", topic: "2150年，人类在火星建立了第一座城市", category: "科幻" },
    { label: "悬疑", topic: "雨夜，一封没有署名的信出现在侦探办公室", category: "悬疑" },
    // ... more
  ],
  xiaohongshu: [
    { label: "护肤", topic: "秋冬换季护肤攻略", category: "美妆" },
    { label: "穿搭", topic: "小个子女生显高穿搭", category: "时尚" },
    { label: "美食", topic: "一人食简单晚餐食谱", category: "美食" },
    // ... more
  ],
  wikipedia: [
    { label: "相对论", topic: "Theory of Relativity", category: "物理" },
    { label: "文艺复兴", topic: "Renaissance", category: "历史" },
    { label: "人体免疫系统", topic: "Immune system", category: "生物" },
    // ... more
  ],
};
```

- [ ] **Step 2: Create `InspirationSquare` component**

Horizontal scrollable chip list per content type, with category grouping:

```typescript
// src/components/InspirationSquare.tsx
"use client";

import { useState } from "react";
import { TOPIC_PRESETS } from "@/lib/config/topicPresets";
import type { ContentType } from "@/lib/types";

interface Props {
  contentType: ContentType;
  onSelect: (topic: string) => void;
}

export function InspirationSquare({ contentType, onSelect }: Props) {
  const presets = TOPIC_PRESETS[contentType] || [];
  const categories = [...new Set(presets.map(p => p.category))];
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filtered = activeCategory
    ? presets.filter(p => p.category === activeCategory)
    : presets;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">灵感推荐</span>
        <div className="flex gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-2 py-0.5 text-[11px] rounded-full whitespace-nowrap ${
              !activeCategory ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            全部
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-2 py-0.5 text-[11px] rounded-full whitespace-nowrap ${
                activeCategory === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {filtered.slice(0, 20).map((preset, i) => (
          <button
            key={i}
            onClick={() => onSelect(preset.topic)}
            className="px-3 py-1.5 text-xs rounded-full border hover:bg-muted transition-colors whitespace-nowrap"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Integrate into create page**

Add `InspirationSquare` above each content type form. Pass `onSelect` to populate the topic field.

- [ ] **Step 4: Commit**

```bash
git add src/lib/config/topicPresets.ts src/components/InspirationSquare.tsx src/app/
git commit -m "feat: add topic recommendation presets (Inspiration Square)

Curated topic lists for all 5 content types, grouped by category.
Horizontal chip UI with category filter, click to populate topic."
```

---

### Task 3.4: Add tests for `exportImport.ts` and `imageGen/index.ts`

**Files:**
- Create: `src/__tests__/exportImport.test.ts`
- Create: `src/__tests__/imageGen.test.ts`

- [ ] **Step 1: Write exportImport tests**

Test data export/import round-trip, character export, error handling for corrupt data.

- [ ] **Step 2: Write imageGen adapter tests**

Test adapter selection logic, configuration validation, mock image generation calls.

- [ ] **Step 3: Run tests and commit**

```bash
git add src/__tests__/exportImport.test.ts src/__tests__/imageGen.test.ts
git commit -m "test: add tests for exportImport and imageGen modules"
```

---

## Phase 4 — Depth + Observability

### Task 4.1: Pipeline observability (stage trace + per-stage retry)

**Files:**
- Modify: `src/lib/types.ts` (add `PipelineStageTrace`)
- Modify: `src/lib/client/phases/*.ts` (emit trace data)
- Create: `src/components/result/PipelineTimeline.tsx`
- Modify: `src/app/result/[id]/page.tsx`

- [ ] **Step 1: Add `PipelineStageTrace` type**

```typescript
// Add to types.ts:
export interface PipelineStageTrace {
  stage: "research" | "director" | "script" | "validate" | "repair" | "accuracy" | "images" | "vlm" | "quality";
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt?: number;
  completedAt?: number;
  tokenUsage?: { prompt: number; completion: number };
  retryCount: number;
  error?: string;
}

// Add to GenerateTask:
pipelineTrace?: PipelineStageTrace[];
```

- [ ] **Step 2: Instrument phase modules to emit traces**

Each phase function records start/end times and status into `task.pipelineTrace[]`.

- [ ] **Step 3: Create `PipelineTimeline` component**

Horizontal stage indicator with status icons, elapsed time, and expandable per-stage details:

```
[Research ✓ 2.1s] → [Director ✓ 1.8s] → [Script ✓ 4.2s] → [Validate ✓ 0.1s] → [Images ◉ 3/8] → [VLM] → [Score]
```

Each stage is clickable to expand: duration, token usage, retry count, error, and "Retry" button for failed stages.

- [ ] **Step 4: Integrate into result page**

Replace existing `PipelineSummary` with `PipelineTimeline`. Show during generation (live updates) and after completion.

- [ ] **Step 5: Implement stage-level restart**

The "Retry" button on a failed stage calls the corresponding phase function directly (e.g., `runVlmPhase`), which is now independently callable thanks to Task 1.1's split.

- [ ] **Step 6: Test and commit**

```bash
git add src/lib/types.ts src/lib/client/phases/ src/components/result/PipelineTimeline.tsx \
  src/app/result/\\[id\\]/page.tsx
git commit -m "feat: add pipeline observability with stage trace and per-stage retry

Track timing, token usage, and retry counts per pipeline stage.
Visual timeline component with expandable details and retry button
for failed stages."
```

---

### Task 4.2: Character arc tracking for series

**Files:**
- Modify: `src/lib/types.ts` (already has `CharacterArc`)
- Modify: `src/lib/series.ts` (add arc tracking helpers)
- Modify: `src/lib/characterContext.ts` (inject arc state)
- Create: `src/__tests__/characterArc.test.ts`

- [ ] **Step 1: Add arc tracking helpers to `series.ts`**

```typescript
// Add to series.ts:
import { CharacterArc, CharacterPersonality } from "./types";

export function updateCharacterArc(
  personality: CharacterPersonality,
  seriesId: string,
  episodeNumber: number,
  event: string,
  stateAfter: string,
): CharacterPersonality {
  const arc: CharacterArc = personality.arc ?? {
    seriesId,
    startState: personality.emotionalState?.primary ?? "neutral",
    turningPoints: [],
  };

  return {
    ...personality,
    arc: {
      ...arc,
      currentState: stateAfter,
      turningPoints: [
        ...arc.turningPoints,
        { episodeNumber, event, stateAfter },
      ],
    },
  };
}

export function getArcSummary(arc: CharacterArc): string {
  const parts = [`Started as "${arc.startState}"`];
  for (const tp of arc.turningPoints) {
    parts.push(`Episode ${tp.episodeNumber}: ${tp.event} → "${tp.stateAfter}"`);
  }
  if (arc.currentState) parts.push(`Currently: "${arc.currentState}"`);
  return parts.join(". ");
}
```

- [ ] **Step 2: Inject arc state into characterContext.ts**

When series context is present, include arc summaries for each character.

- [ ] **Step 3: Write tests**

```typescript
// src/__tests__/characterArc.test.ts
import { describe, it, expect } from "vitest";
import { updateCharacterArc, getArcSummary } from "@/lib/series";

describe("updateCharacterArc", () => {
  it("creates new arc on first update", () => {
    const personality = { traits: [], speechStyle: "", emotionalState: { primary: "curious", intensity: 0.5 } };
    const updated = updateCharacterArc(personality as any, "s1", 1, "discovers truth", "determined");
    expect(updated.arc).toBeDefined();
    expect(updated.arc!.startState).toBe("curious");
    expect(updated.arc!.currentState).toBe("determined");
    expect(updated.arc!.turningPoints).toHaveLength(1);
  });

  it("appends to existing arc", () => {
    const personality = {
      traits: [], speechStyle: "", emotionalState: { primary: "neutral", intensity: 0.5 },
      arc: { seriesId: "s1", startState: "naive", turningPoints: [{ episodeNumber: 1, event: "first fight", stateAfter: "shaken" }] },
    };
    const updated = updateCharacterArc(personality as any, "s1", 2, "gains ally", "hopeful");
    expect(updated.arc!.turningPoints).toHaveLength(2);
    expect(updated.arc!.currentState).toBe("hopeful");
  });
});

describe("getArcSummary", () => {
  it("produces readable summary", () => {
    const arc = {
      seriesId: "s1", startState: "naive", currentState: "wise",
      turningPoints: [{ episodeNumber: 1, event: "betrayal", stateAfter: "bitter" }],
    };
    const summary = getArcSummary(arc as any);
    expect(summary).toContain("naive");
    expect(summary).toContain("betrayal");
    expect(summary).toContain("wise");
  });
});
```

- [ ] **Step 4: Run tests and commit**

```bash
git add src/lib/series.ts src/lib/characterContext.ts src/__tests__/characterArc.test.ts
git commit -m "feat: add character arc tracking for series mode

Track character development across episodes with turning points.
Inject arc summaries into prompt context for continuity."
```

---

### Task 4.3: Relation evolution timeline (series mode)

**Files:**
- Create: `src/components/characters/RelationTimelineSlider.tsx`
- Modify: `src/components/characters/RelationGraph.tsx`

- [ ] **Step 1: Create `RelationTimelineSlider`**

A range slider at the bottom of the relation graph. Moving it filters relation state to that episode number — showing only relations and strengths as they were at that point.

```typescript
// src/components/characters/RelationTimelineSlider.tsx
"use client";

import { CharacterRelation } from "@/lib/types";

interface Props {
  maxEpisode: number;
  currentEpisode: number;
  onChange: (episode: number) => void;
}

export function RelationTimelineSlider({ maxEpisode, currentEpisode, onChange }: Props) {
  if (maxEpisode <= 1) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 rounded-lg">
      <span className="text-xs text-muted-foreground whitespace-nowrap">第 {currentEpisode} 集</span>
      <input
        type="range"
        min={1}
        max={maxEpisode}
        value={currentEpisode}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1"
      />
      <span className="text-xs text-muted-foreground whitespace-nowrap">/ {maxEpisode}</span>
    </div>
  );
}

/** Filter relations to show state at a given episode */
export function filterRelationsAtEpisode(
  relations: CharacterRelation[],
  episode: number,
): CharacterRelation[] {
  return relations.map(rel => {
    // Find the latest evolution event at or before this episode
    const relevantEvents = rel.evolution.filter(e => e.episodeNumber <= episode);
    if (relevantEvents.length === 0) return rel;

    const latest = relevantEvents[relevantEvents.length - 1];
    return {
      ...rel,
      strength: latest.newStrength,
      type: latest.newType ?? rel.type,
    };
  });
}
```

- [ ] **Step 2: Integrate slider into `RelationGraph`**

Add timeline slider when a series is selected. Use `filterRelationsAtEpisode` to update the graph.

- [ ] **Step 3: Commit**

```bash
git add src/components/characters/RelationTimelineSlider.tsx src/components/characters/RelationGraph.tsx
git commit -m "feat: add relation evolution timeline slider for series mode

Scrub through episodes to see how character relationships evolved
over time. Relations update strength and type based on evolution events."
```

---

### Task 4.4: Split `QualityScorePanel.tsx`

**Files:**
- Create: `src/components/result/score/ScoreDimension.tsx`
- Create: `src/components/result/score/ScoreRadar.tsx`
- Create: `src/components/result/score/ScoreSummary.tsx`
- Create: `src/components/result/score/RetryRecommendations.tsx`
- Modify: `src/components/result/QualityScorePanel.tsx`

- [ ] **Step 1: Read `QualityScorePanel.tsx` to identify boundaries**

Identify sub-sections: dimension cards, radar chart (if any), summary text, VLM diagnosis workbench, retry recommendations.

- [ ] **Step 2: Extract sub-components**

Move each visual section into its own file under `src/components/result/score/`.

- [ ] **Step 3: Rewrite `QualityScorePanel.tsx` as composition root**

The main component becomes ~100-200 lines, composing the sub-components.

- [ ] **Step 4: Run tests**

Run: `pnpm test`
Expected: Existing VLM/quality tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/result/score/ src/components/result/QualityScorePanel.tsx
git commit -m "refactor: split QualityScorePanel into focused sub-components

Extract ScoreDimension, ScoreRadar, ScoreSummary, RetryRecommendations.
Main panel reduced from 906 to ~150 lines."
```

---

### Task 4.5: Add tests for remaining modules

**Files:**
- Create: `src/__tests__/utils.test.ts`
- Create: `src/__tests__/shareCard.test.ts`
- Create: `src/__tests__/quizGenerator.test.ts`
- Create: `src/__tests__/relatedTopics.test.ts`
- Create: `src/__tests__/aiEditor.test.ts`

- [ ] **Step 1: Write tests for each module**

Focus on exported public functions. Mock external dependencies (LLM calls, fetch).

- [ ] **Step 2: Run all tests**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/utils.test.ts src/__tests__/shareCard.test.ts \
  src/__tests__/quizGenerator.test.ts src/__tests__/relatedTopics.test.ts \
  src/__tests__/aiEditor.test.ts
git commit -m "test: add tests for utils, shareCard, quizGenerator, relatedTopics, aiEditor"
```

---

## Summary

| Phase | Tasks | Key Deliverables |
|-------|-------|------------------|
| 1 | 1.1-1.5 | taskLifecycle split, characters page split, llm/series tests, result page tabs |
| 2 | 2.1-2.4 | Relation data model, d3-force graph, multi-char prompt, downloadUtils/llm splits |
| 3 | 3.1-3.4 | WYSIWYG editor, gallery upgrade, topic presets, exportImport/imageGen tests |
| 4 | 4.1-4.5 | Pipeline timeline, character arcs, relation timeline, QualityScorePanel split, remaining tests |

Total: **17 tasks**, each independently committable.
