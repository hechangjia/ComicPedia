import { NextRequest } from "next/server";
import { isUrlSafe, sanitizeProxyError, PROXY_TIMEOUT_MS } from "@/lib/security";

/**
 * LLM Streaming API 代理路由
 * 将外部 LLM 的 SSE stream 透传给客户端，实现实时脚本生成预览。
 * 包含 SSRF 防护、超时控制、错误信息脱敏。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { targetUrl, headers: clientHeaders, payload } = body;

    if (!targetUrl) {
      return new Response(JSON.stringify({ error: "缺少 targetUrl" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // SSRF 防护：校验目标 URL
    const urlCheck = isUrlSafe(targetUrl);
    if (!urlCheck.safe) {
      return new Response(JSON.stringify({ error: urlCheck.reason }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 强制开启 stream
    const streamPayload = { ...payload, stream: true };

    // 构建转发请求头
    const forwardHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (clientHeaders) {
      if (clientHeaders.Authorization) {
        forwardHeaders["Authorization"] = clientHeaders.Authorization;
      }
      if (clientHeaders["x-api-key"]) {
        forwardHeaders["x-api-key"] = clientHeaders["x-api-key"];
      }
      if (clientHeaders["anthropic-version"]) {
        forwardHeaders["anthropic-version"] = clientHeaders["anthropic-version"];
      }
    }

    const upstreamResponse = await fetch(targetUrl, {
      method: "POST",
      headers: forwardHeaders,
      body: JSON.stringify(streamPayload),
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS * 2), // 流式请求给更长超时
    });

    if (!upstreamResponse.ok) {
      console.error("[LLM Stream Proxy] Upstream error:", upstreamResponse.status);

      return new Response(
        JSON.stringify({ error: sanitizeProxyError(upstreamResponse.status) }),
        { status: upstreamResponse.status, headers: { "Content-Type": "application/json" } },
      );
    }

    // 透传 SSE stream
    if (!upstreamResponse.body) {
      return new Response(
        JSON.stringify({ error: "上游未返回流式响应" }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(upstreamResponse.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[LLM Stream Proxy] Error:", error);

    if (error instanceof Error && error.name === "TimeoutError") {
      return new Response(JSON.stringify({ error: "请求超时，请稍后重试" }), {
        status: 504,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "流式代理请求失败" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
