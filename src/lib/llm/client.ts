import { PartialLLMConfig } from "../types";
import { withRetry } from "../retryQueue";
import { isUrlSafe, safeReadText, PROXY_TIMEOUT_MS } from "../security";

/**
 * 检测是否在浏览器环境运行
 */
function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * 服务端直连：直接调用外部 LLM API（不走代理）
 */
async function fetchDirect(
  targetUrl: string,
  headers: Record<string, string>,
  payload: unknown
): Promise<Response> {
  // SSRF 防护：校验目标 URL
  const urlCheck = isUrlSafe(targetUrl);
  if (!urlCheck.safe) {
    throw new Error(urlCheck.reason);
  }

  const forwardHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...headers,
  };

  return await fetch(targetUrl, {
    method: "POST",
    headers: forwardHeaders,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
  });
}

/**
 * 客户端代理：通过 /api/llm 路由调用
 */
async function fetchProxy(
  proxyPath: string,
  targetUrl: string,
  headers: Record<string, string>,
  payload: unknown
): Promise<Response> {
  return await fetch(proxyPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      targetUrl,
      headers,
      payload,
    }),
  });
}

/**
 * 根据环境选择调用方式
 */
async function fetchLLM(
  targetUrl: string,
  headers: Record<string, string>,
  payload: unknown,
  proxyPath: string = "/api/llm"
): Promise<Response> {
  if (isBrowser()) {
    return fetchProxy(proxyPath, targetUrl, headers, payload);
  } else {
    return fetchDirect(targetUrl, headers, payload);
  }
}

/** SSE 流式 chunk 回调：每次收到新文本时触发 */
export type StreamChunkCallback = (chunk: string, accumulated: string) => void;

/** LLM 配置 */
export interface LLMConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  provider: "openai-compatible" | "anthropic";
}

/** 获取 LLM 配置 */
export function getLLMConfig(overrides?: PartialLLMConfig): LLMConfig {
  const apiUrl = overrides?.apiUrl;
  const apiKey = overrides?.apiKey || "";
  const model = overrides?.model || "gpt-4o-mini";
  const provider = (overrides?.provider || "openai-compatible") as LLMConfig["provider"];

  if (!apiUrl) {
    throw new Error("未配置 LLM API，请在设置页面配置 API URL");
  }

  return { apiUrl, apiKey, model, provider };
}

/** 通用 LLM 调用（自动路由 OpenAI/Anthropic，通过 /api/llm 代理） */
export async function callLLM(prompt: string, overrides?: PartialLLMConfig): Promise<string> {
  const config = getLLMConfig(overrides);
  if (config.provider === "anthropic") {
    return callAnthropic(prompt, config);
  }
  return callOpenAICompatible(prompt, config);
}

/** 调用 OpenAI 兼容 API (支持 OpenAI, DeepSeek, Groq, Together, 本地 Ollama 等) */
export async function callOpenAICompatible(prompt: string, config: LLMConfig): Promise<string> {
  const requestBody = {
    model: config.model,
    messages: [{ role: "user", content: prompt }],
  };

  // 兼容只填根路径的情况（如 deepseek 仅填 https://api.deepseek.com/v1）
  const normalizedUrl =
    config.apiUrl.includes("/chat/completions") || config.apiUrl.includes("/completions")
      ? config.apiUrl
      : `${config.apiUrl.replace(/\/+$/, "")}/chat/completions`;

  const doRequest = async () => {
    console.log("[LLM] 请求 URL:", normalizedUrl);
    console.log("[LLM] 请求 Model:", config.model);

    const response = await fetchLLM(
      normalizedUrl,
      config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
      requestBody
    );

    if (!response.ok) {
      const errorText = await (isBrowser() ? response.text() : safeReadText(response)).catch(() => "");
      console.error("[LLM] 错误响应:", response.status, errorText);

      // 对 429/5xx 进行重试
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`LLM 暂时不可用: ${response.status} ${errorText}`);
      }

      // 4xx 属于配置/请求错误，直接返回具体信息以便用户修正
      throw new Error(
        `LLM API 错误 (${response.status})，请检查 api_url/model/key 是否正确。` +
          (errorText ? ` 详情: ${errorText}` : "")
      );
    }

    const data = await response.json();
    console.log("[LLM] 响应成功");
    return data.choices[0].message.content;
  };

  try {
    return await withRetry(doRequest, { maxRetries: 3, baseDelay: 1200, maxDelay: 15000 });
  } catch (err) {
    // 提供更友好的提示
    throw new Error(
      err instanceof Error
        ? err.message
        : "LLM 服务繁忙或暂时不可用，请稍后重试。"
    );
  }
}

/** 调用 Anthropic API */
export async function callAnthropic(prompt: string, config: LLMConfig): Promise<string> {
  const doRequest = async () => {
    const anthropicPayload = {
      model: config.model,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    };

    const response = await fetchLLM(
      config.apiUrl,
      {
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      anthropicPayload
    );

    if (!response.ok) {
      const errorText = await (isBrowser() ? response.text() : safeReadText(response)).catch(() => "");
      console.error("[LLM] 错误响应:", response.status, errorText);

      if (response.status === 429 || response.status >= 500) {
        throw new Error(`LLM 暂时不可用: ${response.status} ${errorText}`);
      }

      throw new Error(`Anthropic API 错误: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.content[0].text;
  };

  try {
    return await withRetry(doRequest, { maxRetries: 3, baseDelay: 1200, maxDelay: 15000 });
  } catch (err) {
    throw new Error(
      err instanceof Error
        ? `LLM 服务繁忙或暂时不可用，请稍后重试。${err.message}`
        : "LLM 服务繁忙或暂时不可用，请稍后重试。"
    );
  }
}

// ============================================================
// SSE 流式调用
// ============================================================

/**
 * 解析 SSE 流并提取文本增量。
 * 同时支持 OpenAI (delta.content) 和 Anthropic (content_block_delta) 格式。
 */
async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  provider: "openai-compatible" | "anthropic",
  onChunk: StreamChunkCallback,
): Promise<string> {
  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // 保留不完整行

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue;
      if (!trimmed.startsWith("data: ")) continue;

      const data = trimmed.slice(6);
      if (data === "[DONE]") return accumulated;

      try {
        const parsed = JSON.parse(data);
        let text = "";

        if (provider === "anthropic") {
          if (parsed.type === "content_block_delta" && parsed.delta?.text) {
            text = parsed.delta.text;
          }
        } else {
          text = parsed.choices?.[0]?.delta?.content || "";
        }

        if (text) {
          accumulated += text;
          onChunk(text, accumulated);
        }
      } catch {
        // 非 JSON data 行，跳过
      }
    }
  }

  return accumulated;
}

/** 流式调用 OpenAI 兼容 API */
export async function callOpenAICompatibleStream(
  prompt: string,
  config: LLMConfig,
  onChunk: StreamChunkCallback,
  signal?: AbortSignal,
): Promise<string> {
  const requestBody = {
    model: config.model,
    messages: [{ role: "user", content: prompt }],
  };

  const normalizedUrl =
    config.apiUrl.includes("/chat/completions") || config.apiUrl.includes("/completions")
      ? config.apiUrl
      : `${config.apiUrl.replace(/\/+$/, "")}/chat/completions`;

  console.log("[LLM Stream] 请求 URL:", normalizedUrl);

  const response = isBrowser()
    ? await fetch("/api/llm-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: normalizedUrl,
          headers: { Authorization: `Bearer ${config.apiKey}` },
          payload: requestBody,
        }),
        signal,
      })
    : await fetchDirect(normalizedUrl, { Authorization: `Bearer ${config.apiKey}` }, requestBody);

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`LLM 流式响应错误 (${response.status}): ${errorText}`);
  }

  if (!response.body) {
    throw new Error("响应不包含可读流");
  }

  return parseSSEStream(response.body.getReader(), "openai-compatible", onChunk);
}

/** 流式调用 Anthropic API */
export async function callAnthropicStream(
  prompt: string,
  config: LLMConfig,
  onChunk: StreamChunkCallback,
  signal?: AbortSignal,
): Promise<string> {
  const payload = {
    model: config.model,
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  };

  const response = isBrowser()
    ? await fetch("/api/llm-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: config.apiUrl,
          headers: {
            "x-api-key": config.apiKey,
            "anthropic-version": "2023-06-01",
          },
          payload,
        }),
        signal,
      })
    : await fetchDirect(
        config.apiUrl,
        {
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        payload
      );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Anthropic 流式响应错误 (${response.status}): ${errorText}`);
  }

  if (!response.body) {
    throw new Error("响应不包含可读流");
  }

  return parseSSEStream(response.body.getReader(), "anthropic", onChunk);
}

// ============================================================
// 带完整 messages 的 LLM 调用
// ============================================================

/** OpenAI 兼容 API — 支持完整 messages 数组 + 低 temperature */
export async function callOpenAIWithMessages(
  messages: Array<{ role: string; content: string }>,
  config: LLMConfig
): Promise<string> {
  const requestBody = {
    model: config.model,
    messages,
    temperature: 0.3,
  };

  const normalizedUrl =
    config.apiUrl.includes("/chat/completions") || config.apiUrl.includes("/completions")
      ? config.apiUrl
      : `${config.apiUrl.replace(/\/+$/, "")}/chat/completions`;

  const doRequest = async () => {
    const response = await fetchLLM(
      normalizedUrl,
      config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
      requestBody
    );

    if (!response.ok) {
      const errorText = await (isBrowser() ? response.text() : safeReadText(response)).catch(() => "");
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`LLM 暂时不可用: ${response.status} ${errorText}`);
      }
      throw new Error(`LLM API 错误 (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  };

  return await withRetry(doRequest, { maxRetries: 3, baseDelay: 1200, maxDelay: 15000 });
}

/** Anthropic API — 支持 system prompt + 完整 messages 数组 + 低 temperature */
export async function callAnthropicWithMessages(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  config: LLMConfig
): Promise<string> {
  const doRequest = async () => {
    const anthropicPayload = {
      model: config.model,
      max_tokens: 2048,
      system: systemPrompt,
      messages,
      temperature: 0.3,
    };

    const response = await fetchLLM(
      config.apiUrl,
      {
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      anthropicPayload
    );

    if (!response.ok) {
      const errorText = await (isBrowser() ? response.text() : safeReadText(response)).catch(() => "");
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`LLM 暂时不可用: ${response.status} ${errorText}`);
      }
      throw new Error(`Anthropic API 错误: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.content[0].text;
  };

  return await withRetry(doRequest, { maxRetries: 3, baseDelay: 1200, maxDelay: 15000 });
}
