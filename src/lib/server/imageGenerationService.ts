import { isUrlSafe, MAX_RESPONSE_BYTES, PROXY_TIMEOUT_MS, safeReadText, sanitizeProxyError } from "@/lib/security";

const IMAGE_URL_FETCH_TIMEOUT_MS = 30_000;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export interface ForwardImageGenerationRequestInput {
  targetUrl: string;
  headers?: Record<string, string>;
  payload?: unknown;
}

export class ImageGenerationServiceError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ImageGenerationServiceError";
    this.status = status;
  }
}

function isExternalUrl(s: string): boolean {
  return typeof s === "string" && (s.startsWith("http://") || s.startsWith("https://"));
}

async function fetchImageAsBase64(url: string): Promise<string | null> {
  const urls = [url];
  if (url.startsWith("http://")) {
    urls.push(url.replace("http://", "https://"));
  }

  const uaVariants = [
    { "User-Agent": "Comicpedia/1.0", Accept: "image/*,*/*" },
    { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" },
  ];

  for (const tryUrl of urls) {
    for (const headers of uaVariants) {
      try {
        const resp = await fetch(tryUrl, {
          headers,
          signal: AbortSignal.timeout(IMAGE_URL_FETCH_TIMEOUT_MS),
        });

        if (!resp.ok) continue;

        const buffer = await resp.arrayBuffer();
        if (buffer.byteLength > MAX_IMAGE_BYTES) {
          console.warn(`[Image Proxy] Image too large: ${buffer.byteLength} bytes`);
          return null;
        }
        if (buffer.byteLength === 0) continue;

        const ct = resp.headers.get("content-type") || "image/png";
        const base64 = Buffer.from(buffer).toString("base64");
        return `data:${ct};base64,${base64}`;
      } catch {
        // try next strategy
      }
    }
  }

  console.warn("[Image Proxy] All fetch strategies failed for:", url);
  return null;
}

async function resolveUrl(url: string): Promise<string> {
  if (!isExternalUrl(url)) return url;
  return (await fetchImageAsBase64(url)) ?? url;
}

async function resolveExternalImageUrls(data: Record<string, any>): Promise<void> {
  if (Array.isArray(data.data)) {
    for (const item of data.data) {
      if (item && typeof item.url === "string" && isExternalUrl(item.url)) {
        const resolved = await fetchImageAsBase64(item.url);
        if (resolved) item.url = resolved;
      }
    }
  }

  if (Array.isArray(data.choices)) {
    for (const choice of data.choices) {
      const msg = choice?.message;
      if (!msg) continue;

      if (typeof msg.content === "string") {
        const trimmed = msg.content.trim();
        if (isExternalUrl(trimmed)) {
          msg.content = await resolveUrl(trimmed);
        } else {
          const urlMatch = trimmed.match(/(https?:\/\/[^\s"'<>)]+\.(png|jpe?g|gif|webp|bmp|tiff?)(\?[^\s"'<>)]*)?)/i);
          if (urlMatch) {
            const resolved = await fetchImageAsBase64(urlMatch[0]);
            if (resolved) {
              msg.content = trimmed.replace(urlMatch[0], resolved);
            }
          }
        }
      }

      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (!part || typeof part !== "object") continue;
          if (part.image_url && typeof part.image_url === "object" && typeof part.image_url.url === "string") {
            part.image_url.url = await resolveUrl(part.image_url.url);
          }
          if (typeof part.image_url === "string" && isExternalUrl(part.image_url)) {
            part.image_url = await resolveUrl(part.image_url);
          }
          if (part.type === "image" && typeof part.url === "string") {
            part.url = await resolveUrl(part.url);
          }
        }
      }
    }
  }

  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (!item || typeof item !== "object") continue;
      if (typeof item.url === "string") {
        item.url = await resolveUrl(item.url);
      }
      if (Array.isArray(item.content)) {
        for (const part of item.content) {
          if (part && typeof part === "object" && typeof part.url === "string") {
            part.url = await resolveUrl(part.url);
          }
        }
      }
    }
  }
}

export async function forwardImageGenerationRequest(input: ForwardImageGenerationRequestInput): Promise<Record<string, unknown> | string> {
  const { targetUrl, headers: clientHeaders, payload } = input;
  const urlCheck = isUrlSafe(targetUrl);
  if (!urlCheck.safe) {
    throw new ImageGenerationServiceError(urlCheck.reason || "Invalid target URL", 400);
  }

  const forwardHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (clientHeaders?.Authorization) {
    forwardHeaders.Authorization = clientHeaders.Authorization;
  }

  const response = await fetch(targetUrl, {
    method: "POST",
    headers: forwardHeaders,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
  });

  const contentType = response.headers.get("content-type")?.toLowerCase() || "";
  if (!response.ok) {
    const rawText = await safeReadText(response, MAX_RESPONSE_BYTES).catch(() => "");
    console.error("[Image Proxy] Upstream error:", response.status, rawText.slice(0, 300));
    throw new ImageGenerationServiceError(sanitizeProxyError(response.status), response.status);
  }

  const rawText = await safeReadText(response, MAX_RESPONSE_BYTES);
  if (!contentType.includes("application/json")) {
    return rawText;
  }

  try {
    const data = JSON.parse(rawText) as Record<string, unknown>;
    try {
      await resolveExternalImageUrls(data);
    } catch (resolveErr) {
      console.warn("[Image Proxy] resolveExternalImageUrls failed, returning raw URLs:", resolveErr instanceof Error ? resolveErr.message : resolveErr);
    }
    return data;
  } catch {
    return rawText;
  }
}
