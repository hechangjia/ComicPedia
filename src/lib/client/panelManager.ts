import { ComicPanel, GenerateTask, PartialImageGenConfig, ComicScript, ZImageExtraBody } from "@/lib/types";
import { getImageAdapter } from "@/lib/imageGen";
import { urlToBase64 } from "@/lib/utils";
import { withRetry } from "@/lib/retryQueue";
import { saveTask, getTask } from "./db";
import { notifyListeners } from "./eventBus";
import { abortControllers, abortKey } from "./abortManager";

/** 每个面板最多保留的历史版本数 */
const MAX_IMAGE_VERSIONS = 10;

/**
 * 将图片推入面板版本历史。
 * 超过上限时移除最旧版本，activeVersionIndex 始终指向最新。
 */
export function pushImageVersion(panel: ComicPanel, imageUrl: string): void {
  if (!panel.imageVersions) panel.imageVersions = [];
  panel.imageVersions.push({ imageUrl, createdAt: Date.now() });
  while (panel.imageVersions.length > MAX_IMAGE_VERSIONS) {
    panel.imageVersions.shift();
  }
  panel.activeVersionIndex = panel.imageVersions.length - 1;
}

/**
 * 将参考图（panel 级优先于 script 级）合并到 imageConfig.extraBody 中。
 * 支持多参考图：多张时按面板索引轮换使用。
 */
function mergeReferenceImage(
  imageConfig: PartialImageGenConfig | undefined,
  script: ComicScript,
  panel: ComicPanel,
  panelIndex?: number,
): PartialImageGenConfig | undefined {
  const refImages = panel.referenceImages ?? script.referenceImages;
  const refImage = panel.referenceImage ?? script.referenceImage;

  let selectedImage: string | undefined;
  if (refImages && refImages.length > 0) {
    const idx = (panelIndex ?? 0) % refImages.length;
    selectedImage = refImages[idx];
  } else {
    selectedImage = refImage;
  }

  if (!selectedImage) return imageConfig;

  const merged = { ...imageConfig };
  merged.extraBody = {
    ...merged.extraBody,
    control_image: selectedImage,
    control_mode: script.controlMode ?? "HED",
  } as ZImageExtraBody;
  return merged;
}

/**
 * 构建增强 prompt：确保角色描述锚定。
 */
function buildEnhancedPrompt(
  basePrompt: string,
  panelIndex: number,
  characterDesc?: string,
): string {
  let prompt = basePrompt;
  if (characterDesc && !prompt.startsWith("[")) {
    prompt = `${characterDesc} ${prompt}`;
  }
  return prompt;
}

/**
 * 将 Base64 图片保存到文件系统（通过 API route）。
 * 非阻塞、非关键操作——失败不影响主流程。
 */
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

/**
 * 更新单个面板数据并持久化到 DB。
 * 用于用户编辑提示词、对话、场景等。
 */
export async function updatePanel(
  taskId: string,
  panelIndex: number,
  updates: Partial<Pick<ComicPanel, "scene" | "dialogue" | "imagePrompt">>,
): Promise<GenerateTask | null> {
  const task = await getTask(taskId);
  if (!task?.script) return null;

  const panel = task.script.panels[panelIndex];
  if (!panel) return null;

  if (updates.scene !== undefined) panel.scene = updates.scene;
  if (updates.dialogue !== undefined) panel.dialogue = updates.dialogue;
  if (updates.imagePrompt !== undefined) panel.imagePrompt = updates.imagePrompt;

  task.updatedAt = new Date();
  await saveTask(task);
  notifyListeners(task);

  return task;
}

/**
 * 切换面板的激活图片版本。
 */
export async function setActiveVersion(
  taskId: string,
  panelIndex: number,
  versionIndex: number,
): Promise<void> {
  const task = await getTask(taskId);
  if (!task?.script) throw new Error("任务或脚本不存在");

  const panel = task.script.panels[panelIndex];
  if (!panel) throw new Error(`面板 ${panelIndex} 不存在`);
  if (!panel.imageVersions || versionIndex < 0 || versionIndex >= panel.imageVersions.length) {
    throw new Error(`版本索引 ${versionIndex} 无效`);
  }

  panel.imageUrl = panel.imageVersions[versionIndex].imageUrl;
  panel.activeVersionIndex = versionIndex;
  task.updatedAt = new Date();
  await saveTask(task);
  notifyListeners(task);
}

/**
 * 重新生成单个面板的图片。
 */
export async function regeneratePanel(
  taskId: string,
  panelIndex: number,
  imageConfig?: PartialImageGenConfig,
): Promise<void> {
  const task = await getTask(taskId);
  if (!task?.script) throw new Error("任务或脚本不存在");

  const { script } = task;
  const panel = script.panels[panelIndex];
  if (!panel) throw new Error(`面板 ${panelIndex} 不存在`);

  // 归档旧图到版本历史
  if (panel.imageUrl && panel.imageUrl.startsWith("data:image")) {
    const lastVersion = panel.imageVersions?.[panel.imageVersions.length - 1];
    if (!lastVersion || lastVersion.imageUrl !== panel.imageUrl) {
      pushImageVersion(panel, panel.imageUrl);
    }
  }

  panel.status = "generating";
  panel.imageUrl = undefined;
  task.updatedAt = new Date();
  await saveTask(task);
  notifyListeners(task);

  const controller = new AbortController();
  abortControllers.set(abortKey(taskId, panelIndex), controller);

  try {
    const characterDesc = script.characterDescription;
    const baseSeed = script.seed;

    const prompt = buildEnhancedPrompt(panel.imagePrompt, panelIndex, characterDesc);
    const mergedConfig = mergeReferenceImage(imageConfig, script, panel, panelIndex);
    const adapter = getImageAdapter(mergedConfig);
    const panelSeed = baseSeed !== undefined ? baseSeed + panelIndex : undefined;
    const imageUrl = await withRetry(
      () => adapter.generate(prompt, script.style, panelSeed, controller.signal),
      { maxRetries: 2, baseDelay: 1000 },
      controller.signal,
    );

    // 先标记完成，异步转换 Base64
    panel.status = "completed";
    panel.imageUrl = imageUrl;

    // 后台异步转换 + 保存
    urlToBase64(imageUrl)
      .then((base64) => {
        panel.imageUrl = base64;
        pushImageVersion(panel, base64);
        saveImageToFileSystem(task.id, panelIndex, base64, script.title);
      })
      .catch((err) => {
        console.warn(`Panel ${panelIndex} Base64 conversion failed:`, err);
        pushImageVersion(panel, imageUrl);
      });
  } catch (err) {
    console.error(`Panel ${panelIndex} regeneration failed:`, err);
    panel.status = "failed";

    if (panel.imageVersions && panel.imageVersions.length > 0) {
      const lastVersion = panel.imageVersions[panel.imageVersions.length - 1];
      panel.imageUrl = lastVersion.imageUrl;
      panel.status = "completed";
    }
  }

  abortControllers.delete(abortKey(taskId, panelIndex));

  // 重新读取 task 最新状态，避免并发 regeneratePanel 之间互相覆盖
  const freshTask = await getTask(taskId);
  if (freshTask?.script) {
    const freshPanel = freshTask.script.panels[panelIndex];
    if (freshPanel) {
      freshPanel.imageUrl = panel.imageUrl;
      freshPanel.status = panel.status;
      freshPanel.imageVersions = panel.imageVersions;
      freshPanel.activeVersionIndex = panel.activeVersionIndex;
    }

    const allCompleted = freshTask.script.panels.every((p) => p.status === "completed");
    freshTask.status = allCompleted ? "completed" : "script_ready";
    freshTask.progress = allCompleted ? 100 : 30 + Math.floor(
      (freshTask.script.panels.filter((p) => p.status === "completed").length / freshTask.script.panels.length) * 70
    );
    freshTask.updatedAt = new Date();
    await saveTask(freshTask);
    notifyListeners(freshTask);
  }
}
