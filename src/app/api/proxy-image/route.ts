import { NextRequest, NextResponse } from "next/server";
import { isUrlSafe, sanitizeProxyError } from "@/lib/security";

/** Image download timeout — 30s is sufficient for fetching a single image */
const IMAGE_DOWNLOAD_TIMEOUT_MS = 30_000;

/** Maximum image size: 20MB */
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

/** UA variants to try — some hosts reject non-browser user agents */
const UA_VARIANTS = [
  { "User-Agent": "Comicpedia/1.0", "Accept": "image/*,*/*" },
  { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" },
];

/**
 * Try fetching the URL with multiple strategies (UA variants + https upgrade).
 * Returns the first successful Response, or null if all fail.
 */
async function tryFetch(url: string): Promise<{ response: Response; usedUrl: string } | null> {
  const urls = [url];
  if (url.startsWith("http://")) {
    urls.push(url.replace("http://", "https://"));
  }

  for (const tryUrl of urls) {
    for (const headers of UA_VARIANTS) {
      try {
        const resp = await fetch(tryUrl, {
          headers,
          signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS),
        });
        if (resp.ok) return { response: resp, usedUrl: tryUrl };
        // Consume body to avoid memory leak, then try next
        await resp.arrayBuffer().catch(() => {});
      } catch {
        // try next
      }
    }
  }
  return null;
}

/**
 * Image download proxy — fetches external image URLs server-side.
 * Solves CSP (connect-src) and CORS issues when the browser needs to
 * convert an external image URL to base64.
 * Tries multiple strategies: original URL, https upgrade, browser-like UA.
 */
export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    // SSRF protection
    const urlCheck = isUrlSafe(url);
    if (!urlCheck.safe) {
      return NextResponse.json({ error: urlCheck.reason }, { status: 400 });
    }

    console.log("[Proxy-Image] Fetching:", url);

    const result = await tryFetch(url);

    if (!result) {
      console.warn(`[Proxy-Image] All fetch strategies failed for ${url}`);
      return NextResponse.json(
        { error: sanitizeProxyError(403) },
        { status: 502 },
      );
    }

    const { response } = result;
    const contentType = response.headers.get("content-type") || "image/png";

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_IMAGE_SIZE) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json({ error: "Image download timeout" }, { status: 504 });
    }
    console.error("[Proxy-Image] Fetch error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 500 });
  }
}
