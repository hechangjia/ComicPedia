import path from "path";
import fs from "fs";
import { promises as fsp } from "fs";
import { getDataDirectory } from "./dataDirectory";
import { assertStorageSegment, isStorageSegment, isSafeStoragePath } from "./storageBoundary";

// ============================================================
// 图片文件系统存储
// 将 base64 图片保存到 data/images/ 目录，返回相对路径引用
// ============================================================

const DATA_BASE = getDataDirectory();
const IMAGE_BASE = path.join(DATA_BASE, "images");
const TRASH_BASE = path.join(DATA_BASE, ".trash");
const OUTPUT_BASE = path.join(process.cwd(), "public", "output");

/** 从 base64 data URI 提取 MIME 类型和扩展名 */
function parseDataUri(dataUri: string): { ext: string; buffer: Buffer } | null {
  const match = dataUri.match(/^data:image\/([\w+]+);base64,(.+)$/);
  if (!match) return null;
  const ext = match[1] === "jpeg" ? "jpg" : match[1];
  const buffer = Buffer.from(match[2], "base64");
  return { ext, buffer };
}

/** 从 key 中提取 taskId 前缀（用作子目录名） */
function extractDirName(key: string): string {
  // key 格式: "{taskId}_panel{idx}_v{ver}" 或 "char_{id}_ref{idx}"
  const parts = key.split("_panel");
  if (parts.length > 1) return parts[0];
  const charParts = key.split("_ref");
  if (charParts.length > 1) return charParts[0];
  return key;
}

/**
 * 保存 base64 图片到文件系统。
 * @returns 可迁移的 data/images/ 逻辑路径
 */
export function saveImageFile(key: string, base64Data: string): { filePath: string; size: number } | null {
  assertStorageSegment(key);
  const parsed = parseDataUri(base64Data);
  if (!parsed) return null;

  const dirName = extractDirName(key);
  const dir = path.join(IMAGE_BASE, dirName);
  const fileName = `${key}.${parsed.ext}`;
  const fullPath = path.join(dir, fileName);

  // Path traversal 防护
  const resolved = path.resolve(fullPath);
  if (!isSafeStoragePath(IMAGE_BASE, resolved)) {
    throw new Error("Invalid image path");
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, parsed.buffer);
  _keyPathCache.delete(key);

  // 逻辑引用不暴露物理存储位置，允许迁移整个 data 目录
  const relativePath = `data/images/${path.relative(IMAGE_BASE, fullPath).replace(/\\/g, "/")}`;
  return { filePath: relativePath, size: parsed.buffer.length };
}

/**
 * 异步版本：保存 base64 图片到文件系统，不阻塞事件循环。
 * @returns 可迁移的 data/images/ 逻辑路径
 */
export async function saveImageFileAsync(key: string, base64Data: string): Promise<{ filePath: string; size: number } | null> {
  assertStorageSegment(key);
  const parsed = parseDataUri(base64Data);
  if (!parsed) return null;

  const dirName = extractDirName(key);
  const dir = path.join(IMAGE_BASE, dirName);
  const fileName = `${key}.${parsed.ext}`;
  const fullPath = path.join(dir, fileName);

  // Path traversal 防护
  const resolved = path.resolve(fullPath);
  if (!isSafeStoragePath(IMAGE_BASE, resolved)) {
    throw new Error("Invalid image path");
  }

  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(fullPath, parsed.buffer);
  _keyPathCache.delete(key);

  const relativePath = `data/images/${path.relative(IMAGE_BASE, fullPath).replace(/\\/g, "/")}`;
  return { filePath: relativePath, size: parsed.buffer.length };
}

/** Resolve logical data/images references against the configured storage root. */
export function resolveStoredImagePath(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, "/");
  const candidate = normalized.startsWith("data/images/")
    ? path.resolve(DATA_BASE, normalized.slice("data/".length))
    : path.resolve(process.cwd(), filePath);
  return isSafeStoragePath(IMAGE_BASE, candidate) ? candidate : null;
}

/**
 * 读取图片文件，返回 base64 data URI。
 */
export function readImageAsBase64(filePath: string): string | null {
  try {
    const resolved = resolveStoredImagePath(filePath);
    if (!resolved) return null;

    if (!fs.existsSync(resolved)) return null;

    const buffer = fs.readFileSync(resolved);
    const ext = path.extname(resolved).slice(1);
    const mime = ext === "jpg" ? "jpeg" : ext;
    return `data:image/${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * 通过存储 key 构造文件系统路径并读取。
 * 结果缓存在内存中避免重复扫描目录。
 */
const _keyPathCache = new Map<string, { absPath: string; mime: string } | null>();
const _KEY_CACHE_MAX = 2000;

export function readImageByKey(key: string): { absPath: string; mime: string } | null {
  if (!isStorageSegment(key)) return null;
  const cached = _keyPathCache.get(key);
  if (cached && isSafeStoragePath(IMAGE_BASE, cached.absPath) && fs.existsSync(cached.absPath)) return cached;
  _keyPathCache.delete(key);

  const dirName = extractDirName(key);
  const dir = path.join(IMAGE_BASE, dirName);

  if (!isSafeStoragePath(IMAGE_BASE, dir) || !fs.existsSync(dir)) {
    return null;
  }

  // 在目录下查找匹配的文件
  try {
    const files = fs.readdirSync(dir);
    const match = files.find((f) => f.startsWith(key + "."));
    if (!match) {
      return null;
    }

    const absPath = path.join(dir, match);
    if (!isSafeStoragePath(IMAGE_BASE, absPath)) return null;
    const ext = path.extname(match).slice(1);
    const mime = `image/${ext === "jpg" ? "jpeg" : ext}`;
    const result = { absPath, mime };

    // LRU 简易淘汰
    if (_keyPathCache.size >= _KEY_CACHE_MAX) {
      const firstKey = _keyPathCache.keys().next().value;
      if (firstKey !== undefined) _keyPathCache.delete(firstKey);
    }
    _keyPathCache.set(key, result);
    return result;
  } catch {
    return null;
  }
}

/**
 * 删除单个图片文件。
 */
export function deleteImageFile(filePath: string): boolean {
  try {
    const resolved = resolveStoredImagePath(filePath);
    if (!resolved) return false;

    if (fs.existsSync(resolved)) {
      fs.unlinkSync(resolved);
      _keyPathCache.clear();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * 删除某个 taskId/charId 下的所有图片。
 * 同时检查以该前缀开头的所有子目录（兼容迁移格式 task_{id}_img* 的独立子目录）。
 * @returns 删除的文件数
 */
export function deleteImagesByDir(dirName: string): number {
  assertStorageSegment(dirName);
  _keyPathCache.clear();
  let count = 0;

  // 精确匹配：删除 IMAGE_BASE/{dirName}/ 目录
  count += removeDirWithin(IMAGE_BASE, path.join(IMAGE_BASE, dirName));

  // 前缀匹配：删除 IMAGE_BASE/{dirName}_*/ 目录（迁移格式每张图片一个子目录）
  try {
    if (fs.existsSync(IMAGE_BASE)) {
      const entries = fs.readdirSync(IMAGE_BASE, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith(dirName + "_")) {
          count += removeDirWithin(IMAGE_BASE, path.join(IMAGE_BASE, entry.name));
        }
      }
    }
  } catch {
    // 静默
  }

  return count;
}

// ============================================================
// Trash (soft-delete): 将图片目录移动到 data/.trash/
// ============================================================

/**
 * 将指定前缀的图片目录移动到 .trash/ 目录。
 * @returns 移动的文件数
 */
export function moveImagesToTrash(dirName: string): number {
  return moveImageGroupsToTrash([dirName]);
}

export function moveImageGroupsToTrash(prefixes: string[]): number {
  return transferImageDirectories(IMAGE_BASE, TRASH_BASE, collectImageDirectories(IMAGE_BASE, prefixes));
}

/** Restore canonical and migrated groups together, after one complete preflight. */
export function restoreImagesFromTrash(dirName: string): number {
  return restoreImageGroupsFromTrash([dirName]);
}

export function restoreImageGroupsFromTrash(prefixes: string[]): number {
  return transferImageDirectories(TRASH_BASE, IMAGE_BASE, collectImageDirectories(TRASH_BASE, prefixes));
}

function collectImageDirectories(base: string, prefixes: string[]): string[] {
  prefixes.forEach(assertStorageSegment);
  _keyPathCache.clear();
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && prefixes.some((prefix) =>
      entry.name === prefix || entry.name.startsWith(`${prefix}_`)))
    .map((entry) => entry.name);
}

/**
 * 永久删除 .trash/ 中指定前缀的图片目录。
 * @returns 删除的文件数
 */
export function purgeTrashImages(dirName: string): number {
  assertStorageSegment(dirName);
  _keyPathCache.clear();
  let count = 0;

  const exactDir = path.join(TRASH_BASE, dirName);
  count += removeDirSafe(exactDir, TRASH_BASE);

  try {
    if (fs.existsSync(TRASH_BASE)) {
      const entries = fs.readdirSync(TRASH_BASE, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith(dirName + "_")) {
          count += removeDirSafe(path.join(TRASH_BASE, entry.name), TRASH_BASE);
        }
      }
    }
  } catch { /* 静默 */ }

  return count;
}

/** 清空整个 .trash/ 目录 */
export function purgeAllTrash(): { dirs: number; files: number } {
  let dirs = 0;
  let files = 0;
  if (!fs.existsSync(TRASH_BASE)) return { dirs, files };

  try {
    const entries = fs.readdirSync(TRASH_BASE, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        files += removeDirSafe(path.join(TRASH_BASE, entry.name), TRASH_BASE);
        dirs++;
      }
    }
  } catch { /* 静默 */ }
  return { dirs, files };
}

/** Preflight the entire transfer; never overwrite an existing recoverable copy. */
function transferImageDirectories(sourceBase: string, destinationBase: string, names: string[]): number {
  const transfers = [...new Set(names)].map((name) => ({
    source: path.join(sourceBase, name),
    destination: path.join(destinationBase, name),
  })).filter(({ source, destination }) =>
    isSafeStoragePath(sourceBase, source) && isSafeStoragePath(destinationBase, destination));
  for (const { destination } of transfers) {
    if (fs.existsSync(destination)) throw new Error("Image destination already exists; no files were overwritten");
  }
  if (transfers.length === 0) return 0;
  fs.mkdirSync(destinationBase, { recursive: true });
  let count = 0;
  const moved: typeof transfers = [];
  try {
    for (const transfer of transfers) {
      const files = fs.readdirSync(transfer.source).length;
      fs.renameSync(transfer.source, transfer.destination);
      moved.push(transfer);
      count += files;
    }
  } catch (error) {
    // Both locations share DATA_BASE. A failed rename must not become a lossy copy.
    for (const { source, destination } of moved.reverse()) fs.renameSync(destination, source);
    throw error;
  }
  return count;
}

/** 安全删除目录（检查在 base 范围内） */
function removeDirSafe(dir: string, base: string): number {
  const resolved = path.resolve(dir);
  if (!isSafeStoragePath(base, resolved)) return 0;
  if (!fs.existsSync(resolved)) return 0;
  try {
    const files = fs.readdirSync(resolved);
    let count = 0;
    for (const file of files) {
      fs.unlinkSync(path.join(resolved, file));
      count++;
    }
    fs.rmdirSync(resolved);
    return count;
  } catch {
    return 0;
  }
}

/** 递归删除单个目录及其内容 */
function removeDirWithin(rootDir: string, dir: string): number {
  const resolved = path.resolve(dir);
  if (!isSafeStoragePath(rootDir, resolved)) return 0;
  if (!fs.existsSync(resolved)) return 0;

  try {
    const files = fs.readdirSync(resolved);
    let count = 0;
    for (const file of files) {
      fs.unlinkSync(path.join(resolved, file));
      count++;
    }
    fs.rmdirSync(resolved);
    return count;
  } catch {
    return 0;
  }
}

/**
 * 清理 legacy public/output/ 中与 taskId 关联的导出目录。
 * 仅用于兼容旧导出路径；canonical 存储已迁移到 data/images + images registry。
 */
export function cleanupOutputDir(taskId: string): void {
  assertStorageSegment(taskId);
  const outputBase = path.join(process.cwd(), "public", "output");
  const mapFile = path.join(outputBase, ".dirmap.json");

  try {
    if (!fs.existsSync(mapFile)) return;

    const map: Record<string, string> = JSON.parse(fs.readFileSync(mapFile, "utf-8"));
    const dirName = map[taskId];
    if (!dirName) return;

    const targetDir = path.join(outputBase, dirName);
    const resolved = path.resolve(targetDir);

    // 安全检查：确保在 outputBase 内
    if (!isSafeStoragePath(outputBase, resolved)) return;

    if (fs.existsSync(resolved)) {
      const files = fs.readdirSync(resolved);
      for (const file of files) {
        fs.unlinkSync(path.join(resolved, file));
      }
      fs.rmdirSync(resolved);
    }

    // 从映射中移除
    delete map[taskId];
    fs.writeFileSync(mapFile, JSON.stringify(map, null, 2));
  } catch {
    // 清理失败不阻断主流程
  }
}

// ============================================================
// 孤儿图片扫描与清理
// ============================================================

export interface OrphanScanResult {
  /** 孤儿目录（旧迁移 _img* 格式，不被任何 task/char 引用） */
  orphanDirs: string[];
  /** legacy public/output 导出目录（仅兼容旧静态导出路径） */
  legacyOutputDirs: string[];
  /** 二进制重复文件对（_ref0 和 _ref0_v0 内容相同） */
  duplicates: Array<{ keep: string; remove: string; bytes: number }>;
  /** 总可回收字节数 */
  reclaimableBytes: number;
}

function scanLegacyOutputDirs(): { dirs: string[]; bytes: number } {
  if (!fs.existsSync(OUTPUT_BASE)) {
    return { dirs: [], bytes: 0 };
  }

  let bytes = 0;
  const dirs = fs.readdirSync(OUTPUT_BASE, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => {
      const dirPath = path.join(OUTPUT_BASE, entry.name);
      bytes += getDirSize(dirPath);
      return entry.name;
    });

  return { dirs, bytes };
}

function pruneLegacyOutputMap(): void {
  const mapFile = path.join(OUTPUT_BASE, ".dirmap.json");
  if (!fs.existsSync(mapFile)) return;

  try {
    const map: Record<string, string> = JSON.parse(fs.readFileSync(mapFile, "utf8"));
    const nextMap = Object.fromEntries(
      Object.entries(map).filter(([, dirName]) => {
        const targetDir = path.join(OUTPUT_BASE, dirName);
        return fs.existsSync(targetDir);
      }),
    );
    fs.writeFileSync(mapFile, JSON.stringify(nextMap, null, 2));
  } catch {
    // ignore malformed legacy map during cleanup
  }
}

/**
 * 扫描 data/images/ 中的孤儿文件和重复文件。
 * 仅扫描不删除，返回可清理项的报告。
 */
export function scanOrphanImages(knownPrefixes: Set<string>): OrphanScanResult {
  const result: OrphanScanResult = {
    orphanDirs: [],
    legacyOutputDirs: [],
    duplicates: [],
    reclaimableBytes: 0,
  };

  const legacyOutput = scanLegacyOutputDirs();
  result.legacyOutputDirs = legacyOutput.dirs;
  result.reclaimableBytes += legacyOutput.bytes;

  if (!fs.existsSync(IMAGE_BASE)) return result;

  const entries = fs.readdirSync(IMAGE_BASE, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirName = entry.name;
    const dirPath = path.join(IMAGE_BASE, dirName);

    // 检查旧迁移格式孤儿：char_{id}_img* 或 task_{id}_img* 独立子目录
    const imgMatch = dirName.match(/^(char_.+?|task_.+?)_img\d+$/);
    if (imgMatch) {
      // 提取 base prefix (char_{id} 或 task_{id})
      const basePrefix = imgMatch[1];
      // 如果对应的 ref 格式目录存在，说明已迁移，此目录是孤儿
      const refDirPath = path.join(IMAGE_BASE, basePrefix);
      const hasRefDir = fs.existsSync(refDirPath);

      if (hasRefDir || !knownPrefixes.has(dirName)) {
        const bytes = getDirSize(dirPath);
        result.orphanDirs.push(dirName);
        result.reclaimableBytes += bytes;
      }
      continue;
    }

    // 检查目录内的二进制重复：_ref{i}.png 和 _ref{i}_v{j}.png
    try {
      const files = fs.readdirSync(dirPath);
      const refFiles = files.filter((f) => /_ref\d+\.\w+$/.test(f));

      for (const refFile of refFiles) {
        const refBase = refFile.replace(/\.\w+$/, "");
        // 查找对应的 _v0 文件
        const vFile = files.find((f) => f.startsWith(refBase + "_v") && f !== refFile);
        if (!vFile) continue;

        const refPath = path.join(dirPath, refFile);
        const vPath = path.join(dirPath, vFile);
        const refBuf = fs.readFileSync(refPath);
        const vBuf = fs.readFileSync(vPath);

        if (refBuf.equals(vBuf)) {
          result.duplicates.push({
            keep: path.relative(IMAGE_BASE, vPath).replace(/\\/g, "/"),
            remove: path.relative(IMAGE_BASE, refPath).replace(/\\/g, "/"),
            bytes: refBuf.length,
          });
          result.reclaimableBytes += refBuf.length;
        }
      }
    } catch {
      // 跳过无法读取的目录
    }
  }

  return result;
}

/**
 * 执行清理：删除孤儿目录和重复文件。
 * @returns 删除的文件数和回收的字节数
 */
export function purgeOrphanImages(scan: OrphanScanResult): { deletedFiles: number; freedBytes: number } {
  _keyPathCache.clear();
  let deletedFiles = 0;
  let freedBytes = 0;

  // 删除孤儿目录（文件大小已在 scan 阶段计入 reclaimableBytes）
  for (const dirName of scan.orphanDirs) {
    const dirPath = path.join(IMAGE_BASE, dirName);
    if (!isSafeStoragePath(IMAGE_BASE, dirPath)) continue;
    const bytes = getDirSize(dirPath);
    const count = removeDirWithin(IMAGE_BASE, dirPath);
    deletedFiles += count;
    freedBytes += bytes;
  }

  for (const dirName of scan.legacyOutputDirs) {
    const dirPath = path.join(OUTPUT_BASE, dirName);
    if (!isSafeStoragePath(OUTPUT_BASE, dirPath)) continue;
    const bytes = getDirSize(dirPath);
    const count = removeDirWithin(OUTPUT_BASE, dirPath);
    deletedFiles += count;
    freedBytes += bytes;
  }

  // 删除重复文件
  for (const dup of scan.duplicates) {
    const absPath = path.join(IMAGE_BASE, dup.remove.replace(/\//g, path.sep));
    const resolved = path.resolve(absPath);
    if (!isSafeStoragePath(IMAGE_BASE, resolved)) continue;

    try {
      if (fs.existsSync(resolved)) {
        fs.unlinkSync(resolved);
        deletedFiles++;
        freedBytes += dup.bytes;
      }
    } catch {
      // 静默
    }
  }

  pruneLegacyOutputMap();

  return { deletedFiles, freedBytes };
}

/** 计算目录内所有文件的总大小 */
function getDirSize(dirPath: string): number {
  try {
    const files = fs.readdirSync(dirPath);
    return files.reduce((sum, file) => {
      try {
        const stat = fs.statSync(path.join(dirPath, file));
        return sum + stat.size;
      } catch {
        return sum;
      }
    }, 0);
  } catch {
    return 0;
  }
}
