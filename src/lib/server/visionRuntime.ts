import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { readImageByKey } from "./imageStorage";
import { modelEndpoint } from "../providers/endpoints";
import { isUrlSafe, safeReadText, PROXY_TIMEOUT_MS } from "../security";
import type { VisionRuntime } from "../visionRuntime";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MIME = /^image\/(png|jpeg|webp|gif)$/;

function localKey(url: string): string | null {
  if (url.startsWith("file://")) return url.slice(7);
  const match = url.match(/^\/api\/images\/([^/?#]+)(?:\?[^#]*)?$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    throw new Error("无效的本地图片引用");
  }
}

async function readLocal(
  key: string,
): Promise<{ data: string; digest: string }> {
  const stored = readImageByKey(key);
  if (!stored || !MIME.test(stored.mime))
    throw new Error("本地复审图片不存在或格式不支持");
  const handle = await fs.open(stored.absPath, "r");
  try {
    const stat = await handle.stat();
    if (stat.size > MAX_IMAGE_BYTES) throw new Error("复审图片超过 20 MiB");
    // Bound allocation even if another writer grows the file after stat().
    const buffer = Buffer.alloc(Math.min(stat.size + 1, MAX_IMAGE_BYTES + 1));
    let size = 0;
    while (size < buffer.length) {
      const read = await handle.read(buffer, size, buffer.length - size, null);
      if (!read.bytesRead) break;
      size += read.bytesRead;
    }
    if (size !== stat.size) throw new Error("复审图片读取期间已变更");
    const bytes = buffer.subarray(0, size);
    return {
      data: `data:${stored.mime};base64,${bytes.toString("base64")}`,
      digest: createHash("sha256").update(bytes).digest("hex"),
    };
  } finally {
    await handle.close();
  }
}

/** Durable review only consumes stored/inline images; no arbitrary remote URL fetch. */
export function createServerVisionRuntime(
  checkpoint: () => void,
): VisionRuntime & {
  verifyImages(): Promise<void>;
  captureImages(urls: string[]): Promise<string>;
} {
  const versions = new Map<string, string>();
  const sizes = new Map<string, number>();
  const budget = (url: string, size: number) => {
    sizes.set(url, size);
    if (
      [...sizes.values()].reduce((sum, value) => sum + value, 0) >
      128 * 1024 * 1024
    ) {
      throw new Error("复审图片合计超过 128 MiB，请减少分镜");
    }
  };
  return {
    strict: true,
    checkpoint,
    async resolveImage(url) {
      checkpoint();
      if (url.startsWith("data:")) {
        const match = url.match(
          /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/,
        );
        if (!match || match[2].length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4)
          throw new Error("无效或过大的复审图片");
        budget(url, Math.floor((match[2].length * 3) / 4));
        return url;
      }
      const key = localKey(url);
      if (!key)
        throw new Error("服务端复审需要已保存的本地图片，请先将图片保存到作品");
      const image = await readLocal(key);
      checkpoint();
      const previous = versions.get(key);
      if (previous && previous !== image.digest)
        throw new Error("复审图片内容已变更，请重新开始复审");
      versions.set(key, image.digest);
      budget(
        url,
        Math.floor(
          (image.data.slice(image.data.indexOf(",") + 1).length * 3) / 4,
        ),
      );
      return image.data;
    },
    async captureImages(urls) {
      const hash = createHash("sha256");
      for (const url of urls) {
        const data = await this.resolveImage(url);
        if (!data) throw new Error("复审图片无法读取");
        hash.update(url).update("\0").update(data).update("\0");
      }
      return hash.digest("hex");
    },
    async verifyImages() {
      for (const [key, digest] of versions) {
        checkpoint();
        if ((await readLocal(key)).digest !== digest)
          throw new Error("复审图片内容已变更，请重新开始复审");
      }
      checkpoint();
    },
    async request(config, payload) {
      checkpoint();
      const target = modelEndpoint(
        config.apiUrl!,
        config.provider === "anthropic" ? "messages" : "chat",
      );
      const safe = isUrlSafe(target);
      if (!safe.safe) throw new Error(safe.reason);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (config.provider === "anthropic") {
        headers["anthropic-version"] = "2023-06-01";
        if (config.apiKey) headers["x-api-key"] = config.apiKey;
      } else if (config.apiKey)
        headers.Authorization = `Bearer ${config.apiKey}`;
      const response = await fetch(target, {
        method: "POST",
        redirect: "error",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
      });
      try {
        checkpoint();
        if (!response.ok)
          throw new Error(`视觉模型请求失败（HTTP ${response.status}）`);
        const raw = await safeReadText(response, 2 * 1024 * 1024);
        checkpoint();
        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          throw new Error("视觉模型返回的 JSON 无效");
        }
        const content =
          data.choices?.[0]?.message?.content ?? data.content?.[0]?.text;
        if (typeof content !== "string" || !content.trim())
          throw new Error("视觉模型未返回文本结果");
        return content;
      } finally {
        if (!response.bodyUsed) await response.body?.cancel().catch(() => {});
      }
    },
  };
}
