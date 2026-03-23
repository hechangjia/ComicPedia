import { NextRequest, NextResponse } from "next/server";
import { isUrlSafe, sanitizeProxyError, safeReadText } from "@/lib/security";

/**
 * 模型列表代理路由
 * 代理调用 OpenAI-compatible /v1/models 端点，获取可用模型列表。
 * 通过服务端代理避免浏览器 CORS 限制。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiUrl, apiKey, protocolType } = body as {
      apiUrl: string;
      apiKey?: string;
      protocolType?: "openai-compatible" | "anthropic";
    };

    if (!apiUrl) {
      return NextResponse.json({ error: "缺少 apiUrl" }, { status: 400 });
    }

    // Anthropic 无 /models API，返回硬编码列表
    if (protocolType === "anthropic" || apiUrl.includes("anthropic.com")) {
      return NextResponse.json({
        models: [
          "claude-sonnet-4-20250514",
          "claude-opus-4-20250514",
          "claude-haiku-4-20250514",
          "claude-3-5-sonnet-20241022",
          "claude-3-5-haiku-20241022",
          "claude-3-opus-20240229",
        ],
      });
    }

    // 构建 /models 端点 URL
    const base = apiUrl.trim().replace(/\/+$/, "");
    // 移除已有的路径后缀，定位到 base URL
    const modelsUrl = base
      .replace(/\/chat\/completions\/?$/, "")
      .replace(/\/completions\/?$/, "")
      .replace(/\/messages\/?$/, "")
      .replace(/\/images\/generations\/?$/, "")
      .replace(/\/v1\/?$/, "");

    const finalUrl = `${modelsUrl}/v1/models`;

    // SSRF 防护
    const urlCheck = isUrlSafe(finalUrl);
    if (!urlCheck.safe) {
      return NextResponse.json({ error: urlCheck.reason }, { status: 400 });
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(finalUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errText = await safeReadText(response).catch(() => "");
      console.error("[Models Proxy] Upstream error:", response.status, errText.slice(0, 300));

      return NextResponse.json(
        { error: sanitizeProxyError(response.status), models: [] },
        { status: response.status },
      );
    }

    const data = await response.json();

    // OpenAI 格式: { data: [{ id: "gpt-4o", ... }] }
    // Ollama 格式: { models: [{ name: "qwen3.5:4b", ... }] }
    let models: string[] = [];

    if (Array.isArray(data.data)) {
      models = data.data
        .map((m: { id?: string }) => m.id)
        .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
    } else if (Array.isArray(data.models)) {
      models = data.models
        .map((m: { name?: string; id?: string }) => m.name || m.id)
        .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
    }

    // 排序：常用模型优先
    models.sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ models });
  } catch (error) {
    console.error("[Models Proxy] Error:", error);

    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json({ error: "请求超时", models: [] }, { status: 504 });
    }

    return NextResponse.json(
      { error: "获取模型列表失败", models: [] },
      { status: 500 },
    );
  }
}
