import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const isUrlSafeMock = vi.fn();
const sanitizeProxyErrorMock = vi.fn();
const safeReadTextMock = vi.fn();
const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

vi.mock("@/lib/security", () => ({
  isUrlSafe: isUrlSafeMock,
  sanitizeProxyError: sanitizeProxyErrorMock,
  safeReadText: safeReadTextMock,
}));

describe("/api/models POST", () => {
  beforeEach(() => {
    isUrlSafeMock.mockReset();
    sanitizeProxyErrorMock.mockReset();
    safeReadTextMock.mockReset();
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as typeof fetch;
    isUrlSafeMock.mockReturnValue({ safe: true });
    sanitizeProxyErrorMock.mockReturnValue("请求过于频繁，请稍后重试");
    safeReadTextMock.mockResolvedValue("upstream error");
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it("requires apiUrl", async () => {
    const { POST } = await import("@/app/api/models/route");
    const request = new NextRequest("http://localhost:3000/api/models", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "缺少 apiUrl" });
  });

  it("returns the hard-coded anthropic model list", async () => {
    const { POST } = await import("@/app/api/models/route");
    const request = new NextRequest("http://localhost:3000/api/models", {
      method: "POST",
      body: JSON.stringify({
        apiUrl: "https://api.anthropic.com/v1/messages",
        protocolType: "anthropic",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.models).toContain("claude-sonnet-4-20250514");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unsafe model list endpoints", async () => {
    isUrlSafeMock.mockReturnValue({ safe: false, reason: "目标地址不允许访问" });

    const { POST } = await import("@/app/api/models/route");
    const request = new NextRequest("http://localhost:3000/api/models", {
      method: "POST",
      body: JSON.stringify({
        apiUrl: "http://169.254.169.254/v1",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "目标地址不允许访问" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proxies and sorts upstream model ids", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: "gpt-4o" }, { id: "gpt-4.1-mini" }, { id: "o3" }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    const { POST } = await import("@/app/api/models/route");
    const request = new NextRequest("http://localhost:3000/api/models", {
      method: "POST",
      body: JSON.stringify({
        apiUrl: "https://api.example.com/v1/chat/completions",
        apiKey: "secret",
      }),
    });

    const response = await POST(request);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/v1/models",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer secret",
        }),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      models: ["gpt-4.1-mini", "gpt-4o", "o3"],
    });
  });

  it("returns upstream error status with sanitized messaging", async () => {
    fetchMock.mockResolvedValue(new Response("rate limited", {
      status: 429,
      headers: { "Content-Type": "text/plain" },
    }));

    const { POST } = await import("@/app/api/models/route");
    const request = new NextRequest("http://localhost:3000/api/models", {
      method: "POST",
      body: JSON.stringify({
        apiUrl: "https://api.example.com/v1",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(429);
    expect(sanitizeProxyErrorMock).toHaveBeenCalledWith(429);
    await expect(response.json()).resolves.toEqual({
      error: "请求过于频繁，请稍后重试",
      models: [],
    });
  });
});
