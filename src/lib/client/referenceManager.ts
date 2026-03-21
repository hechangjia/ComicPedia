import { ComicScript, PartialImageGenConfig, ReferenceImageEntry, ZImageExtraBody } from "@/lib/types";
import { getImageAdapter } from "@/lib/imageGen";
import { urlToBase64 } from "@/lib/utils";
import { saveTask, getTask } from "./db";
import { notifyListeners } from "./eventBus";

/** 每个参考图最多保留的历史版本数 */
const MAX_IMAGE_VERSIONS = 10;

/**
 * 将图片推入参考图版本历史。
 */
function pushRefImageVersion(entry: ReferenceImageEntry, imageUrl: string): void {
  entry.versions.push({ imageUrl, createdAt: Date.now() });
  while (entry.versions.length > MAX_IMAGE_VERSIONS) {
    entry.versions.shift();
  }
  entry.activeVersionIndex = entry.versions.length - 1;
}

/**
 * 将 referenceEntries 同步到旧的 referenceImages / referenceImage 字段。
 */
function syncRefEntriesToLegacy(script: ComicScript): void {
  if (!script.referenceEntries || script.referenceEntries.length === 0) return;
  script.referenceImages = script.referenceEntries.map((e) => e.imageUrl);
  script.referenceImage = script.referenceImages.length > 0 ? script.referenceImages[0] : undefined;
}

/**
 * 更新参考图（script 级或 panel 级）并持久化。
 */
export async function updateReferenceImage(
  taskId: string,
  referenceImage: string | undefined,
  panelIndex?: number,
): Promise<void> {
  const task = await getTask(taskId);
  if (!task?.script) throw new Error("任务或脚本不存在");

  if (panelIndex !== undefined) {
    const panel = task.script.panels[panelIndex];
    if (!panel) throw new Error(`面板 ${panelIndex} 不存在`);
    panel.referenceImage = referenceImage;
  } else {
    task.script.referenceImage = referenceImage;
  }

  task.updatedAt = new Date();
  await saveTask(task);
  notifyListeners(task);
}

/**
 * 更新多参考图（script 级）并持久化。
 */
export async function updateReferenceImages(
  taskId: string,
  referenceImages: string[],
): Promise<void> {
  const task = await getTask(taskId);
  if (!task?.script) throw new Error("任务或脚本不存在");

  task.script.referenceImages = referenceImages;
  task.script.referenceImage = referenceImages.length > 0 ? referenceImages[0] : undefined;
  task.updatedAt = new Date();
  await saveTask(task);
  notifyListeners(task);
}

/**
 * 更新参考图控制模式（script 级）并持久化。
 */
export async function updateControlMode(
  taskId: string,
  controlMode: "HED" | "Canny" | "Depth",
): Promise<void> {
  const task = await getTask(taskId);
  if (!task?.script) throw new Error("任务或脚本不存在");

  task.script.controlMode = controlMode;
  task.updatedAt = new Date();
  await saveTask(task);
  notifyListeners(task);
}

/**
 * 切换参考图的激活版本。
 */
export async function setRefActiveVersion(
  taskId: string,
  refIndex: number,
  versionIndex: number,
): Promise<void> {
  const task = await getTask(taskId);
  if (!task?.script) throw new Error("任务或脚本不存在");

  const entries = task.script.referenceEntries;
  if (!entries || !entries[refIndex]) throw new Error(`参考图 ${refIndex} 不存在`);

  const entry = entries[refIndex];
  if (versionIndex < 0 || versionIndex >= entry.versions.length) {
    throw new Error(`版本索引 ${versionIndex} 无效`);
  }

  entry.imageUrl = entry.versions[versionIndex].imageUrl;
  entry.activeVersionIndex = versionIndex;
  syncRefEntriesToLegacy(task.script);
  task.updatedAt = new Date();
  await saveTask(task);
  notifyListeners(task);
}

/**
 * 重新生成参考图。
 */
export async function regenerateRefImage(
  taskId: string,
  refIndex: number,
  imageConfig?: PartialImageGenConfig,
  prompt?: string,
): Promise<void> {
  const task = await getTask(taskId);
  if (!task?.script) throw new Error("任务或脚本不存在");

  const entries = task.script.referenceEntries;
  if (!entries || !entries[refIndex]) throw new Error(`参考图 ${refIndex} 不存在`);

  const entry = entries[refIndex];
  const usePrompt = prompt ?? entry.prompt;
  if (!usePrompt) throw new Error("无可用 prompt，无法重新生成");

  // 归档旧图到版本历史
  if (entry.imageUrl && entry.imageUrl.startsWith("data:image")) {
    const lastVersion = entry.versions[entry.versions.length - 1];
    if (!lastVersion || lastVersion.imageUrl !== entry.imageUrl) {
      pushRefImageVersion(entry, entry.imageUrl);
    }
  }

  entry.prompt = usePrompt;
  task.updatedAt = new Date();
  await saveTask(task);
  notifyListeners(task);

  try {
    const adapter = getImageAdapter(imageConfig);
    const imageUrl = await adapter.generate(usePrompt, task.script.style);
    const base64 = await urlToBase64(imageUrl);

    entry.imageUrl = base64;
    entry.source = "ai";
    pushRefImageVersion(entry, base64);
    syncRefEntriesToLegacy(task.script);
    task.updatedAt = new Date();
    await saveTask(task);
    notifyListeners(task);
  } catch (err) {
    if (entry.versions.length > 0) {
      const lastVersion = entry.versions[entry.versions.length - 1];
      entry.imageUrl = lastVersion.imageUrl;
      entry.activeVersionIndex = entry.versions.length - 1;
    }
    syncRefEntriesToLegacy(task.script);
    task.updatedAt = new Date();
    await saveTask(task);
    notifyListeners(task);
    throw err;
  }
}

/**
 * img2img 生成：基于源图片 + prompt + strength 生成新参考图。
 */
export async function img2imgGenerate(
  taskId: string,
  refIndex: number,
  sourceImage: string,
  prompt: string,
  strength: number,
  imageConfig?: PartialImageGenConfig,
): Promise<void> {
  const task = await getTask(taskId);
  if (!task?.script) throw new Error("任务或脚本不存在");

  const entries = task.script.referenceEntries;
  if (!entries || !entries[refIndex]) throw new Error(`参考图 ${refIndex} 不存在`);

  const entry = entries[refIndex];

  // 归档旧图
  if (entry.imageUrl && entry.imageUrl.startsWith("data:image")) {
    const lastVersion = entry.versions[entry.versions.length - 1];
    if (!lastVersion || lastVersion.imageUrl !== entry.imageUrl) {
      pushRefImageVersion(entry, entry.imageUrl);
    }
  }

  entry.prompt = prompt;
  task.updatedAt = new Date();
  await saveTask(task);
  notifyListeners(task);

  try {
    const mergedConfig: PartialImageGenConfig = {
      ...imageConfig,
      extraBody: {
        ...imageConfig?.extraBody,
        image: sourceImage,
        strength,
      } as ZImageExtraBody,
    };

    const adapter = getImageAdapter(mergedConfig);
    const imageUrl = await adapter.generate(prompt, task.script.style);
    const base64 = await urlToBase64(imageUrl);

    entry.imageUrl = base64;
    entry.source = "ai";
    pushRefImageVersion(entry, base64);
    syncRefEntriesToLegacy(task.script);
    task.updatedAt = new Date();
    await saveTask(task);
    notifyListeners(task);
  } catch (err) {
    if (entry.versions.length > 0) {
      const lastVersion = entry.versions[entry.versions.length - 1];
      entry.imageUrl = lastVersion.imageUrl;
      entry.activeVersionIndex = entry.versions.length - 1;
    }
    syncRefEntriesToLegacy(task.script);
    task.updatedAt = new Date();
    await saveTask(task);
    notifyListeners(task);
    throw err;
  }
}

/**
 * 更新参考图的 prompt 并持久化。
 */
export async function updateRefImagePrompt(
  taskId: string,
  refIndex: number,
  prompt: string,
): Promise<void> {
  const task = await getTask(taskId);
  if (!task?.script) throw new Error("任务或脚本不存在");

  const entries = task.script.referenceEntries;
  if (!entries || !entries[refIndex]) throw new Error(`参考图 ${refIndex} 不存在`);

  entries[refIndex].prompt = prompt;
  task.updatedAt = new Date();
  await saveTask(task);
  notifyListeners(task);
}

/**
 * 整体更新 referenceEntries 并同步旧字段。
 */
export async function updateReferenceEntries(
  taskId: string,
  entries: ReferenceImageEntry[],
): Promise<void> {
  const task = await getTask(taskId);
  if (!task?.script) throw new Error("任务或脚本不存在");

  task.script.referenceEntries = entries;
  syncRefEntriesToLegacy(task.script);
  task.updatedAt = new Date();
  await saveTask(task);
  notifyListeners(task);
}
