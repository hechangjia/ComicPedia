import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const isUrlSafeMock = vi.fn();
const sanitizeProxyErrorMock = vi.fn();
const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

vi.mock("@/lib/security", () => ({
  isUrlSafe: isUrlSafeMock,
  sanitizeProxyError: sanitizeProxyErrorMock,
}));

describe("/api/proxy-image POST", () => {
  beforeEach(() => {
    isUrlSafeMock.mockReset();
    sanitizeProxyErrorMock.mockReset();
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as typeof fetch;
    isUrlSafeMock.mockReturnValue({ safe: true });
    sanitizeProxyErrorMock.mockReturnValue("认证失败，请检查 API Key 是否正确");
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it("requires a url", async () => {
    const { POST } = await import("@/app/api/proxy-image/route");
    const request = new NextRequest("http://localhost:3000/api/proxy-image", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Missing url" });
  });

  it("rejects unsafe urls before attempting any fetch", async () => {
    isUrlSafeMock.mockReturnValue({ safe: false, reason: "目标地址不允许访问" });

    const { POST } = await import("@/app/api/proxy-image/route");
    const request = new NextRequest("http://localhost:3000/api/proxy-image", {
      method: "POST",
      body: JSON.stringify({ url: "http://169.254.169.254/latest/meta-data" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "目标地址不允许访问" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 502 with sanitized error when all fetch strategies fail", async () => {
    fetchMock.mockRejectedValue(new Error("network failed"));

    const { POST } = await import("@/app/api/proxy-image/route");
    const request = new NextRequest("http://localhost:3000/api/proxy-image", {
      method: "POST",
      body: JSON.stringify({ url: "http://cdn.example.com/image.png" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(502);
    expect(sanitizeProxyErrorMock).toHaveBeenCalledWith(403);
    await expect(response.json()).resolves.toEqual({
      error: "认证失败，请检查 API Key 是否正确",
    });
  });

  it("returns binary image responses with cache disabled", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "image/webp" }),
      arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
    });

    const { POST } = await import("@/app/api/proxy-image/route");
    const request = new NextRequest("http://localhost:3000/api/proxy-image", {
      method: "POST",
      body: JSON.stringify({ url: "https://cdn.example.com/image.webp" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/webp");
    expect(response.headers.get("cache-control")).toBe("private, no-cache");
    expect(await response.arrayBuffer()).toEqual(new Uint8Array([1, 2, 3]).buffer);
  });

  it("rejects oversized images", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "image/png" }),
      arrayBuffer: vi.fn().mockResolvedValue({ byteLength: 20 * 1024 * 1024 + 1 }),
    });

    const { POST } = await import("@/app/api/proxy-image/route");
    const request = new NextRequest("http://localhost:3000/api/proxy-image", {
      method: "POST",
      body: JSON.stringify({ url: "https://cdn.example.com/huge.png" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "Image too large" });
  });
});
