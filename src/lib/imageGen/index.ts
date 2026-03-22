import { ComicStyle, ImageEndpointType, ImageGeneratorAdapter, PartialImageGenConfig, ZImageExtraBody } from "../types";
import { withRetry } from "../retryQueue";
import { AppError } from "../errors";
import { getStyleModifier, getStyleNegativePrompt } from "../config/styles";

/** 文生图配置 */
interface ImageGenConfig {
  apiUrl: string;
  apiKey?: string;
  model?: string;
  size?: string;
  endpointType: ImageEndpointType;
  extraBody?: ZImageExtraBody;
  comfyuiWorkflow?: string;
}

/** 默认 negative prompt：基础质量负面词 */
const DEFAULT_NEGATIVE_PROMPT_BASE = "watermark, signature, logo, speech bubble, dialogue bubble, narration box, low quality, blurry, deformed";

/** 额外的文字禁止词（infographic 等需要文字的风格不应使用） */
const TEXT_BAN_NEGATIVE = "text, caption, label, subtitle, title, letters, words, writing, font";
enum ErrorType {
  RETRYABLE = "retryable",      // 可重试：5xx、网络超时、速率限制
  NON_RETRYABLE = "non_retryable", // 不可重试：4xx（除429）、认证失败
}

/** 分类错误类型 */
function classifyError(status: number, message: string): ErrorType {
  if (status >= 500) return ErrorType.RETRYABLE;
  if (status === 429) return ErrorType.RETRYABLE;
  if (status === 408) return ErrorType.RETRYABLE;

  const retryableKeywords = ["timeout", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "network"];
  if (retryableKeywords.some(k => message.toLowerCase().includes(k))) {
    return ErrorType.RETRYABLE;
  }

  return ErrorType.NON_RETRYABLE;
}

/** 获取文生图配置 */
function getImageGenConfig(overrides?: PartialImageGenConfig): ImageGenConfig | null {
  const apiUrl = overrides?.apiUrl;

  if (!apiUrl) {
    return null; // 使用 prompt-only 模式
  }

  return {
    apiUrl,
    apiKey: overrides?.apiKey,
    model: overrides?.model || "dall-e-3",
    size: overrides?.size || "1024x1024",
    endpointType: overrides?.endpointType || "auto",
    extraBody: overrides?.extraBody,
    comfyuiWorkflow: overrides?.comfyuiWorkflow,
  };
}

/** 适配器工厂 */
export function getImageAdapter(overrides?: PartialImageGenConfig): ImageGeneratorAdapter {
  const config = getImageGenConfig(overrides);

  if (!config) {
    return new PromptOnlyAdapter();
  }

  if (config.endpointType === "comfyui") {
    return new ComfyUIAdapter(config);
  }

  return new ChatImageAdapter(config);
}

/** 通过 Chat/Images API 生成图片的适配器 */
class ChatImageAdapter implements ImageGeneratorAdapter {
  name = "Chat Image API";
  private config: ImageGenConfig;
  /** 当前风格的 negative prompt（由 applyStyle 设置，buildImagesBody 消费） */
  private lastStyleNegative = "";
  /** 当前风格（由 applyStyle 设置，buildImagesBody 消费） */
  private lastStyle: ComicStyle = "anime";

  constructor(config: ImageGenConfig) {
    this.config = config;
  }

  async generate(prompt: string, style: ComicStyle, seed?: number, signal?: AbortSignal): Promise<string> {
    const styledPrompt = this.applyStyle(prompt, style);

    const authHeaders: Record<string, string> = {};
    if (this.config.apiKey) {
      authHeaders["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    const base = this.config.apiUrl.replace(/\/+$/, "");

    // 端点类型判断：优先使用用户显式配置，其次根据 URL 自动推断
    let useChatEndpoint: boolean;
    let normalizedUrl: string;

    if (this.config.endpointType === "chat") {
      useChatEndpoint = true;
      normalizedUrl = base.includes("/chat/completions")
        ? base
        : `${base}/chat/completions`;
    } else if (this.config.endpointType === "images") {
      useChatEndpoint = false;
      normalizedUrl = base.includes("/images/")
        ? base
        : `${base}/images/generations`;
    } else {
      // auto 模式：根据 URL 路径推断
      if (base.includes("/chat/completions")) {
        useChatEndpoint = true;
        normalizedUrl = base;
      } else if (base.includes("/images/")) {
        useChatEndpoint = false;
        normalizedUrl = base;
      } else {
        // 默认使用 images API（向后兼容）
        useChatEndpoint = false;
        normalizedUrl = `${base}/images/generations`;
      }
    }

    const useImageEndpoint = !useChatEndpoint;

    // 使用统一的 withRetry 进行重试
    return await withRetry(async () => {
      const body = useImageEndpoint
        ? this.buildImagesBody(styledPrompt, seed)
        : this.buildChatBody(styledPrompt);

      // 所有请求通过 Next.js 代理，避免浏览器 CORS 限制
      const response = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: normalizedUrl,
          headers: authHeaders,
          payload: body,
        }),
        signal,
      });

      const contentType = response.headers.get("content-type")?.toLowerCase() || "";
      const rawText = await response.text();

      if (!response.ok) {
        const msg = rawText || response.statusText;
        const errorType = classifyError(response.status, msg);

        if (errorType === ErrorType.NON_RETRYABLE) {
          throw new AppError({
            code: "IMAGE_API_ERROR",
            message: `文生图 API 错误 (${response.status}): ${msg}`,
            retryable: false,
          });
        }

        throw new AppError({
          code: "IMAGE_API_RETRYABLE",
          message: `文生图 API 错误 (可重试): ${response.status} ${msg}`,
          retryable: true,
        });
      }

      let data: Record<string, unknown>;
      if (contentType.includes("application/json")) {
        try {
          data = JSON.parse(rawText);
        } catch (err) {
          throw new AppError({
            code: "IMAGE_PARSE_ERROR",
            message: `文生图 API 返回的 JSON 无法解析: ${String(err)}，内容片段: ${rawText.slice(0, 200)}`,
            retryable: false,
          });
        }
      } else {
        // 非 JSON 响应，尝试直接提取图片 / URL / dataURL
        const direct = this.extractFromPlain(rawText);
        if (direct) {
          return direct;
        }
        throw new AppError({
          code: "IMAGE_FORMAT_ERROR",
          message: `文生图 API 返回非 JSON 内容: ${rawText.slice(0, 200)}`,
          retryable: false,
        });
      }

      // 调试日志
      console.log("[ImageGen] 响应结构:", Object.keys(data));

      // 提取图片内容
      const imageUrl = this.extractImage(data);
      if (!imageUrl) {
        // 增强诊断信息
        const choices = data.choices as Array<{ message?: { content?: unknown } }> | undefined;
        const content = choices?.[0]?.message?.content;
        console.error("[ImageGen] 无法从响应提取图片");
        console.error("[ImageGen]   顶层 keys:", Object.keys(data));
        console.error("[ImageGen]   content 类型:", Array.isArray(content) ? "array" : typeof content);
        if (Array.isArray(content)) {
          console.error("[ImageGen]   content parts:", content.map((p: Record<string, unknown>) => p.type ?? typeof p));
        } else if (typeof content === "string") {
          console.error("[ImageGen]   content 前100字:", content.substring(0, 100));
        }
        throw new AppError({
          code: "IMAGE_EXTRACT_ERROR",
          message: "无法从 API 响应中提取图片，请检查端点类型设置是否正确",
          retryable: false,
        });
      }

      return imageUrl;
    }, { maxRetries: 4, baseDelay: 500, maxDelay: 15000 }, signal);
  }

  /** 构建 /images/generations 请求体 */
  private buildImagesBody(prompt: string, seed?: number): Record<string, unknown> {
    // 合并 negative prompt：基础 + 文字禁止（infographic 除外）+ 风格级 + 用户自定义
    const styleNeg = this.lastStyleNegative || "";
    const userNegative = this.config.extraBody?.negative_prompt;
    // infographic 风格需要文字标注，不禁止 text/label/caption
    const textBan = this.lastStyle === "infographic" ? "" : TEXT_BAN_NEGATIVE;
    const parts = [DEFAULT_NEGATIVE_PROMPT_BASE, textBan, styleNeg, userNegative].filter(Boolean);
    // 去重：多层 negative 合并时可能有重复词（如 "blurry" 同时出现在 base 和 style 中）
    const negativePrompt = [...new Set(parts.join(", ").split(",").map(s => s.trim()).filter(Boolean))].join(", ");

    return {
      model: this.config.model,
      prompt,
      size: this.config.size,
      // 优先请求 b64_json：避免 URL 过期，后续无需额外转换
      response_format: "b64_json",
      negative_prompt: negativePrompt,
      ...(seed !== undefined && { seed }),
      // Z-Image / Stable Diffusion 等 extra_body 参数
      ...(this.config.extraBody && {
        num_inference_steps: this.config.extraBody.num_inference_steps,
        guidance_scale: this.config.extraBody.guidance_scale,
        // control_image/control_mode 仅在有值时才发送（部分 API 不支持）
        ...(this.config.extraBody.control_image && {
          control_image: this.config.extraBody.control_image,
          control_mode: this.config.extraBody.control_mode || "HED",
        }),
        ...(this.config.extraBody.control_context_scale !== undefined && {
          control_context_scale: this.config.extraBody.control_context_scale,
        }),
        ...(this.config.extraBody.image_scale !== undefined && {
          image_scale: this.config.extraBody.image_scale,
        }),
        ...(this.config.extraBody.image && { image: this.config.extraBody.image }),
        ...(this.config.extraBody.strength !== undefined && { strength: this.config.extraBody.strength }),
      }),
    };
  }

  /** 构建 /chat/completions 请求体 */
  private buildChatBody(prompt: string): Record<string, unknown> {
    const hasRefImage = !!this.config.extraBody?.image;

    // 消息内容：有参考图时使用多模态数组，否则纯文本
    const messageContent = hasRefImage
      ? [
          { type: "image_url", image_url: { url: this.config.extraBody!.image } },
          { type: "text", text: `Transform this image: ${prompt}` },
        ]
      : prompt;

    return {
      model: this.config.model,
      messages: [{ role: "user", content: messageContent }],
      // 声明多模态输出（Gemini 等模型需要此参数触发图片生成）
      modalities: ["text", "image"],
      // size 通过 extra_body 传递（兼容 Gemini 等需要 extra_body 的端点）
      // 同时保留顶层 size 以兼容原生 OpenAI 格式
      size: this.config.size,
      ...(this.config.size && { extra_body: { size: this.config.size } }),
    };
  }

  /** 处理纯文本响应，尝试提取图片或链接 */
  private extractFromPlain(text: string): string | undefined {
    const trimmed = text.trim();
    if (trimmed.startsWith("data:image")) return trimmed;

    const urlMatch = trimmed.match(/https?:\/\/[^\s"'<>]+/);
    if (urlMatch) return urlMatch[0];

    // 纯 base64
    const clean = trimmed.replace(/\s/g, "");
    if (clean.startsWith("iVBOR") || clean.length > 500) {
      return `data:image/png;base64,${clean}`;
    }

    return undefined;
  }

  /**
   * 从 JSON 响应中提取图片。
   * 支持多种 API 响应格式：
   *   - OpenAI images API:    data[0].url / data[0].b64_json
   *   - Chat completions:     choices[0].message.content (string / multimodal array)
   *   - Gemini multimodal:    inline_data.data
   *   - GPT-4o output_image:  output_image.data / output_image.url
   *   - Responses API:        output[0].content[*]
   */
  private extractImage(data: Record<string, unknown>): string | undefined {
    // ── 1. OpenAI images API 兼容: data: [{url, b64_json}] ──
    const dataArr = data.data as Array<{ url?: string; b64_json?: string; content_type?: string }> | undefined;
    if (Array.isArray(dataArr) && dataArr.length > 0) {
      const first = dataArr[0];
      if (first.b64_json && typeof first.b64_json === "string") {
        const mime = first.content_type || "image/png";
        return `data:${mime};base64,${first.b64_json}`;
      }
      if (first.url && typeof first.url === "string") return first.url;
    }

    // ── 2. Chat Completions: choices[0].message.content ──
    const choices = data.choices as Array<{ message?: { content?: unknown } }> | undefined;
    const content = choices?.[0]?.message?.content;
    const fromContent = this.extractFromContent(content);
    if (fromContent) return fromContent;

    // ── 3. Responses API: output[0].content[*] ──
    const output = data.output as Array<{ type?: string; content?: unknown }> | undefined;
    if (Array.isArray(output)) {
      for (const item of output) {
        const fromOutput = this.extractFromContent(item.content);
        if (fromOutput) return fromOutput;
        // output 项本身可能就是图片
        const fromItem = this.extractFromContentPart(item as Record<string, unknown>);
        if (fromItem) return fromItem;
      }
    }

    return undefined;
  }

  /** 从 content（字符串或多模态数组）提取图片 */
  private extractFromContent(content: unknown): string | undefined {
    if (!content) return undefined;

    // content 是数组（多模态格式）
    if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part === "object" && part !== null) {
          const result = this.extractFromContentPart(part as Record<string, unknown>);
          if (result) return result;
        }
      }
    }

    // content 是字符串
    if (typeof content === "string") {
      return this.extractFromStringContent(content);
    }

    return undefined;
  }

  /** 从单个 content part 对象中提取图片 */
  private extractFromContentPart(p: Record<string, unknown>): string | undefined {
    // image_url.url (OpenAI multimodal)
    if (p.image_url && typeof p.image_url === "object") {
      const url = (p.image_url as Record<string, unknown>).url;
      if (typeof url === "string") return url;
    }
    // image_url 直接是字符串 (部分代理)
    if (typeof p.image_url === "string") {
      return p.image_url;
    }

    // inline_data (Gemini 格式)
    if (p.inline_data && typeof p.inline_data === "object") {
      const inlineData = p.inline_data as Record<string, unknown>;
      const mimeType = inlineData.mime_type || inlineData.mimeType || "image/png";
      const base64Data = inlineData.data;
      if (typeof base64Data === "string") {
        return `data:${mimeType};base64,${base64Data}`;
      }
    }

    // output_image (GPT-4o native image gen)
    if (p.type === "output_image" || p.output_image) {
      const oi = (p.output_image ?? p) as Record<string, unknown>;
      // output_image.url (data URI)
      if (typeof oi.url === "string") return oi.url;
      // output_image.data (raw base64)
      if (typeof oi.data === "string") {
        const fmt = typeof oi.format === "string" ? oi.format : "png";
        return `data:image/${fmt};base64,${oi.data}`;
      }
    }

    // type=image + data (generic)
    if (p.type === "image" && typeof p.data === "string") {
      return `data:image/png;base64,${p.data}`;
    }

    // type=image + url
    if (p.type === "image" && typeof p.url === "string") {
      return p.url;
    }

    // b64_json 直接出现在 part 上 (部分 API)
    if (typeof p.b64_json === "string") {
      const mimeType = typeof p.content_type === "string" ? p.content_type : "image/png";
      return `data:${mimeType};base64,${p.b64_json}`;
    }

    return undefined;
  }

  /** 从字符串 content 中提取图片 */
  private extractFromStringContent(content: string): string | undefined {
    // 直接是 URL
    if (content.startsWith("http")) return content;

    // 已经是 data URL
    if (content.startsWith("data:image")) return content;

    // Markdown 格式 ![...](url)
    const mdMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
    if (mdMatch) return mdMatch[1];

    // Markdown 格式 ![...](data:image...)
    const mdDataMatch = content.match(/!\[.*?\]\((data:image\/[^)]+)\)/);
    if (mdDataMatch) return mdDataMatch[1];

    // 提取任何 URL
    const urlMatch = content.match(/https?:\/\/[^\s"'<>]+/);
    if (urlMatch) return urlMatch[0];

    // 纯 base64 字符串 (很长，无前缀)
    const cleanContent = content.replace(/\s/g, "");
    if (cleanContent.length > 1000 && /^[A-Za-z0-9+/=]+$/.test(cleanContent)) {
      return `data:image/png;base64,${cleanContent}`;
    }

    return undefined;
  }

  private applyStyle(prompt: string, style: ComicStyle): string {
    // 缓存风格级 negative prompt 供 buildImagesBody 使用
    this.lastStyleNegative = getStyleNegativePrompt(style);
    this.lastStyle = style;

    const modifier = getStyleModifier(style);

    // 移除 prompt 中与 modifier 重复/矛盾的风格词
    // 提取 modifier 的核心风格标识词（前 5 个短语）
    const modifierPhrases = modifier.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    const coreStyleTerms = modifierPhrases.slice(0, 5);

    // 从 negative prompt 提取矛盾词（如 watercolor 的 negative 包含 "anime"）
    const negTerms = (getStyleNegativePrompt(style) || "")
      .split(",").map(s => s.trim().toLowerCase()).filter(s => s.length > 3);

    let cleanedPrompt = prompt;
    for (const term of negTerms) {
      // 移除 prompt 中出现的矛盾风格词（如选了 watercolor 但 prompt 含 "anime style"）
      const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
      cleanedPrompt = cleanedPrompt.replace(regex, "");
    }

    // 避免重复：如果 prompt 已包含 modifier 的核心词，不重复添加
    const promptLower = cleanedPrompt.toLowerCase();
    const alreadyHasStyle = coreStyleTerms.some(t => t.length > 8 && promptLower.includes(t));
    if (alreadyHasStyle) {
      // prompt 已经包含风格词，只补充 "best quality" 前缀
      cleanedPrompt = cleanedPrompt.replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim();
      return `best quality, ${cleanedPrompt}`;
    }

    cleanedPrompt = cleanedPrompt.replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim();
    return `${modifier}, ${cleanedPrompt}`;
  }
}

/** ComfyUI workflow 适配器 */
class ComfyUIAdapter implements ImageGeneratorAdapter {
  name = "ComfyUI";
  private config: ImageGenConfig;

  constructor(config: ImageGenConfig) {
    this.config = config;
  }

  async generate(prompt: string, style: ComicStyle, seed?: number, signal?: AbortSignal): Promise<string> {
    const styledPrompt = `${getStyleModifier(style)}, ${prompt}`;

    if (!this.config.comfyuiWorkflow) {
      throw new AppError({
        code: "COMFYUI_NO_WORKFLOW",
        message: "未配置 ComfyUI Workflow JSON",
        retryable: false,
      });
    }

    let workflow: Record<string, unknown>;
    try {
      workflow = JSON.parse(this.config.comfyuiWorkflow);
    } catch {
      throw new AppError({
        code: "COMFYUI_INVALID_WORKFLOW",
        message: "ComfyUI Workflow JSON 格式错误",
        retryable: false,
      });
    }

    // 解析尺寸
    const [width, height] = (this.config.size || "1024x1024").split("x").map(Number);

    // 构建 negative prompt（基础 + 文字禁止 + 风格级）
    const textBan = style === "infographic" ? "" : TEXT_BAN_NEGATIVE;
    const negParts = [DEFAULT_NEGATIVE_PROMPT_BASE, textBan, getStyleNegativePrompt(style)].filter(Boolean);
    const negativePrompt = negParts.join(", ");

    // 从 extraBody 提取参考图（用于 IP-Adapter）
    const referenceImage = this.config.extraBody?.control_image || this.config.extraBody?.image;

    const response = await fetch("/api/comfyui", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        comfyuiUrl: this.config.apiUrl,
        workflow,
        prompt: styledPrompt,
        negativePrompt: negativePrompt || undefined,
        referenceImage: typeof referenceImage === "string" && referenceImage.startsWith("data:image") ? referenceImage : undefined,
        width: width || 1024,
        height: height || 1024,
        seed,
      }),
      signal,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: response.statusText }));
      throw new AppError({
        code: "COMFYUI_ERROR",
        message: (data as { error?: string }).error || `ComfyUI 错误: ${response.status}`,
        retryable: response.status >= 500,
      });
    }

    const data = await response.json();
    if (!data.image) {
      throw new AppError({
        code: "COMFYUI_NO_IMAGE",
        message: "ComfyUI 未返回图片",
        retryable: false,
      });
    }

    return data.image;
  }
}

/** 仅输出 Prompt 适配器（不实际生成图片） */
class PromptOnlyAdapter implements ImageGeneratorAdapter {
  name = "Prompt Only";

  async generate(prompt: string, style: ComicStyle): Promise<string> {
    const enhancedPrompt = `${prompt}, ${getStyleModifier(style)}, high quality`;
    return `data:text/plain;base64,${btoa(unescape(encodeURIComponent(enhancedPrompt)))}`;
  }
}
