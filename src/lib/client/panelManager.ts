import { ComicPanel, GenerateTask, PartialImageGenConfig, ComicScript, ZImageExtraBody } from "@/lib/types";
import { getImageAdapter } from "@/lib/imageGen";
import { urlToBase64 } from "@/lib/utils";
import { withRetry } from "@/lib/retryQueue";
import { saveTask, getTask } from "./db";
import { notifyListeners } from "./eventBus";
import { abortControllers, abortKey } from "./abortManager";
import { buildEnhancedPrompt, mergeReferenceImage } from "./promptEnhancer";
import { persistClientImage } from "./persistedImage";

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

async function resolvePersistedPanelImage(
  taskId: string,
  panelIndex: number,
  title: string | undefined,
  imageUrl: string,
): Promise<string> {
  try {
    const base64 = await urlToBase64(imageUrl);
    if (base64.startsWith("data:image")) {
      const persisted = await persistClientImage({
        taskId,
        panelIndex,
        title,
        base64Data: base64,
        type: "panel",
      });
      if (persisted) {
        return persisted.url;
      }
      console.warn(`[SaveImage] Failed for panel ${panelIndex}`);
    }
    return base64;
  } catch (err) {
    console.warn(`Panel ${panelIndex} Base64 conversion failed:`, err);
    return imageUrl;
  }
}

/**
 * 更新单个面板数据并持久化到 DB。
 * 用于用户编辑提示词、对话、场景等。
 */
export async function updatePanel(
  taskId: string,
  panelIndex: number,
  updates: Partial<Pick<ComicPanel, "scene" | "dialogue" | "imagePrompt" | "styleOverride">>,
): Promise<GenerateTask | null> {
  const task = await getTask(taskId);
  if (!task?.script) return null;

  const panel = task.script.panels[panelIndex];
  if (!panel) return null;

  if (updates.scene !== undefined) panel.scene = updates.scene;
  if (updates.dialogue !== undefined) panel.dialogue = updates.dialogue;
  if (updates.imagePrompt !== undefined) panel.imagePrompt = updates.imagePrompt;
  if (updates.styleOverride !== undefined) panel.styleOverride = updates.styleOverride;

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
 * 重新排序面板：将 fromIndex 的面板移动到 toIndex 位置。
 */
export async function reorderPanels(
  taskId: string,
  fromIndex: number,
  toIndex: number,
): Promise<void> {
  const task = await getTask(taskId);
  if (!task?.script) throw new Error("任务或脚本不存在");

  const panels = [...task.script.panels];
  if (fromIndex < 0 || fromIndex >= panels.length || toIndex < 0 || toIndex >= panels.length) {
    throw new Error("面板索引超出范围");
  }

  // 移除并插入
  const [moved] = panels.splice(fromIndex, 1);
  panels.splice(toIndex, 0, moved);

  task.script.panels = panels;
  task.updatedAt = new Date();
  await saveTask(task);
  notifyListeners(task);
}
export async function regeneratePanel(
  taskId: string,
  panelIndex: number,
  imageConfig?: PartialImageGenConfig,
  seedOverride?: number,
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

    const prompt = buildEnhancedPrompt(panel.imagePrompt, panelIndex, characterDesc, panel.styleOverride ?? script.style, script.panels.length);
    const mergedConfig = mergeReferenceImage(imageConfig, script, panel, panelIndex);
    const adapter = getImageAdapter(mergedConfig);
    const panelSeed = seedOverride ?? (baseSeed !== undefined ? baseSeed + panelIndex : undefined);
    const imageUrl = await withRetry(
      () => adapter.generate(prompt, panel.styleOverride ?? script.style, panelSeed, controller.signal),
      { maxRetries: 2, baseDelay: 1000 },
      controller.signal,
    );

    const finalImageUrl = await resolvePersistedPanelImage(task.id, panelIndex, script.title, imageUrl);
    panel.status = "completed";
    panel.imageUrl = finalImageUrl;
    pushImageVersion(panel, finalImageUrl);
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
