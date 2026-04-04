import { GenerateTask, PartialLLMConfig } from "@/lib/types";
import { evaluateQuality } from "@/lib/qualityScore";
import { evaluateVisualQuality } from "@/lib/vlmScorer";
import { getStoredRequestConfigs } from "@/hooks/useAPIConfig";
import { saveTask, getTask, notifyListeners, traceStart, traceEnd } from "./shared";
import { runAutomaticVisualRetryCycle } from "./vlm";
import type { PartialImageGenConfig } from "@/lib/types";

/**
 * Phase 3: Quality evaluation (text quality + VLM visual scoring).
 * Non-blocking — fires and forgets.
 */
export function runQualityPhase(
  taskId: string,
  llmConfig: PartialLLMConfig,
  script: GenerateTask["script"],
  imageConfig?: PartialImageGenConfig,
  qualityLevel?: string,
): void {
  if (!script) return;

  evaluateQuality(script, llmConfig)
    .then(async (quality) => {
      const freshTask = await getTask(taskId);
      if (freshTask) {
        freshTask.qualityScore = quality;
        freshTask.updatedAt = new Date();
        traceEnd(freshTask, "quality");
        await saveTask(freshTask);
        notifyListeners(freshTask);
        console.log(`[QualityGate] Score: ${quality.overall}/10, suggestions: ${quality.suggestions.length}`);
      }
    })
    .catch((err) => {
      console.warn("[QualityGate] Auto-evaluation failed (non-fatal):", err);
    });

  if (qualityLevel === "fine") {
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
