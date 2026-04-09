import type { GenerateTask, Character, ComicPanel, ReferenceImageEntry, ImageVersion } from "@/lib/types";
import { saveImageFile, saveImageFileAsync, deleteImagesByDir, readImageAsBase64, cleanupOutputDir, moveImagesToTrash, restoreImagesFromTrash, purgeTrashImages } from "./imageStorage";
import { registerImage, deleteImagesByPrefix, getImagePath, addToTrash, getTrashItem, removeFromTrash } from "./db";

// ============================================================
// 图片提取：将 task/character 中的 base64 图片提取到文件系统
// 替换为 file://{key} 引用
// ============================================================

const FILE_REF_PREFIX = "file://";
const API_IMAGE_PREFIX = "/api/images/";

function isBase64Image(url: string | undefined | null): url is string {
  return !!url && url.startsWith("data:image");
}

function urlToFileRef(value: string): string {
  if (value.startsWith(FILE_REF_PREFIX)) return value;
  if (value.startsWith(API_IMAGE_PREFIX)) {
    const key = decodeURIComponent(value.slice(API_IMAGE_PREFIX.length));
    return `${FILE_REF_PREFIX}${key}`;
  }
  return value;
}

export function normalizeImageRefsToFileRefs(obj: unknown): unknown {
  if (typeof obj === "string") {
    return urlToFileRef(obj);
  }

  if (obj instanceof Date) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(normalizeImageRefsToFileRefs);
  }

  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = normalizeImageRefsToFileRefs(value);
    }
    return result;
  }

  return obj;
}

/** 保存单张图片并注册到数据库 */
function persistImage(key: string, base64: string): string {
  const result = saveImageFile(key, base64);
  if (!result) return base64; // 降级返回原始
  registerImage(key, result.filePath, result.size);
  return `${FILE_REF_PREFIX}${key}`;
}

/** 处理 ImageVersion 数组中的图片 */
function processVersions(versions: ImageVersion[], keyPrefix: string): ImageVersion[] {
  return versions.map((v, vi) => {
    if (isBase64Image(v.imageUrl)) {
      const vKey = `${keyPrefix}_v${vi}`;
      return { ...v, imageUrl: persistImage(vKey, v.imageUrl) };
    }
    return v;
  });
}

/**
 * 处理 ReferenceImageEntry 数组中的图片。
 *
 * 去重逻辑：entry.imageUrl 通常等于 versions[activeVersionIndex].imageUrl，
 * 因此只保存一份文件（版本文件），imageUrl 指向对应版本的 file:// 引用。
 */
function processRefEntries(entries: ReferenceImageEntry[], keyPrefix: string): ReferenceImageEntry[] {
  return entries.map((entry, ei) => {
    const entryKey = `${keyPrefix}_ref${ei}`;
    const processed = { ...entry };

    // 先保存版本历史（权威副本）
    if (processed.versions?.length) {
      processed.versions = processVersions(processed.versions, entryKey);
    }

    // imageUrl 去重：如果与某个版本的原始 base64 相同，直接引用版本文件
    if (isBase64Image(processed.imageUrl)) {
      const matchIdx = entry.versions?.findIndex((v) => v.imageUrl === entry.imageUrl) ?? -1;
      if (matchIdx >= 0 && processed.versions?.[matchIdx]) {
        // 与版本 matchIdx 完全相同 → 直接引用，不重复保存
        processed.imageUrl = processed.versions[matchIdx].imageUrl;
      } else {
        // 无匹配版本（可能是独立上传图），单独保存
        processed.imageUrl = persistImage(entryKey, processed.imageUrl);
      }
    }

    return processed;
  });
}

/**
 * 提取 GenerateTask 中的所有 base64 图片到文件系统。
 * 返回替换引用后的副本（不修改原对象）。
 */
export function extractTaskImages(task: GenerateTask): GenerateTask {
  const normalizedTask = normalizeImageRefsToFileRefs(task) as GenerateTask;
  if (!normalizedTask.script?.panels) return normalizedTask;

  const processed: GenerateTask = {
    ...normalizedTask,
    script: {
      ...normalizedTask.script,
      panels: normalizedTask.script.panels.map((panel, i) => {
        const p: ComicPanel = { ...panel };
        const panelKey = `${normalizedTask.id}_panel${i}`;

        // 先保存版本历史（权威副本）
        if (p.imageVersions?.length) {
          p.imageVersions = processVersions(p.imageVersions, panelKey);
        }

        // 主图片去重：如果与某个版本的 base64 相同，引用版本文件
        if (isBase64Image(p.imageUrl)) {
          const matchIdx = panel.imageVersions?.findIndex((v) => v.imageUrl === panel.imageUrl) ?? -1;
          if (matchIdx >= 0 && p.imageVersions?.[matchIdx]) {
            p.imageUrl = p.imageVersions[matchIdx].imageUrl;
          } else {
            const key = `${panelKey}_cur`;
            p.imageUrl = persistImage(key, p.imageUrl);
          }
        }

        // 面板级参考图
        if (isBase64Image(p.referenceImage)) {
          const key = `${panelKey}_pref`;
          p.referenceImage = persistImage(key, p.referenceImage);
        }

        if (p.referenceImages?.length) {
          p.referenceImages = p.referenceImages.map((img, ri) => {
            if (isBase64Image(img)) {
              return persistImage(`${panelKey}_pref${ri}`, img);
            }
            return img;
          });
        }

        return p;
      }),
    },
  };

  // 脚本级参考图
  if (processed.script) {
    if (isBase64Image(processed.script.referenceImage)) {
      processed.script.referenceImage = persistImage(`${normalizedTask.id}_sref`, processed.script.referenceImage);
    }

    if (processed.script.referenceImages?.length) {
      processed.script.referenceImages = processed.script.referenceImages.map((img, i) => {
        if (isBase64Image(img)) {
          return persistImage(`${normalizedTask.id}_sref${i}`, img);
        }
        return img;
      });
    }

    if (processed.script.referenceEntries?.length) {
      processed.script.referenceEntries = processRefEntries(
        processed.script.referenceEntries,
        normalizedTask.id,
      );
    }
  }

  // character snapshot 中的图片
  if (processed.character) {
    processed.character = extractCharacterImages(processed.character);
  }

  return processed;
}

/**
 * 提取 Character 中的 base64 图片到文件系统。
 *
 * 去重逻辑：avatarUrl 通常等于 entries[avatarIndex].imageUrl，
 * 先保存 entries，再检查 avatarUrl 是否已被 entry 保存过。
 */
export function extractCharacterImages(char: Character): Character {
  const processed: Character = { ...char };
  const keyPrefix = `char_${char.id}`;

  // 先保存 entries（权威副本）
  if (processed.referenceEntries?.length) {
    processed.referenceEntries = processRefEntries(processed.referenceEntries, keyPrefix);
  }

  // avatarUrl 去重：检查是否与某个 entry 的 imageUrl 重复
  if (isBase64Image(processed.avatarUrl)) {
    const matchIdx = char.referenceEntries?.findIndex((e) => e.imageUrl === char.avatarUrl) ?? -1;
    if (matchIdx >= 0 && processed.referenceEntries?.[matchIdx]) {
      // 与 entry[matchIdx] 完全相同 → 引用其已保存的 file ref
      processed.avatarUrl = processed.referenceEntries[matchIdx].imageUrl;
    } else {
      processed.avatarUrl = persistImage(`${keyPrefix}_avatar`, processed.avatarUrl);
    }
  }

  if (processed.variants?.length) {
    processed.variants = processed.variants.map((variant, vi) => {
      const v = { ...variant };
      const vKey = `${keyPrefix}_var${vi}`;

      // 先保存 variant entries
      if (v.referenceEntries?.length) {
        v.referenceEntries = processRefEntries(v.referenceEntries, vKey);
      }

      // variant avatarUrl 去重
      if (isBase64Image(v.avatarUrl)) {
        const vMatchIdx = variant.referenceEntries?.findIndex((e) => e.imageUrl === variant.avatarUrl) ?? -1;
        if (vMatchIdx >= 0 && v.referenceEntries?.[vMatchIdx]) {
          v.avatarUrl = v.referenceEntries[vMatchIdx].imageUrl;
        } else {
          v.avatarUrl = persistImage(`${vKey}_avatar`, v.avatarUrl);
        }
      }

      return v;
    });
  }

  return processed;
}

// ============================================================
// 异步版本：使用 fs.promises 避免阻塞事件循环
// ============================================================

/** 异步保存单张图片并注册到数据库 */
async function persistImageAsync(key: string, base64: string): Promise<string> {
  const result = await saveImageFileAsync(key, base64);
  if (!result) return base64; // 降级返回原始
  registerImage(key, result.filePath, result.size);
  return `${FILE_REF_PREFIX}${key}`;
}

/** 异步处理 ImageVersion 数组中的图片 */
async function processVersionsAsync(versions: ImageVersion[], keyPrefix: string): Promise<ImageVersion[]> {
  return Promise.all(versions.map(async (v, vi) => {
    if (isBase64Image(v.imageUrl)) {
      const vKey = `${keyPrefix}_v${vi}`;
      return { ...v, imageUrl: await persistImageAsync(vKey, v.imageUrl) };
    }
    return v;
  }));
}

/** 异步处理 ReferenceImageEntry 数组 */
async function processRefEntriesAsync(entries: ReferenceImageEntry[], keyPrefix: string): Promise<ReferenceImageEntry[]> {
  return Promise.all(entries.map(async (entry, ei) => {
    const entryKey = `${keyPrefix}_ref${ei}`;
    const processed = { ...entry };

    if (processed.versions?.length) {
      processed.versions = await processVersionsAsync(processed.versions, entryKey);
    }

    if (isBase64Image(processed.imageUrl)) {
      const matchIdx = entry.versions?.findIndex((v) => v.imageUrl === entry.imageUrl) ?? -1;
      if (matchIdx >= 0 && processed.versions?.[matchIdx]) {
        processed.imageUrl = processed.versions[matchIdx].imageUrl;
      } else {
        processed.imageUrl = await persistImageAsync(entryKey, processed.imageUrl);
      }
    }

    return processed;
  }));
}

/**
 * 异步版本：提取 GenerateTask 中的所有 base64 图片到文件系统。
 * 使用 fs.promises 写入，不阻塞事件循环。
 */
export async function extractTaskImagesAsync(task: GenerateTask): Promise<GenerateTask> {
  const normalizedTask = normalizeImageRefsToFileRefs(task) as GenerateTask;
  if (!normalizedTask.script?.panels) return normalizedTask;

  const processedPanels = await Promise.all(normalizedTask.script.panels.map(async (panel, i) => {
    const p: ComicPanel = { ...panel };
    const panelKey = `${normalizedTask.id}_panel${i}`;

    if (p.imageVersions?.length) {
      p.imageVersions = await processVersionsAsync(p.imageVersions, panelKey);
    }

    if (isBase64Image(p.imageUrl)) {
      const matchIdx = panel.imageVersions?.findIndex((v) => v.imageUrl === panel.imageUrl) ?? -1;
      if (matchIdx >= 0 && p.imageVersions?.[matchIdx]) {
        p.imageUrl = p.imageVersions[matchIdx].imageUrl;
      } else {
        p.imageUrl = await persistImageAsync(`${panelKey}_cur`, p.imageUrl);
      }
    }

    if (isBase64Image(p.referenceImage)) {
      p.referenceImage = await persistImageAsync(`${panelKey}_pref`, p.referenceImage);
    }

    if (p.referenceImages?.length) {
      p.referenceImages = await Promise.all(p.referenceImages.map(async (img, ri) => {
        if (isBase64Image(img)) {
          return persistImageAsync(`${panelKey}_pref${ri}`, img);
        }
        return img;
      }));
    }

    return p;
  }));

  const processed: GenerateTask = {
    ...normalizedTask,
    script: { ...normalizedTask.script, panels: processedPanels },
  };

  if (processed.script) {
    if (isBase64Image(processed.script.referenceImage)) {
      processed.script.referenceImage = await persistImageAsync(`${normalizedTask.id}_sref`, processed.script.referenceImage);
    }

    if (processed.script.referenceImages?.length) {
      processed.script.referenceImages = await Promise.all(
        processed.script.referenceImages.map(async (img, i) => {
          if (isBase64Image(img)) return persistImageAsync(`${normalizedTask.id}_sref${i}`, img);
          return img;
        })
      );
    }

    if (processed.script.referenceEntries?.length) {
      processed.script.referenceEntries = await processRefEntriesAsync(
        processed.script.referenceEntries,
        normalizedTask.id,
      );
    }
  }

  if (processed.character) {
    processed.character = await extractCharacterImagesAsync(processed.character);
  }

  return processed;
}

/**
 * 异步版本：提取 Character 中的 base64 图片到文件系统。
 */
export async function extractCharacterImagesAsync(char: Character): Promise<Character> {
  const processed: Character = { ...char };
  const keyPrefix = `char_${char.id}`;

  if (processed.referenceEntries?.length) {
    processed.referenceEntries = await processRefEntriesAsync(processed.referenceEntries, keyPrefix);
  }

  if (isBase64Image(processed.avatarUrl)) {
    const matchIdx = char.referenceEntries?.findIndex((e) => e.imageUrl === char.avatarUrl) ?? -1;
    if (matchIdx >= 0 && processed.referenceEntries?.[matchIdx]) {
      processed.avatarUrl = processed.referenceEntries[matchIdx].imageUrl;
    } else {
      processed.avatarUrl = await persistImageAsync(`${keyPrefix}_avatar`, processed.avatarUrl);
    }
  }

  if (processed.variants?.length) {
    processed.variants = await Promise.all(processed.variants.map(async (variant, vi) => {
      const v = { ...variant };
      const vKey = `${keyPrefix}_var${vi}`;

      if (v.referenceEntries?.length) {
        v.referenceEntries = await processRefEntriesAsync(v.referenceEntries, vKey);
      }

      if (isBase64Image(v.avatarUrl)) {
        const vMatchIdx = variant.referenceEntries?.findIndex((e) => e.imageUrl === variant.avatarUrl) ?? -1;
        if (vMatchIdx >= 0 && v.referenceEntries?.[vMatchIdx]) {
          v.avatarUrl = v.referenceEntries[vMatchIdx].imageUrl;
        } else {
          v.avatarUrl = await persistImageAsync(`${vKey}_avatar`, v.avatarUrl);
        }
      }

      return v;
    }));
  }

  return processed;
}

/**
 * 软删除 task 关联的所有图片（移到 .trash/ 目录）。
 * 同时在 trash 表中记录元数据以便恢复。
 */
export function trashTaskImages(taskId: string, task?: GenerateTask): void {
  // 将图片移到 .trash/
  moveImagesToTrash(taskId);
  moveImagesToTrash(`task_${taskId}`);
  // 清理 public/output/ 中的导出副本（这些不可恢复）
  cleanupOutputDir(taskId);
  // 从 images 表移除记录（恢复时由 API 重建）
  deleteImagesByPrefix(taskId);
  deleteImagesByPrefix(`task_${taskId}`);

  // 记录到 trash 表
  if (task) {
    addToTrash({
      id: taskId,
      type: "task",
      name: task.script?.title || "Untitled",
      data: JSON.stringify(task),
      imageDir: taskId,
    });
  }
}

/**
 * 软删除 character 关联的所有图片（移到 .trash/ 目录）。
 */
export function trashCharacterImages(charId: string, char?: Character): void {
  const prefix = `char_${charId}`;
  moveImagesToTrash(prefix);
  deleteImagesByPrefix(prefix);

  if (char) {
    addToTrash({
      id: charId,
      type: "character",
      name: char.name || "Unnamed",
      data: JSON.stringify(char),
      imageDir: prefix,
    });
  }
}

/**
 * 从 .trash 恢复一条记录（图片 + 数据）。
 * @returns 恢复的数据（需要调用方写回 DB）
 */
export function restoreFromTrash(id: string): { type: "task" | "character"; data: unknown } | null {
  const item = getTrashItem(id);
  if (!item) return null;

  // 恢复图片文件
  if (item.imageDir) {
    restoreImagesFromTrash(item.imageDir);
    // 重建 images 表记录（通过 extractTaskImages/extractCharacterImages）
    // 调用方需要在恢复后重新 upsert 记录
  }

  // 从 trash 表移除
  removeFromTrash(id);

  return { type: item.type, data: JSON.parse(item.data) };
}

/**
 * 永久删除 trash 中的某条记录（不可恢复）。
 */
export function permanentlyDeleteTrashItem(id: string): boolean {
  const item = getTrashItem(id);
  if (!item) return false;

  if (item.imageDir) {
    purgeTrashImages(item.imageDir);
  }

  removeFromTrash(id);
  return true;
}

/**
 * 清理 task 关联的所有图片（硬删除，用于向后兼容）。
 * 同时清理 data/images/ 和 public/output/ 中的关联文件。
 */
export function cleanupTaskImages(taskId: string): void {
  // 原始格式：{taskId}_panel0_cur 等
  deleteImagesByPrefix(taskId);
  deleteImagesByDir(taskId);
  // 迁移格式：task_{taskId}_img0 等
  deleteImagesByPrefix(`task_${taskId}`);
  deleteImagesByDir(`task_${taskId}`);
  // 清理 public/output/ 中的导出副本
  cleanupOutputDir(taskId);
}

/**
 * 清理 character 关联的所有图片。
 */
export function cleanupCharacterImages(charId: string): void {
  const prefix = `char_${charId}`;
  deleteImagesByPrefix(prefix);
  deleteImagesByDir(prefix);
}

/**
 * 将 file:// 引用还原为 base64（用于 API 返回给前端）。
 * 注意：仅在需要时调用（如 GET /api/tasks/{id}?withImages=true）
 */
export function restoreFileRefs(obj: unknown): unknown {
  if (typeof obj === "string" && obj.startsWith(FILE_REF_PREFIX)) {
    const key = obj.slice(FILE_REF_PREFIX.length);
    const filePath = getImagePath(key);
    if (filePath) {
      const base64 = readImageAsBase64(filePath);
      if (base64) return base64;
    }
    // 降级返回 API URL
    return `/api/images/${encodeURIComponent(key)}`;
  }

  if (Array.isArray(obj)) {
    return obj.map(restoreFileRefs);
  }

  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = restoreFileRefs(v);
    }
    return result;
  }

  return obj;
}

/**
 * 将 file:// 引用转换为 /api/images/{key} URL（轻量版，不读取 base64）。
 * 适用于列表接口，避免返回体积过大的 base64 数据。
 */
export function fileRefsToUrls(obj: unknown): unknown {
  if (typeof obj === "string" && obj.startsWith(FILE_REF_PREFIX)) {
    const key = obj.slice(FILE_REF_PREFIX.length);
    return `/api/images/${encodeURIComponent(key)}`;
  }

  if (Array.isArray(obj)) {
    return obj.map(fileRefsToUrls);
  }

  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = fileRefsToUrls(v);
    }
    return result;
  }

  return obj;
}
