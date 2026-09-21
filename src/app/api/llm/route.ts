import { resolveProxyModelBody, ModelReferenceError } from "@/lib/server/modelRequest";
import { NextRequest, NextResponse } from "next/server";
import { isUrlSafe, sanitizeProxyError, safeReadText, PROXY_TIMEOUT_MS } from "@/lib/security";

/**
 * LLM API 代理路由
 * 浏览器端无法直接调用外部 LLM API（CORS 限制），通过此路由转发请求。
 * 包含 SSRF 防护、超时控制、响应大小限制、错误信息脱敏。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await resolveProxyModelBody(await request.json(), ["llm", "vlm"]);
    const { targetUrl, headers: clientHeaders, payload } = body;

    if (!targetUrl) {
      return NextResponse.json({ error: "缺少 targetUrl" }, { status: 400 });
    }

    // SSRF 防护：校验目标 URL
    const urlCheck = isUrlSafe(targetUrl);
    if (!urlCheck.safe) {
      return NextResponse.json(
        { error: urlCheck.reason },
        { status: 400 },
      );
    }

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

    const response = await fetch(targetUrl, {
      method: "POST",
      redirect: "error",
      headers: forwardHeaders,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error("[LLM Proxy] Upstream error:", response.status);

      return NextResponse.json(
        { error: sanitizeProxyError(response.status), status: response.status },
        { status: response.status },
      );
    }

    const responseText = await safeReadText(response);

    try {
      const data = JSON.parse(responseText);
      return NextResponse.json(data);
    } catch {
      return new NextResponse(responseText, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }
  } catch (error) {
    if (error instanceof ModelReferenceError) return Response.json({ error: error.message }, { status: error.status });
    console.error("[LLM Proxy] Request failed");

    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json({ error: "请求超时，请稍后重试" }, { status: 504 });
    }

    return NextResponse.json(
      { error: "代理请求失败" },
      { status: 500 },
    );
  }
}
