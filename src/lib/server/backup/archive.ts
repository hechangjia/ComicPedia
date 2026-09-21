import JSZip from "jszip";
import { createHash } from "node:crypto";
import { isStorageSegment } from "../storageBoundary";

export const ARTWORK_TABLES = ["tasks", "characters", "series", "character_relations"] as const;
export type ArtworkTable = typeof ARTWORK_TABLES[number];
export type ArtworkRecords = Record<ArtworkTable, Record<string, unknown>[]>;
export interface ArtworkAsset { bytes: Buffer; mime: string }
export interface ArtworkManifest {
  format: "comicpedia-artwork";
  version: 2;
  exportedAt: string;
  records: ArtworkRecords;
  assets: Array<{ name: string; sha256: string; bytes: number; mime: string }>;
}
export class ArtworkArchiveError extends Error {
  constructor(message: string, public status = 400) { super(message); this.name = "ArtworkArchiveError"; }
}
export const ARCHIVE_LIMITS = { archiveBytes: 100 * 1024 * 1024, metadataBytes: 8 * 1024 * 1024, assetBytes: 20 * 1024 * 1024, totalBytes: 256 * 1024 * 1024, entries: 2050, records: 50000 };
type Limits = typeof ARCHIVE_LIMITS;
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const ASSET_NAME = /^assets\/[a-f0-9]{64}\.(png|jpg|webp|gif)$/;
const MEDIA_FIELDS = new Set(["imageUrl", "avatarUrl", "coverUrl", "avatar_url", "cover_url", "referenceImage", "referenceImages"]);
const OMIT_FIELDS = /^(api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|password|secret|serverScriptReplay|serverScriptRunId|reviewExecutionId)$/i;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function fail(message: string): never { throw new ArtworkArchiveError(message); }

export function imageMime(bytes: Buffer): string {
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString("ascii"))) return "image/gif";
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return fail("图片格式不支持或内容损坏");
}
const extension = (mime: string) => mime === "image/jpeg" ? "jpg" : mime.slice(6);

function validateRecords(value: unknown): asserts value is ArtworkRecords {
  if (!object(value) || Object.keys(value).length !== ARTWORK_TABLES.length) fail("归档数据表无效");
  let count = 0;
  for (const table of ARTWORK_TABLES) {
    const rows = value[table];
    if (!Array.isArray(rows)) fail("归档数据表无效");
    count += rows.length;
    if (count > ARCHIVE_LIMITS.records) fail("归档记录数量超过限制");
    const ids = new Set<string>();
    for (const row of rows) {
      if (!object(row) || !isStorageSegment(row.id) || ids.has(row.id)) fail("归档记录 ID 无效或重复");
      ids.add(row.id);
    }
  }
}

/** Walk structured fields, never serialized SQL/JSON strings or untrusted filesystem paths. */
export async function mapArtworkValue(value: unknown, transform: (text: string, field: string) => Promise<string>, dropSecrets = false, field = "", depth = 0): Promise<unknown> {
  if (depth > 64) fail("归档嵌套深度超过限制");
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return transform(value, field);
  if (Array.isArray(value)) {
    const result = [];
    for (const item of value) result.push(await mapArtworkValue(item, transform, dropSecrets, field, depth + 1));
    return result;
  }
  if (object(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) fail("归档含不安全字段");
      if (OMIT_FIELDS.test(key)) {
        if (!dropSecrets) fail("归档不能包含凭据或执行令牌");
        continue;
      }
      result[key] = await mapArtworkValue(item, transform, dropSecrets, key, depth + 1);
    }
    return result;
  }
  return value;
}

function mediaReference(text: string, field: string): boolean {
  return text.startsWith("file://") || text.startsWith("/api/images/") || text.startsWith("data:image/") || text.startsWith("asset://") || MEDIA_FIELDS.has(field) && text.length > 0;
}

export async function buildArtworkArchive(records: ArtworkRecords, load: (reference: string) => Promise<ArtworkAsset | null>): Promise<Buffer> {
  validateRecords(records);
  const assets = new Map<string, ArtworkAsset>();
  const references = new Map<string, string>();
  let total = 0;
  const converted = await mapArtworkValue(records, async (text, field) => {
    if (!mediaReference(text, field)) return text;
    if (/^https?:/i.test(text)) fail("归档包含外部图片，请先将图片保存到本地后再备份");
    if (references.has(text)) return references.get(text)!;
    let asset: ArtworkAsset | null;
    if (text.startsWith("data:image/")) {
      if (text.length > ARCHIVE_LIMITS.assetBytes * 1.4) fail("单张图片超过限制");
      const match = text.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/);
      if (!match) fail("内嵌图片格式无效");
      asset = { mime: match[1], bytes: Buffer.from(match[2], "base64") };
    } else {
      if (!text.startsWith("file://") && !text.startsWith("/api/images/")) fail("图片引用不能移植，请先保存到本地");
      asset = await load(text);
    }
    if (!asset) fail("引用的本地图片不存在，备份已中止");
    if (asset.bytes.length > ARCHIVE_LIMITS.assetBytes) fail("单张图片超过限制");
    if (imageMime(asset.bytes) !== asset.mime) fail("图片类型与内容不匹配");
    const name = `assets/${digest(asset.bytes)}.${extension(asset.mime)}`;
    if (!assets.has(name)) {
      total += asset.bytes.length;
      if (total > ARCHIVE_LIMITS.totalBytes || assets.size >= ARCHIVE_LIMITS.entries - 2) fail("归档图片总量超过限制");
      assets.set(name, asset);
    }
    const ref = `asset://${name}`;
    references.set(text, ref);
    return ref;
  }, true) as ArtworkRecords;
  const manifest: ArtworkManifest = { format: "comicpedia-artwork", version: 2, exportedAt: new Date().toISOString(), records: converted,
    assets: [...assets].map(([name, asset]) => ({ name, sha256: digest(asset.bytes), bytes: asset.bytes.length, mime: asset.mime })) };
  const metadata = Buffer.from(JSON.stringify(manifest));
  if (metadata.length > ARCHIVE_LIMITS.metadataBytes) fail("归档元数据超过限制");
  const zip = new JSZip(); zip.file("manifest.json", metadata);
  for (const [name, asset] of assets) zip.file(name, asset.bytes, { createFolders: false });
  // STORE avoids costly recompression of images and yields a predictable byte budget.
  if (metadata.length + total + (assets.size + 1) * 512 > ARCHIVE_LIMITS.archiveBytes) fail("归档超过 100 MiB 限制");
  return zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
}

/** Inspect raw central entries before JSZip can sanitize paths or hide duplicate filenames. */
function validateZipDirectory(bytes: Buffer, limits: Limits): void {
  if (bytes.length > limits.archiveBytes) fail("归档文件超过大小限制");
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
  }
  if (end < 0) fail("无效 ZIP 目录");
  const count = bytes.readUInt16LE(end + 10), offset = bytes.readUInt32LE(end + 16), size = bytes.readUInt32LE(end + 12);
  if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || bytes.readUInt16LE(end + 8) !== count || count > limits.entries || offset + size !== end) fail("ZIP 目录或数量超过限制");
  const names = new Set<string>(); let position = offset, total = 0;
  for (let i = 0; i < count; i++) {
    if (position + 46 > end || bytes.readUInt32LE(position) !== 0x02014b50) fail("ZIP 目录损坏");
    const flags = bytes.readUInt16LE(position + 8), method = bytes.readUInt16LE(position + 10);
    const uncompressed = bytes.readUInt32LE(position + 24), length = bytes.readUInt16LE(position + 28);
    const extra = bytes.readUInt16LE(position + 30), comment = bytes.readUInt16LE(position + 32);
    if (position + 46 + length + extra + comment > end) fail("ZIP 目录越界");
    const name = bytes.subarray(position + 46, position + 46 + length).toString("utf8");
    if (names.has(name) || (name !== "manifest.json" && name !== "assets/" && !ASSET_NAME.test(name)) || flags & 1 || ![0, 8].includes(method)) fail("ZIP 含重复、不支持或不安全条目");
    names.add(name); total += uncompressed;
    const max = name === "manifest.json" ? limits.metadataBytes : limits.assetBytes;
    if (uncompressed > max || total > limits.totalBytes) fail("ZIP 解压大小超过限制");
    position += 46 + length + extra + comment;
  }
  if (position !== end || !names.has("manifest.json")) fail("ZIP 清单缺失或目录不完整");
}
async function readBounded(entry: JSZip.JSZipObject, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const stream = entry.nodeStream();
    const chunks: Buffer[] = []; let size = 0, stopped = false;
    stream.on("data", (chunk: Buffer) => {
      if (stopped) return;
      size += chunk.length;
      if (size > max) {
        stopped = true; stream.pause();
        (stream as NodeJS.ReadableStream & { destroy(): void }).destroy();
        reject(new ArtworkArchiveError("ZIP 实际解压大小超过限制"));
      } else chunks.push(chunk);
    });
    stream.on("error", () => reject(new ArtworkArchiveError("ZIP 图片数据损坏或格式不支持")));
    stream.on("end", () => { if (!stopped) resolve(Buffer.concat(chunks, size)); });
  });
}
export async function readArtworkArchive(bytes: Buffer, overrides: Partial<Limits> = {}) {
  const limits = { ...ARCHIVE_LIMITS, ...overrides };
  validateZipDirectory(bytes, limits);
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(bytes); } catch { return fail("ZIP 数据损坏或格式不支持"); }
  let value: unknown;
  try { value = JSON.parse((await readBounded(zip.file("manifest.json")!, limits.metadataBytes)).toString("utf8")); }
  catch (error) { if (error instanceof ArtworkArchiveError) throw error; return fail("归档清单 JSON 无效"); }
  if (!object(value) || value.format !== "comicpedia-artwork" || value.version !== 2 || typeof value.exportedAt !== "string" || !Number.isFinite(Date.parse(value.exportedAt)) || !Array.isArray(value.assets)) fail("不支持的归档版本或清单");
  validateRecords(value.records);
  const manifest = value as unknown as ArtworkManifest;
  const assets = new Map<string, ArtworkAsset>(); let total = 0;
  for (const item of manifest.assets) {
    if (!object(item) || typeof item.name !== "string" || typeof item.mime !== "string" || !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(item.mime) || typeof item.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(item.sha256) || !ASSET_NAME.test(item.name) || assets.has(item.name) || !Number.isSafeInteger(item.bytes) || item.bytes <= 0 || item.bytes > limits.assetBytes) fail("图片清单无效");
    const entry = zip.file(item.name); if (!entry) fail("归档缺少图片文件");
    const data = await readBounded(entry, Math.min(item.bytes, limits.assetBytes)); total += data.length;
    if (total > limits.totalBytes) fail("归档解压总量超过限制");
    if (data.length !== item.bytes || digest(data) !== item.sha256 || item.name !== `assets/${item.sha256}.${extension(item.mime)}` || imageMime(data) !== item.mime) fail("图片长度、类型或 SHA-256 校验失败");
    assets.set(item.name, { bytes: data, mime: item.mime });
  }
  const actualFiles = Object.values(zip.files).filter(entry => !entry.dir);
  if (actualFiles.length !== assets.size + 1) fail("归档含未声明文件");
  const referenced = new Set<string>();
  await mapArtworkValue(manifest.records, async (text, field) => {
    if (!mediaReference(text, field)) return text;
    if (!text.startsWith("asset://") || !assets.has(text.slice(8))) fail("归档图片引用缺失或指向外部资源");
    referenced.add(text.slice(8)); return text;
  });
  if (referenced.size !== assets.size) fail("归档含未引用的图片");
  return { manifest, assets };
}
