import { UserLLMConfig, UserImageConfig } from "@/lib/types";

/** 连接测试结果 */
export interface TestResult {
  status: "idle" | "testing" | "success" | "error";
  message?: string;
  detail?: string;
}

/**
 * 测试 LLM 连接。
 * 纯函数，不依赖 React 状态。
 */
export async function testLLMConnection(c: UserLLMConfig): Promise<TestResult> {
  try {
    const base = c.apiUrl.trim().replace(/\/+$/, "");

    if (c.protocolType === "anthropic") {
      const payload = {
        model: c.model.trim(),
        max_tokens: 32,
        messages: [{ role: "user", content: "Say hi" }],
      };

      // 所有请求通过 Next.js 代理，避免浏览器 CORS 限制
      const response = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: base,
          headers: {
            "x-api-key": c.apiKey.trim(),
            "anthropic-version": "2023-06-01",
          },
          payload,
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        return {
          status: "error",
          message: `API 错误 (${response.status})`,
          detail: errText.slice(0, 200),
        };
      }

      const data = await response.json();
      const text = data.content?.[0]?.text || JSON.stringify(data).slice(0, 100);
      return {
        status: "success",
        message: "连接成功",
        detail: `模型响应: ${text.slice(0, 80)}`,
      };
    }

    // OpenAI 兼容协议
    const normalizedUrl =
      base.includes("/chat/completions") || base.includes("/completions")
        ? base
        : `${base}/chat/completions`;

    const payload = {
      model: c.model.trim(),
      max_tokens: 32,
      messages: [{ role: "user", content: "Say hi" }],
    };

    // 所有请求通过 Next.js 代理，避免浏览器 CORS 限制
    const response = await fetch("/api/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: normalizedUrl,
        headers: { Authorization: `Bearer ${c.apiKey.trim()}` },
        payload,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return {
        status: "error",
        message: `API 错误 (${response.status})`,
        detail: errText.slice(0, 200),
      };
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || JSON.stringify(data).slice(0, 100);
    return {
      status: "success",
      message: "连接成功",
      detail: `模型响应: ${text.slice(0, 80)}`,
    };
  } catch (err) {
    return {
      status: "error",
      message: "网络错误",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 测试文生图连接。
 * 纯函数，不依赖 React 状态。
 */
export async function testImageConnection(c: UserImageConfig): Promise<TestResult> {
  try {
    const base = c.apiUrl.trim().replace(/\/+$/, "");

    let useChatEndpoint: boolean;
    let normalizedUrl: string;

    if (c.endpointType === "chat") {
      useChatEndpoint = true;
      normalizedUrl = base.includes("/chat/completions") ? base : `${base}/chat/completions`;
    } else if (c.endpointType === "images") {
      useChatEndpoint = false;
      normalizedUrl = base.includes("/images/") ? base : `${base}/images/generations`;
    } else {
      if (base.includes("/chat/completions")) {
        useChatEndpoint = true;
        normalizedUrl = base;
      } else if (base.includes("/images/")) {
        useChatEndpoint = false;
        normalizedUrl = base;
      } else {
        useChatEndpoint = false;
        normalizedUrl = `${base}/images/generations`;
      }
    }

    const useImageEndpoint = !useChatEndpoint;
    const testPrompt = "A simple red circle on a white background, minimal, test image";
    const size = c.size.trim() || "1024x1024";

    const body = useImageEndpoint
      ? {
          model: c.model.trim() || "dall-e-3",
          prompt: testPrompt,
          size,
          response_format: "b64_json",
        }
      : {
          model: c.model.trim(),
          messages: [{ role: "user", content: testPrompt }],
          modalities: ["text", "image"],
          size,
          ...(size && { extra_body: { size } }),
        };

    const authHeaders: Record<string, string> = {};
    if (c.apiKey.trim()) {
      authHeaders["Authorization"] = `Bearer ${c.apiKey.trim()}`;
    }

    // 所有请求通过 Next.js 代理，避免浏览器 CORS 限制
    const response = await fetch("/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: normalizedUrl,
        headers: authHeaders,
        payload: body,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return {
        status: "error",
        message: `API 错误 (${response.status})`,
        detail: errText.slice(0, 200),
      };
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    const rawText = await response.text();

    if (contentType.includes("application/json")) {
      const data = JSON.parse(rawText);

      let hasImage = false;
      let contentPreview = "";

      // OpenAI images API: data: [{url, b64_json}]
      if (Array.isArray(data.data) && data.data.length > 0) {
        const first = data.data[0];
        if (first.url || first.b64_json) hasImage = true;
      }

      // Chat Completions: choices[0].message.content
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        if (Array.isArray(content)) {
          hasImage = content.some((part: Record<string, unknown>) => {
            if (typeof part !== "object" || part === null) return false;
            const p = part as Record<string, unknown>;
            // inline_data (Gemini)
            if (p.inline_data && typeof p.inline_data === "object") return true;
            // image_url (OpenAI multimodal)
            if (p.image_url) return true;
            // output_image (GPT-4o)
            if (p.type === "output_image" || p.output_image) return true;
            // generic image type
            if (p.type === "image" && (p.data || p.url)) return true;
            // b64_json in part
            if (typeof p.b64_json === "string") return true;
            return false;
          });
          contentPreview = `multimodal (${content.length} parts: ${content.map((p: Record<string, unknown>) => p.type ?? typeof p).join(", ")})`;
        } else if (typeof content === "string") {
          hasImage =
            content.startsWith("data:image") ||
            content.startsWith("http") ||
            /!\[.*?\]\((https?:\/\/|data:image)/.test(content) ||
            (content.replace(/\s/g, "").length > 1000 && /^[A-Za-z0-9+/=\s]+$/.test(content));
          contentPreview = content.slice(0, 80);
        }
      }

      // Responses API: output[*]
      if (!hasImage && Array.isArray(data.output)) {
        hasImage = data.output.some((item: Record<string, unknown>) =>
          item.type === "output_image" || item.type === "image"
        );
      }

      if (hasImage) {
        return {
          status: "success",
          message: "连接成功，图片生成正常",
          detail: `响应结构: ${Object.keys(data).join(", ")}`,
        };
      }

      // Chat 端点：有 choices 结构说明连接本身正常，只是测试 prompt 未触发图片
      if (useChatEndpoint && data.choices) {
        return {
          status: "success",
          message: "连接成功（测试 prompt 未返回图片，实际生成时通常正常）",
          detail: contentPreview
            ? `模型回复: ${contentPreview}`
            : `响应结构: ${Object.keys(data).join(", ")}`,
        };
      }

      return {
        status: "success",
        message: "连接成功，但响应格式可能不兼容",
        detail: `响应结构: ${Object.keys(data).join(", ")}`,
      };
    }

    // 非 JSON 响应
    if (rawText.startsWith("data:image") || rawText.match(/^https?:\/\//)) {
      return { status: "success", message: "连接成功，图片生成正常" };
    }
    return {
      status: "success",
      message: "连接成功，但返回非 JSON 内容",
      detail: rawText.slice(0, 100),
    };
  } catch (err) {
    return {
      status: "error",
      message: "网络错误",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
