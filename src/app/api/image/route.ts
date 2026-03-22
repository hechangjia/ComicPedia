import { NextRequest, NextResponse } from "next/server";
import { isUrlSafe, sanitizeProxyError, safeReadText, PROXY_TIMEOUT_MS } from "@/lib/security";

/** Timeout for fetching individual image URLs found in API responses */
const IMAGE_URL_FETCH_TIMEOUT_MS = 30_000;

/** Maximum size for a single image URL fetch (20MB) */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/**
 * Fetch an external image URL and convert to base64 data URI.
 * Returns null on failure — caller should keep the original URL as fallback.
 * Tries multiple strategies: original URL → https upgrade → browser-like UA.
 */
async function fetchImageAsBase64(url: string): Promise<string | null> {
  const urls = [url];
  // If http://, also try https:// as fallback
  if (url.startsWith("http://")) {
    urls.push(url.replace("http://", "https://"));
  }

  const uaVariants = [
    { "User-Agent": "Comicpedia/1.0", "Accept": "image/*,*/*" },
    { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" },
  ];

  for (const tryUrl of urls) {
    for (const headers of uaVariants) {
      try {
        const resp = await fetch(tryUrl, {
          headers,
          signal: AbortSignal.timeout(IMAGE_URL_FETCH_TIMEOUT_MS),
        });

        if (!resp.ok) continue; // try next variant

        const buffer = await resp.arrayBuffer();
        if (buffer.byteLength > MAX_IMAGE_BYTES) {
          console.warn(`[Image Proxy] Image too large: ${buffer.byteLength} bytes`);
          return null;
        }
        if (buffer.byteLength === 0) continue; // empty response, try next

        const ct = resp.headers.get("content-type") || "image/png";
        const base64 = Buffer.from(buffer).toString("base64");
        return `data:${ct};base64,${base64}`;
      } catch {
        // try next variant
      }
    }
  }

  console.warn("[Image Proxy] All fetch strategies failed for:", url);
  return null;
}

/** Check if a string is an external HTTP(S) URL (not a data URI or relative path) */
function isExternalUrl(s: string): boolean {
  return typeof s === "string" && (s.startsWith("http://") || s.startsWith("https://"));
}

/** Resolve a URL: if external, convert to base64; otherwise return as-is */
async function resolveUrl(url: string): Promise<string> {
  if (!isExternalUrl(url)) return url;
  return (await fetchImageAsBase64(url)) ?? url;
}

/**
 * Post-process API response JSON: convert any external image URLs to base64 data URIs.
 * This prevents CSP from blocking external URLs when the client tries to display them.
 * Handles all major API response formats (OpenAI images, chat completions, Responses API).
 */
 
async function resolveExternalImageUrls(data: Record<string, any>): Promise<void> {
  // 1. OpenAI images API: data[].url
  if (Array.isArray(data.data)) {
    for (const item of data.data) {
      if (item && typeof item.url === "string" && isExternalUrl(item.url)) {
        const resolved = await fetchImageAsBase64(item.url);
        if (resolved) {
          // Convert to b64_json format for consistency
          item.url = resolved;
        }
      }
    }
  }

  // 2. Chat completions: choices[].message.content
  if (Array.isArray(data.choices)) {
    for (const choice of data.choices) {
      const msg = choice?.message;
      if (!msg) continue;

      if (typeof msg.content === "string") {
        const trimmed = msg.content.trim();
        // Content is a direct URL
        if (isExternalUrl(trimmed)) {
          msg.content = await resolveUrl(trimmed);
        } else {
          // Content may contain embedded image URLs (markdown etc.)
          const urlMatch = trimmed.match(/(https?:\/\/[^\s"'<>)]+\.(png|jpe?g|gif|webp|bmp|tiff?)(\?[^\s"'<>)]*)?)/i);
          if (urlMatch) {
            const resolved = await fetchImageAsBase64(urlMatch[0]);
            if (resolved) {
              msg.content = trimmed.replace(urlMatch[0], resolved);
            }
          }
        }
      }

      // Multimodal content array
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (!part || typeof part !== "object") continue;
          // image_url: { url: "..." }
          if (part.image_url && typeof part.image_url === "object" && typeof part.image_url.url === "string") {
            part.image_url.url = await resolveUrl(part.image_url.url);
          }
          // image_url as direct string
          if (typeof part.image_url === "string" && isExternalUrl(part.image_url)) {
            part.image_url = await resolveUrl(part.image_url);
          }
          // type: "image", url: "..."
          if (part.type === "image" && typeof part.url === "string") {
            part.url = await resolveUrl(part.url);
          }
        }
      }
    }
  }

  // 3. Responses API: output[].content[*]
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

/**
 * Image generation API proxy route.
 * Forwards requests to external image generation APIs (bypasses browser CORS).
 * Includes SSRF protection, timeout control, response size limits, error sanitization.
 * Post-processes responses to convert external image URLs to base64 data URIs.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { targetUrl, headers: clientHeaders, payload } = body;

    if (!targetUrl) {
      return NextResponse.json({ error: "Missing targetUrl" }, { status: 400 });
    }

    // SSRF protection
    const urlCheck = isUrlSafe(targetUrl);
    if (!urlCheck.safe) {
      return NextResponse.json(
        { error: urlCheck.reason },
        { status: 400 },
      );
    }

    // Build forwarding headers
    const forwardHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (clientHeaders) {
      if (clientHeaders.Authorization) {
        forwardHeaders["Authorization"] = clientHeaders.Authorization;
      }
    }

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: forwardHeaders,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });

    const contentType = response.headers.get("content-type")?.toLowerCase() || "";

    if (!response.ok) {
      const rawText = await safeReadText(response).catch(() => "");
      console.error("[Image Proxy] Upstream error:", response.status, rawText.slice(0, 300));

      return NextResponse.json(
        { error: sanitizeProxyError(response.status), status: response.status },
        { status: response.status },
      );
    }

    const rawText = await safeReadText(response);

    // JSON response — parse, resolve external image URLs, return
    if (contentType.includes("application/json")) {
      try {
        const data = JSON.parse(rawText);

        // Server-side: convert external image URLs to base64 before sending to client
        // Wrapped in try-catch — resolution failures must not crash the route
        try {
          await resolveExternalImageUrls(data);
        } catch (resolveErr) {
          console.warn("[Image Proxy] resolveExternalImageUrls failed, returning raw URLs:", resolveErr instanceof Error ? resolveErr.message : resolveErr);
        }

        return NextResponse.json(data);
      } catch {
        return new NextResponse(rawText, {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        });
      }
    }

    return new NextResponse(rawText, {
      status: 200,
      headers: { "Content-Type": contentType || "text/plain" },
    });
  } catch (error) {
    console.error("[Image Proxy] Error:", error);

    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json({ error: "Request timeout, please try again" }, { status: 504 });
    }

    return NextResponse.json(
      { error: "Proxy request failed" },
      { status: 500 },
    );
  }
}
