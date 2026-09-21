import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { openDatabase } from "../databaseConnection";
import { getDataDirectory } from "../dataDirectory";
import { getImagePath } from "../db";
import { readImageByKey, resolveStoredImagePath } from "../imageStorage";
import { isSafeStoragePath, isStorageSegment } from "../storageBoundary";
import { ArtworkRepository } from "./repository";
import { ARCHIVE_LIMITS, ArtworkArchiveError, buildArtworkArchive, imageMime, mapArtworkValue, readArtworkArchive, type ArtworkRecords } from "./archive";

function repository() {
  const db = openDatabase(path.join(getDataDirectory(), "comicpedia.db"));
  return { repo: new ArtworkRepository(db), close: () => db.close() };
}
function loadMedia(reference: string) {
  let key: string;
  if (reference.startsWith("file://")) key = reference.slice(7);
  else { try { key = decodeURIComponent(reference.slice("/api/images/".length)); } catch { throw new ArtworkArchiveError("本地图片引用无效"); } }
  if (!isStorageSegment(key)) throw new ArtworkArchiveError("本地图片键无效");
  const registered = getImagePath(key);
  const filename = registered ? resolveStoredImagePath(registered) : readImageByKey(key)?.absPath;
  if (!filename) throw new ArtworkArchiveError("本地图片缺失或路径不安全");
  const fd = fs.openSync(filename, "r");
  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.size > ARCHIVE_LIMITS.assetBytes) throw new ArtworkArchiveError("图片文件类型或大小超过限制");
    const buffer = Buffer.alloc(before.size + 1); let size = 0;
    while (size < buffer.length) { const read = fs.readSync(fd, buffer, size, buffer.length - size, null); if (!read) break; size += read; }
    const after = fs.fstatSync(fd);
    if (size !== before.size || before.mtimeMs !== after.mtimeMs) throw new ArtworkArchiveError("图片在备份过程中发生变化，请重试", 409);
    const bytes = buffer.subarray(0, size);
    return { bytes, mime: imageMime(bytes) };
  } finally { fs.closeSync(fd); }
}

export async function exportArtworkArchive() {
  const { repo, close } = repository();
  try {
    const snapshot = repo.snapshot();
    repo.validate(snapshot.records);
    const seen = new Map<string, Buffer>();
    const archive = await buildArtworkArchive(snapshot.records, async reference => {
      const media = loadMedia(reference); seen.set(reference, media.bytes); return media;
    });
    if (repo.snapshot().revision !== snapshot.revision) throw new ArtworkArchiveError("数据在备份期间已改变，请重试", 409);
    for (const [reference, bytes] of seen) if (!loadMedia(reference).bytes.equals(bytes)) throw new ArtworkArchiveError("图片在备份期间已改变，请重试", 409);
    return archive;
  } finally { close(); }
}
export async function previewArtworkArchive(bytes: Buffer) {
  const parsed = await readArtworkArchive(bytes);
  const { repo, close } = repository();
  try { return { ...repo.preview(parsed.manifest.records), assets: parsed.assets.size, assetBytes: [...parsed.assets.values()].reduce((sum, asset) => sum + asset.bytes.length, 0), exportedAt: parsed.manifest.exportedAt }; }
  finally { close(); }
}
export async function restoreArtworkArchive(bytes: Buffer, revision: string, replace = false) {
  const parsed = await readArtworkArchive(bytes);
  const { repo, close } = repository();
  const base = path.join(getDataDirectory(), "images");
  const name = `restore_${randomUUID().replace(/-/g, "")}`;
  const directory = path.join(base, name);
  let published = false, created = false;
  try {
    const preview = repo.preview(parsed.manifest.records);
    if (preview.revision !== revision) throw new ArtworkArchiveError("恢复预览已过期，请重新预览", 409);
    if (!replace && Object.values(preview.conflicts).some(ids => ids.length)) throw new ArtworkArchiveError("存在同 ID 数据，需要明确确认替换", 409);
    if (!isSafeStoragePath(base, directory)) throw new ArtworkArchiveError("恢复图片目录不安全");
    fs.mkdirSync(base, { recursive: true }); fs.mkdirSync(directory); created = true;
    const mapped = new Map<string, string>();
    const images = [];
    for (const [assetName, asset] of parsed.assets) {
      const ext = assetName.split(".").pop()!;
      const sha = path.basename(assetName, `.${ext}`);
      // _panel delimiter keeps readImageByKey's existing directory mapping valid.
      const key = `${name}_panel_${sha}`;
      const filename = `${key}.${ext}`;
      const target = path.join(directory, filename);
      if (!isSafeStoragePath(base, target)) throw new ArtworkArchiveError("恢复图片路径不安全");
      fs.writeFileSync(target, asset.bytes, { flag: "wx" });
      mapped.set(`asset://${assetName}`, `file://${key}`);
      images.push({ key, filePath: `data/images/${name}/${filename}`, size: asset.bytes.length });
    }
    const records = await mapArtworkValue(parsed.manifest.records, async text => mapped.get(text) ?? text) as ArtworkRecords;
    const result = repo.restore(records, images, revision, replace);
    published = true;
    return result;
  } finally {
    close();
    if (created && !published && isSafeStoragePath(base, directory)) fs.rmSync(directory, { recursive: true });
  }
}
