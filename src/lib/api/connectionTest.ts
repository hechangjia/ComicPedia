import { modelRequestBody } from "@/lib/providers/modelRequestBody";
import type { UserLLMConfig, UserImageConfig } from "@/lib/types";
import { modelEndpoint } from "@/lib/providers/endpoints";
import { safeReadText, sanitizeProxyError } from "@/lib/security";
import { VISION_PROBE_IMAGE, VISION_PROBE_PROMPT, isCorrectVisionProbeAnswer } from "./visionProbe";

export interface TestResult {
  status: "idle" | "testing" | "success" | "error";
  message?: string;
  detail?: string;
  capability?: "text" | "vision" | "image" | "connectivity";
  dimensions?: { width: number; height: number };
}

const TIMEOUT_MS = 180_000;
const failure = (message: string, detail?: string): TestResult => ({ status: "error", message, detail });
const authHeaders = (key: string): Record<string, string> => key.trim() ? { Authorization: `Bearer ${key.trim()}` } : {};

async function proxyRequest(route: string, body: unknown): Promise<Response> {
  return fetch(route, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

function readTextOutput(data: unknown, anthropic: boolean): string {
  if (!data || typeof data !== "object") return "";
  const envelope = data as { content?: { type?: string; text?: string }[]; choices?: { message?: { content?: unknown } }[] };
  if (anthropic) return envelope.content?.filter((part) => part.type === "text" || part.text).map((part) => part.text || "").join("") || "";
  const content = envelope.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

async function testTextOrVision(c: UserLLMConfig, vision: boolean, saved: boolean): Promise<TestResult> {
  try {
    const anthropic = c.protocolType === "anthropic";
    const content = vision
      ? anthropic
        ? [{ type: "text", text: VISION_PROBE_PROMPT }, { type: "image", source: { type: "base64", media_type: "image/png", data: VISION_PROBE_IMAGE.split(",")[1] } }]
        : [{ type: "text", text: VISION_PROBE_PROMPT }, { type: "image_url", image_url: { url: VISION_PROBE_IMAGE } }]
      : "Reply exactly: COMICPEDIA_OK";
    const request = {
      targetUrl: modelEndpoint(c.apiUrl, anthropic ? "messages" : "chat"),
      headers: anthropic ? { "x-api-key": c.apiKey.trim(), "anthropic-version": "2023-06-01" } : authHeaders(c.apiKey),
      payload: { model: c.model.trim(), messages: [{ role: "user", content }],
        max_tokens: 128 },
    };
    const response = await proxyRequest("/api/llm", modelRequestBody(saved ? { configId: c.id, configRole: vision ? "vlm" : "llm" } : undefined, request.targetUrl, request.headers, request.payload));
    if (!response.ok) return failure(sanitizeProxyError(response.status));
    const text = readTextOutput(JSON.parse(await safeReadText(response, 1024 * 1024)), anthropic).trim();
    if (!text) return failure("接口可达，但没有返回有效文字内容");
    if (vision && !isCorrectVisionProbeAnswer(text)) {
      return failure("视觉能力验证未通过", "模型未正确识别测试图左右颜色；文字连接成功不能替代看图验证。");
    }
    return {
      status: "success", capability: vision ? "vision" : "text",
      message: vision ? "视觉输入验证通过" : "文字生成验证通过",
      detail: vision ? "正确识别测试图：左红、右蓝" : `模型响应: ${c.apiKey ? text.replaceAll(c.apiKey, "[redacted]").slice(0, 100) : text.slice(0, 100)}`,
    };
  } catch (error) {
    return failure(error instanceof Error && error.name === "TimeoutError" ? "测试超时" : "请求失败或响应格式不兼容");
  }
}

export function testLLMConnection(c: UserLLMConfig, saved = false): Promise<TestResult> { return testTextOrVision(c, false, saved); }
export function testVLMConnection(c: UserLLMConfig, saved = false): Promise<TestResult> { return testTextOrVision(c, true, saved); }

/** Extract only actual image-bearing envelopes, not an arbitrary successful response. */
function imageSource(value: unknown, depth = 0): string | undefined {
  if (depth > 12) return undefined;
  if (typeof value === "string") {
    if (/^(data:image\/|https?:\/\/)/.test(value)) return value;
    const markdown = value.match(/!\[[^\]]*\]\((data:image\/[^)]+|https?:\/\/[^)]+)\)/);
    return markdown?.[1];
  }
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) return value.map((item) => imageSource(item, depth + 1)).find(Boolean);
  const item = value as Record<string, unknown>;
  if (typeof item.b64_json === "string" && item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (typeof item.result === "string" && item.type === "image_generation_call") return `data:image/png;base64,${item.result}`;
  if (item.inline_data && typeof item.inline_data === "object") {
    const inline = item.inline_data as { mime_type?: string; data?: string };
    if (inline.data && inline.mime_type?.startsWith("image/")) return `data:${inline.mime_type};base64,${inline.data}`;
  }
  // Only descend through known image/response containers; the decoder verifies the bytes.
  for (const field of ["url", "image_url", "output_image", "image", "images", "data", "output", "choices", "message", "content"]) {
    const found = imageSource(item[field], depth + 1);
    if (found) return found;
  }
  return undefined;
}

function decodeImage(source: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => { image.onload = null; image.onerror = null; image.src = ""; reject(new Error("Image decode timeout")); }, 20_000);
    image.onload = () => {
      clearTimeout(timer);
      if (image.naturalWidth > 0 && image.naturalHeight > 0) resolve({ width: image.naturalWidth, height: image.naturalHeight });
      else reject(new Error("Empty image"));
    };
    image.onerror = () => { clearTimeout(timer); reject(new Error("Invalid image")); };
    image.src = source;
  });
}

export async function testImageConnection(c: UserImageConfig, saved = false): Promise<TestResult> {
  try {
    if (c.endpointType === "comfyui") {
      const response = await proxyRequest("/api/comfyui", saved ? { modelRef: { id: c.id, role: "image" }, ping: true } : { comfyuiUrl: c.apiUrl.trim(), ping: true });
      if (!response.ok) return failure(sanitizeProxyError(response.status));
      return { status: "success", capability: "connectivity", message: "ComfyUI 服务可达", detail: "仅验证连接，尚未运行工作流或验证图片生成。" };
    }
    const chat = c.endpointType === "chat" || (c.endpointType === "auto" && c.apiUrl.includes("/chat/completions"));
    const targetUrl = modelEndpoint(c.apiUrl, chat ? "chat" : "images");
    const prompt = "A simple red circle on a white background, minimal, no text";
    const request = {
      targetUrl, headers: authHeaders(c.apiKey),
      payload: chat
        ? { model: c.model.trim(), messages: [{ role: "user", content: prompt }], modalities: ["text", "image"] }
        : { model: c.model.trim(), prompt, size: c.size.trim() || "1024x1024", n: 1 },
    };
    const response = await proxyRequest("/api/image", modelRequestBody(saved ? { configId: c.id, configRole: "image" } : undefined, request.targetUrl, request.headers, request.payload));
    if (!response.ok) return failure(sanitizeProxyError(response.status));
    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    const raw = await safeReadText(response);
    if (contentType.includes("text/html") || /^\s*(<!doctype html|<html)/i.test(raw)) {
      return failure("返回的是 HTML 页面，不是图片 API", `测试地址：${targetUrl}。请确认模型 API 端点。`);
    }
    const source = imageSource(contentType.includes("json") ? JSON.parse(raw) : raw);
    if (!source) return failure("接口可达，但未返回图片，出图能力未验证");
    let objectUrl: string | undefined;
    let dimensions: { width: number; height: number };
    try {
      if (source.startsWith("data:")) {
        dimensions = await decodeImage(source);
      } else {
        // Use the existing POST proxy contract; provider credentials never accompany downloads.
        const artifact = await proxyRequest("/api/proxy-image", { url: source });
        if (!artifact.ok) return failure("生成了图片引用，但下载失败");
        const blob = await artifact.blob();
        if (!blob.size || blob.size > 20 * 1024 * 1024) return failure("图片为空或超过 20MB 限制");
        objectUrl = URL.createObjectURL(blob);
        dimensions = await decodeImage(objectUrl);
      }
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
    const actualSize = `${dimensions.width}×${dimensions.height}`;
    const requestedSize = c.size.replace("x", "×");
    return { status: "success", capability: "image", dimensions, message: "图片生成与解码验证通过",
      detail: `实际图片：${actualSize}${requestedSize && requestedSize !== actualSize ? `（请求尺寸：${requestedSize}，服务返回尺寸不同）` : ""}` };
  } catch (error) {
    return failure(error instanceof Error && error.name === "TimeoutError" ? "出图测试超时" : "出图请求失败或未返回可解码图片");
  }
}
