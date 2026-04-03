import { GenerateTask, PartialImageGenConfig } from "@/lib/types";
import { getImageAdapter } from "@/lib/imageGen";
import { urlToBase64 } from "@/lib/utils";
import { withConcurrency } from "@/lib/concurrency";
import { withRetry } from "@/lib/retryQueue";
import {
  saveTask, getTask, notifyListeners, saveTaskThrottled, flushThrottledSave, cleanupTaskState,
  abortControllers, abortKey,
  pushImageVersion,
  buildEnhancedPrompt, buildEnhancedPromptWithLog, mergeReferenceImage,
} from "./shared";
import { adaptPromptForRetry, saveImageToFileSystem } from "./shared";

/** 默认图片生成并发数 */
const IMAGE_CONCURRENCY = typeof window !== "undefined"
  ? parseInt(localStorage.getItem("image_concurrency") || "6", 10)
  : 6;

/**
 * Phase 2: Image generation for all pending panels.
 * Mutates task in place. Returns when all panels are generated.
 */
export async function runImageGenPhase(
  task: GenerateTask,
  imageConfig?: PartialImageGenConfig,
  forceAll: boolean = false,
): Promise<boolean> {
  const { script } = task;
  if (!script) throw new Error("任务或脚本不存在");

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
    abortControllers.set(abortKey(task.id, firstIdx), panelController);

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

      try {
        const base64 = await urlToBase64(imageUrl);
        firstPanel.imageUrl = base64;
        firstPanelImage = base64;
        pushImageVersion(firstPanel, base64);
        saveImageToFileSystem(task.id, firstIdx, base64, script.title);
      } catch {
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
      abortControllers.delete(abortKey(task.id, firstIdx));
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
    abortControllers.set(abortKey(task.id, panelIndex), panelController);

    try {
      const directorComp = task.narrativeOutline?.panels[panelIndex]?.suggestedComposition;
      const enhanceResult = buildEnhancedPromptWithLog(panel.imagePrompt, panelIndex, characterDesc, panel.styleOverride ?? script.style, totalPanels, directorComp);
      const prompt = enhanceResult.enhanced;
      panel.enhancementLog = enhanceResult;
      let mergedConfig = mergeReferenceImage(imageConfig, script, panel, panelIndex);

      const supportsImg2Img = mergedConfig?.endpointType === "images" || mergedConfig?.endpointType === "auto";
      if (firstPanelImage && supportsImg2Img && !panel.referenceImage && !panel.referenceImages?.length) {
        mergedConfig = {
          ...mergedConfig,
          extraBody: {
            ...mergedConfig?.extraBody,
            image: firstPanelImage,
            strength: 0.3,
          },
        };
      }

      const adapter = getImageAdapter(mergedConfig);
      const panelSeed = baseSeed !== undefined ? baseSeed + panelIndex : undefined;

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

      panel.status = "completed";
      panel.imageUrl = imageUrl;

      urlToBase64(imageUrl)
        .then((base64) => {
          panel.imageUrl = base64;
          pushImageVersion(panel, base64);
          saveImageToFileSystem(task.id, panelIndex, base64, script.title);
          notifyListeners(task);
        })
        .catch((err) => {
          console.warn(`Panel ${panelIndex} Base64 conversion failed:`, err);
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
      abortControllers.delete(abortKey(task.id, panelIndex));
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

  if (allCompleted) {
    cleanupTaskState(task.id);
  }

  return allCompleted;
}
