import { ReferenceImageEntry } from "./types";

/**
 * Check if a URL is external (not same-origin, not data URI, not relative path).
 */
function isExternalUrl(url: string): boolean {
  if (url.startsWith("data:") || url.startsWith("/") || url.startsWith("blob:")) return false;
  try {
    const parsed = new URL(url);
    if (typeof window !== "undefined") {
      return parsed.origin !== window.location.origin;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * 将图片 URL 转换为 Base64 data URI。
 * 如果输入已经是 data URI，直接返回。
 * External URLs are fetched through the server-side proxy to avoid CSP and CORS issues.
 * 转换失败时降级返回原 URL。
 */
export async function urlToBase64(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;

  try {
    let response: Response;

    if (isExternalUrl(url)) {
      // Route external URLs through server proxy to bypass CSP and CORS
      response = await fetch("/api/proxy-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
    } else {
      response = await fetch(url);
    }

    if (!response.ok) {
      console.warn(`[urlToBase64] Fetch failed: ${response.status} ${response.statusText}`);
      return url;
    }

    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn("[urlToBase64] Failed to convert:", error);
    return url;
  }
}

/**
 * Safely format a date value (Date | string | number | undefined) for display.
 * Returns a formatted string, or a fallback if the date is invalid.
 * Handles: Date objects, ISO strings, timestamps, and undefined/null.
 */
export function formatDate(
  value: Date | string | number | undefined | null,
  options?: {
    locale?: string;
    style?: "date" | "datetime";
    fallback?: string;
  },
): string {
  const { locale = "zh-CN", style = "date", fallback = "-" } = options ?? {};

  if (value === undefined || value === null || value === "") return fallback;

  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return fallback;

  return style === "datetime"
    ? d.toLocaleString(locale)
    : d.toLocaleDateString(locale);
}

/**
 * 创建一条新的 ReferenceImageEntry 记录。
 * 统一所有创建参考图条目的逻辑，确保数据结构一致。
 */
export function createReferenceEntry(
  imageUrl: string,
  prompt: string,
  label: string,
  source: "ai" | "upload",
): ReferenceImageEntry {
  const now = Date.now();
  return {
    imageUrl,
    prompt,
    label,
    source,
    versions: [{ imageUrl, createdAt: now }],
    activeVersionIndex: 0,
    createdAt: now,
  };
}
