import { GenerateTask, PartialImageGenConfig, PartialLLMConfig } from "@/lib/types";
import { getImageAdapter } from "@/lib/imageGen";
import { evaluateVisualQuality } from "@/lib/vlmScorer";
import { shouldAutoRetry, generatePromptPatch, applyPromptPatch } from "@/lib/vlmRetry";
import { urlToBase64 } from "@/lib/utils";
import { withRetry } from "@/lib/retryQueue";
import {
  saveTask, getTask, notifyListeners,
  pushImageVersion, mergeReferenceImage,
  applyVisualReviewResult, markRetryingPanelReview, markFailedPanelReview, finalizeRetryCycleFailure,
  saveImageToFileSystem,
} from "./shared";
import { buildTaskReviewStatus } from "@/lib/vlmRetry";

/**
 * Run the automatic VLM visual retry cycle.
 * Evaluates visual quality, retries low-scoring panels, and re-evaluates.
 */
export async function runAutomaticVisualRetryCycle(
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
        const persisted = await saveImageToFileSystem(taskId, panelScore.panelIndex, base64, freshTask.script.title);
        const finalImageUrl = persisted?.url ?? base64;
        panel.imageUrl = finalImageUrl;
        pushImageVersion(panel, finalImageUrl);
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
