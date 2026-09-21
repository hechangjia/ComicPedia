import { timingSafeEqual } from "node:crypto";
import { ARCHIVE_LIMITS, ArtworkArchiveError } from "./archive";

/** Local single-user mode unless ADMIN_TOKEN is configured; never enables CORS. */
export function authorizeBackup(request: Request) {
  const origin = request.headers.get("origin");
  // NextURL canonicalizes loopback names. Host is the actual browser authority;
  // never trust arbitrary X-Forwarded-Host or equate different loopback origins.
  const url = new URL(request.url), host = request.headers.get("host");
  let expectedOrigin = url.origin;
  if (host) {
    if (/[\s/@\\?#,]/.test(host)) throw new ArtworkArchiveError("不允许跨站备份请求",403);
    try { expectedOrigin = new URL(`${url.protocol}//${host}`).origin; }
    catch { throw new ArtworkArchiveError("不允许跨站备份请求",403); }
  }
  if (request.headers.get("sec-fetch-site") === "cross-site" || origin && origin !== expectedOrigin) throw new ArtworkArchiveError("不允许跨站备份请求", 403);
  const expected = process.env.ADMIN_TOKEN;
  if (expected) {
    const supplied = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1] ?? "";
    const a = Buffer.from(supplied), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a,b)) throw new ArtworkArchiveError("Unauthorized",401);
  }
}
export function backupError(error: unknown): Response {
  return Response.json({ error: error instanceof ArtworkArchiveError ? error.message : "备份操作失败，请检查服务端存储状态后重试" }, { status: error instanceof ArtworkArchiveError ? error.status : 500, headers:{"Cache-Control":"no-store"} });
}
export async function readArchiveBody(request: Request, limit = ARCHIVE_LIMITS.archiveBytes): Promise<Buffer> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw new ArtworkArchiveError("上传归档超过大小限制",413);
  if (!request.body) throw new ArtworkArchiveError("归档文件为空");
  const reader = request.body.getReader(), chunks: Buffer[] = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new ArtworkArchiveError("上传归档超过大小限制",413); }
      chunks.push(Buffer.from(part.value));
    }
  } finally { reader.releaseLock(); }
  if (!size) throw new ArtworkArchiveError("归档文件为空");
  return Buffer.concat(chunks,size);
}
