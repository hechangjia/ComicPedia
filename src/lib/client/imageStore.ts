import { openDB, IDBPDatabase } from "idb";

// ============================================================
// 图片 Blob 存储
// 将 base64 图片从 task 对象中分离，使用独立的 object store 存储。
// task.panel.imageUrl 保存为 "idb://images/{key}" 引用。
// ============================================================

const IMAGE_DB_NAME = "comicpedia-images";
const IMAGE_DB_VERSION = 1;
const IMAGE_STORE = "blobs";

interface ImageRecord {
  key: string;
  blob: Blob;
  size: number;
  createdAt: number;
}

let imageDbPromise: Promise<IDBPDatabase> | null = null;

function getImageDB(): Promise<IDBPDatabase> {
  if (!imageDbPromise) {
    imageDbPromise = openDB(IMAGE_DB_NAME, IMAGE_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(IMAGE_STORE)) {
          db.createObjectStore(IMAGE_STORE, { keyPath: "key" });
        }
      },
    });
  }
  return imageDbPromise;
}

/** 将 base64 data URI 转为 Blob */
function base64ToBlob(dataUri: string): Blob {
  const [meta, data] = dataUri.split(",");
  const mime = meta.match(/:(.*?);/)?.[1] || "image/png";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

/** 生成图片存储 key */
export function imageKey(taskId: string, panelIndex: number, version: number): string {
  return `${taskId}_panel${panelIndex}_v${version}`;
}

/**
 * 保存图片到 Blob 存储。
 * @returns 存储引用 key（"idb://images/{key}"）
 */
export async function saveImageBlob(key: string, base64: string): Promise<string> {
  if (!base64.startsWith("data:image")) return base64;

  try {
    const db = await getImageDB();
    const blob = base64ToBlob(base64);
    const record: ImageRecord = {
      key,
      blob,
      size: blob.size,
      createdAt: Date.now(),
    };
    await db.put(IMAGE_STORE, record);
    return `idb://images/${key}`;
  } catch (err) {
    console.warn("[ImageStore] Failed to save blob:", err);
    return base64; // 降级返回原始 base64
  }
}

/** ObjectURL cache — prevents memory leaks from repeated createObjectURL calls */
const blobUrlCache = new Map<string, string>();

/**
 * 从 Blob 存储读取图片并转为 Object URL。
 * Results are cached: same key always returns the same URL without creating new ones.
 * Call revokeImageBlobUrl() to free memory when the URL is no longer needed.
 */
export async function loadImageBlob(ref: string): Promise<string | null> {
  // 服务端文件引用 → 转为 API URL
  if (ref.startsWith("file://")) {
    const key = ref.slice("file://".length);
    return `/api/images/${encodeURIComponent(key)}`;
  }

  if (!ref.startsWith("idb://images/")) return ref;

  const key = ref.replace("idb://images/", "");

  // Return cached URL if available
  const cached = blobUrlCache.get(key);
  if (cached) return cached;

  try {
    const db = await getImageDB();
    const record = await db.get(IMAGE_STORE, key) as ImageRecord | undefined;
    if (!record) return null;
    const url = URL.createObjectURL(record.blob);
    blobUrlCache.set(key, url);
    return url;
  } catch (err) {
    console.warn("[ImageStore] Failed to load blob:", err);
    return null;
  }
}

/** Revoke a cached ObjectURL to free memory */
export function revokeImageBlobUrl(ref: string): void {
  const key = ref.replace("idb://images/", "");
  const url = blobUrlCache.get(key);
  if (url) {
    URL.revokeObjectURL(url);
    blobUrlCache.delete(key);
  }
}

/** Revoke all cached ObjectURLs (e.g., on page unmount) */
export function revokeAllBlobUrls(): void {
  for (const url of blobUrlCache.values()) {
    URL.revokeObjectURL(url);
  }
  blobUrlCache.clear();
}

/** 删除指定 key 的图片 */
export async function deleteImageBlob(key: string): Promise<void> {
  try {
    const db = await getImageDB();
    await db.delete(IMAGE_STORE, key);
  } catch {
    // 静默失败
  }
}

/** 批量删除指定前缀的图片（如某个 task 的所有图片） */
export async function deleteImagesByPrefix(prefix: string): Promise<number> {
  try {
    const db = await getImageDB();
    const tx = db.transaction(IMAGE_STORE, "readwrite");
    const store = tx.objectStore(IMAGE_STORE);
    let cursor = await store.openCursor();
    let count = 0;

    while (cursor) {
      if ((cursor.key as string).startsWith(prefix)) {
        await cursor.delete();
        count++;
      }
      cursor = await cursor.continue();
    }

    await tx.done;
    return count;
  } catch {
    return 0;
  }
}

/**
 * 获取图片存储用量统计。
 * @returns { count: 图片数量, totalBytes: 总字节数 }
 */
export async function getStorageUsage(): Promise<{ count: number; totalBytes: number }> {
  try {
    const db = await getImageDB();
    const tx = db.transaction(IMAGE_STORE, "readonly");
    const store = tx.objectStore(IMAGE_STORE);
    let cursor = await store.openCursor();
    let count = 0;
    let totalBytes = 0;

    while (cursor) {
      const record = cursor.value as ImageRecord;
      count++;
      totalBytes += record.size;
      cursor = await cursor.continue();
    }

    return { count, totalBytes };
  } catch {
    return { count: 0, totalBytes: 0 };
  }
}

/** 格式化字节数为人类可读的字符串 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}
