import type { Character, GenerateTask } from "./types";
import type JSZipType from "jszip";

// ============================================================
// 带图片的 ZIP 导出/导入
// 支持角色库和漫画历史的完整数据迁移
// ============================================================

// ZIP 内部结构:
//   data.json          — 角色/任务 JSON 数组
//   images/{key}.png   — 所有引用的图片文件
//   manifest.json      — 元信息（版本、类型、导出时间）

interface ExportManifest {
  version: 1;
  type: "characters" | "tasks";
  count: number;
  imageCount: number;
  /** Total images attempted (including failures) */
  totalImages?: number;
  /** Number of images that failed to export */
  failedImages?: number;
  exportedAt: string;
  app: "comicpedia";
}

/** 触发浏览器下载 Blob */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 日期后缀 */
function dateSuffix(): string {
  return new Date().toISOString().slice(0, 10);
}

// ============================================================
// 图片引用收集 — 递归遍历 JSON 找出所有图片 URL
// ============================================================

/** 匹配可提取的图片引用（/api/images/key 或 file://key） */
const API_IMAGE_RE = /^\/api\/images\/(.+)$/;
const FILE_REF_RE = /^file:\/\/(.+)$/;

interface ImageRef {
  /** 用于在 ZIP images/ 目录中的文件名（不含扩展名） */
  key: string;
  /** 原始 URL（用于 fetch） */
  fetchUrl: string;
}

/**
 * 递归扫描对象中所有图片引用。
 * 收集 /api/images/{key} 和 file://{key} 格式的引用。
 */
function collectImageRefs(obj: unknown, refs: Map<string, ImageRef>): void {
  if (typeof obj === "string") {
    const apiMatch = obj.match(API_IMAGE_RE);
    if (apiMatch) {
      const key = decodeURIComponent(apiMatch[1]);
      if (!refs.has(key)) {
        refs.set(key, { key, fetchUrl: obj });
      }
      return;
    }
    const fileMatch = obj.match(FILE_REF_RE);
    if (fileMatch) {
      const key = fileMatch[1];
      if (!refs.has(key)) {
        refs.set(key, { key, fetchUrl: `/api/images/${encodeURIComponent(key)}` });
      }
      return;
    }
    // base64 图片不收集（太大且会内联在 JSON 中）
    return;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      collectImageRefs(item, refs);
    }
    return;
  }

  if (obj && typeof obj === "object") {
    for (const val of Object.values(obj)) {
      collectImageRefs(val, refs);
    }
  }
}

/**
 * 递归替换对象中的图片引用。
 *
 * 支持三种匹配模式：
 * 1. 直接匹配 — mapping key 就是完整字符串（导入时 ZIP 路径 → file:// 引用）
 * 2. /api/images/{key} — 导出时转换为 ZIP 相对路径
 * 3. file://{key} — 导出时转换为 ZIP 相对路径
 */
function rewriteImageRefs(obj: unknown, mapping: Map<string, string>): unknown {
  if (typeof obj === "string") {
    // 1. 直接匹配（import 场景：ZIP 路径 → file:// 或 /api/images/ 引用）
    const direct = mapping.get(obj);
    if (direct !== undefined) return direct;

    // 2. /api/images/{key} 匹配（export 场景）
    const apiMatch = obj.match(API_IMAGE_RE);
    if (apiMatch) {
      const key = decodeURIComponent(apiMatch[1]);
      return mapping.get(key) ?? obj;
    }

    // 3. file://{key} 匹配（export 场景）
    const fileMatch = obj.match(FILE_REF_RE);
    if (fileMatch) {
      const key = fileMatch[1];
      return mapping.get(key) ?? obj;
    }

    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => rewriteImageRefs(item, mapping));
  }

  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = rewriteImageRefs(v, mapping);
    }
    return result;
  }

  return obj;
}

// ============================================================
// 导出
// ============================================================

export interface ExportProgress {
  phase: "collecting" | "fetching" | "packing" | "done";
  current: number;
  total: number;
}

/**
 * 将角色数组导出为 ZIP（含所有引用图片）。
 */
export async function exportCharactersAsZip(
  characters: Character[],
  onProgress?: (p: ExportProgress) => void,
): Promise<void> {
  if (characters.length === 0) return;
  await exportDataAsZip(characters, "characters", `comicpedia-characters-${dateSuffix()}.zip`, onProgress);
}

/**
 * 将漫画任务数组导出为 ZIP（含所有面板图片）。
 */
export async function exportTasksAsZip(
  tasks: GenerateTask[],
  onProgress?: (p: ExportProgress) => void,
): Promise<void> {
  if (tasks.length === 0) return;
  await exportDataAsZip(tasks, "tasks", `comicpedia-backup-${dateSuffix()}.zip`, onProgress);
}

async function exportDataAsZip(
  data: unknown[],
  type: "characters" | "tasks",
  filename: string,
  onProgress?: (p: ExportProgress) => void,
): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  // 1. 收集所有图片引用
  onProgress?.({ phase: "collecting", current: 0, total: 0 });
  const refs = new Map<string, ImageRef>();
  collectImageRefs(data, refs);

  // 2. 下载所有图片并放入 ZIP
  const mapping = new Map<string, string>(); // key → ZIP 内路径
  const imageFolder = zip.folder("images");
  let fetched = 0;
  let failedImages = 0;
  const total = refs.size;

  for (const [key, ref] of refs) {
    onProgress?.({ phase: "fetching", current: fetched, total });
    try {
      const res = await fetch(ref.fetchUrl);
      if (res.ok) {
        const blob = await res.blob();
        const ext = blob.type.includes("jpeg") || blob.type.includes("jpg") ? "jpg" : "png";
        const zipPath = `images/${key}.${ext}`;
        imageFolder?.file(`${key}.${ext}`, blob);
        mapping.set(key, zipPath);
      } else {
        failedImages++;
        console.warn(`[Export] Image fetch failed (${res.status}): ${key}`);
      }
    } catch (err) {
      failedImages++;
      console.warn(`[Export] Failed to fetch image ${key}:`, err);
    }
    fetched++;
  }

  // 3. 重写 JSON 中的图片引用为 ZIP 相对路径
  onProgress?.({ phase: "packing", current: 0, total: 0 });
  const rewritten = rewriteImageRefs(data, mapping);

  // 4. 写入 data.json 和 manifest.json
  zip.file("data.json", JSON.stringify(rewritten, null, 2));

  const manifest: ExportManifest = {
    version: 1,
    type,
    count: data.length,
    imageCount: mapping.size,
    totalImages: total,
    failedImages,
    exportedAt: new Date().toISOString(),
    app: "comicpedia",
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  // 5. 生成并下载
  const content = await zip.generateAsync({ type: "blob" });
  triggerDownload(content, filename);
  onProgress?.({ phase: "done", current: total, total });
}

// ============================================================
// 导入
// ============================================================

export interface ImportResult {
  type: "characters" | "tasks";
  items: unknown[];
  imageCount: number;
}

/**
 * 导入 ZIP 或 JSON 文件。
 * - ZIP: 提取图片并上传到服务端，重写引用后返回数据
 * - JSON: 直接解析返回（向后兼容）
 */
export async function importDataFromFile(
  file: File,
  onProgress?: (p: ExportProgress) => void,
): Promise<ImportResult> {
  const isZip = file.name.endsWith(".zip") || file.type === "application/zip" || file.type === "application/x-zip-compressed";

  if (isZip) {
    return importFromZip(file, onProgress);
  }

  // JSON 格式导入（向后兼容）
  const text = await file.text();
  const parsed = JSON.parse(text);
  const arr = Array.isArray(parsed) ? parsed : [parsed];

  // 推断类型：有 name 字段的是角色，有 script/status 字段的是任务
  const type = arr.length > 0 && "name" in arr[0] && "appearance" in arr[0] ? "characters" : "tasks";

  return { type, items: arr, imageCount: 0 };
}

async function importFromZip(
  file: File,
  onProgress?: (p: ExportProgress) => void,
): Promise<ImportResult> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);

  // 读取 manifest
  const manifestFile = zip.file("manifest.json");
  let type: "characters" | "tasks" = "characters";
  if (manifestFile) {
    try {
      const manifest: ExportManifest = JSON.parse(await manifestFile.async("string"));
      type = manifest.type;
    } catch {
      // manifest 损坏，继续用推断
    }
  }

  // 读取 data.json
  const dataFile = zip.file("data.json");
  if (!dataFile) {
    throw new Error("ZIP does not contain data.json");
  }
  const dataText = await dataFile.async("string");
  let data = JSON.parse(dataText);
  if (!Array.isArray(data)) {
    data = [data];
  }

  // 推断类型 (fallback)
  if (!manifestFile && data.length > 0 && "name" in data[0] && "appearance" in data[0]) {
    type = "characters";
  } else if (!manifestFile && data.length > 0 && ("script" in data[0] || "status" in data[0])) {
    type = "tasks";
  }

  // 收集 ZIP 中的图片文件
  const imageFiles = new Map<string, JSZipType.JSZipObject>();
  zip.folder("images")?.forEach((relativePath, zipEntry) => {
    if (!zipEntry.dir) {
      // relativePath: "char_xxx_ref0_v0.png" → key: "char_xxx_ref0_v0"
      const key = relativePath.replace(/\.\w+$/, "");
      imageFiles.set(key, zipEntry);
    }
  });

  // 上传图片到服务端
  const refMapping = new Map<string, string>(); // "images/{key}.ext" → "file://{key}"
  let uploaded = 0;
  const total = imageFiles.size;

  onProgress?.({ phase: "fetching", current: 0, total });

  for (const [key, zipEntry] of imageFiles) {
    onProgress?.({ phase: "fetching", current: uploaded, total });
    try {
      const blob = await zipEntry.async("blob");
      const contentType = zipEntry.name.endsWith(".jpg") ? "image/jpeg" : "image/png";

      const res = await fetch(`/api/migrate/image?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": contentType },
        body: blob,
      });

      if (res.ok) {
        const result = await res.json();
        // 建立映射：ZIP 内路径 → file:// 引用
        const ext = zipEntry.name.endsWith(".jpg") ? "jpg" : "png";
        const zipPath = `images/${key}.${ext}`;
        refMapping.set(zipPath, result.ref); // "file://{key}"
      }
    } catch (err) {
      console.warn(`[Import] Failed to upload image ${key}:`, err);
    }
    uploaded++;
  }

  onProgress?.({ phase: "packing", current: 0, total: 0 });

  // 重写 data 中的 ZIP 路径引用为 file:// 引用
  const rewritten = rewriteImageRefs(data, refMapping);

  onProgress?.({ phase: "done", current: total, total });

  return {
    type,
    items: rewritten as unknown[],
    imageCount: uploaded,
  };
}
