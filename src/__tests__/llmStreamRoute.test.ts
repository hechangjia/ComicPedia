import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const isUrlSafeMock = vi.fn();
const sanitizeProxyErrorMock = vi.fn();
const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

vi.mock("@/lib/security", () => ({
  isUrlSafe: isUrlSafeMock,
  sanitizeProxyError: sanitizeProxyErrorMock,
  PROXY_TIMEOUT_MS: 120_000,
}));

describe("/api/llm-stream POST", () => {
  beforeEach(() => {
    isUrlSafeMock.mockReset();
    sanitizeProxyErrorMock.mockReset();
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as typeof fetch;
    isUrlSafeMock.mockReturnValue({ safe: true });
    sanitizeProxyErrorMock.mockReturnValue("请求过于频繁，请稍后重试");
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it("requires targetUrl", async () => {
    const { POST } = await import("@/app/api/llm-stream/route");
    const request = new NextRequest("http://localhost:3000/api/llm-stream", {
      method: "POST",
      body: JSON.stringify({ payload: { messages: [] } }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "缺少 targetUrl" });
  });

  it("rejects unsafe upstream urls", async () => {
    isUrlSafeMock.mockReturnValue({ safe: false, reason: "目标地址不允许访问" });

    const { POST } = await import("@/app/api/llm-stream/route");
    const request = new NextRequest("http://localhost:3000/api/llm-stream", {
      method: "POST",
      body: JSON.stringify({
        targetUrl: "http://169.254.169.254/v1/chat/completions",
        payload: { messages: [] },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "目标地址不允许访问" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forces stream mode and forwards supported auth headers", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: hello\n\n"));
        controller.close();
      },
    });
    fetchMock.mockResolvedValue(new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }));

    const { POST } = await import("@/app/api/llm-stream/route");
    const request = new NextRequest("http://localhost:3000/api/llm-stream", {
      method: "POST",
      body: JSON.stringify({
        targetUrl: "https://api.example.com/v1/chat/completions",
        headers: {
          Authorization: "Bearer secret",
          "x-api-key": "anthropic-secret",
          "anthropic-version": "2023-06-01",
          "x-ignored": "nope",
        },
        payload: { model: "gpt-4o", messages: [{ role: "user", content: "hi" }] },
      }),
    });

    const response = await POST(request);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer secret",
          "x-api-key": "anthropic-secret",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content: "hi" }],
          stream: true,
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(await response.text()).toBe("data: hello\n\n");
  });

  it("returns sanitized upstream errors", async () => {
    fetchMock.mockResolvedValue(new Response("rate limited", {
      status: 429,
      headers: { "Content-Type": "text/plain" },
    }));

    const { POST } = await import("@/app/api/llm-stream/route");
    const request = new NextRequest("http://localhost:3000/api/llm-stream", {
      method: "POST",
      body: JSON.stringify({
        targetUrl: "https://api.example.com/v1/chat/completions",
        payload: { messages: [] },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(429);
    expect(sanitizeProxyErrorMock).toHaveBeenCalledWith(429);
    await expect(response.json()).resolves.toEqual({ error: "请求过于频繁，请稍后重试" });
  });

  it("returns 502 when upstream does not provide a body", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      body: null,
    });

    const { POST } = await import("@/app/api/llm-stream/route");
    const request = new NextRequest("http://localhost:3000/api/llm-stream", {
      method: "POST",
      body: JSON.stringify({
        targetUrl: "https://api.example.com/v1/chat/completions",
        payload: { messages: [] },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "上游未返回流式响应" });
  });

  it("maps timeout errors to 504", async () => {
    const timeoutError = new Error("timed out");
    timeoutError.name = "TimeoutError";
    fetchMock.mockRejectedValue(timeoutError);

    const { POST } = await import("@/app/api/llm-stream/route");
    const request = new NextRequest("http://localhost:3000/api/llm-stream", {
      method: "POST",
      body: JSON.stringify({
        targetUrl: "https://api.example.com/v1/chat/completions",
        payload: { messages: [] },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({ error: "请求超时，请稍后重试" });
  });
});
