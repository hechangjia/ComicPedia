import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const forwardImageGenerationRequestMock = vi.fn();

vi.mock("@/lib/server/imageGenerationService", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/imageGenerationService")>("@/lib/server/imageGenerationService");
  return {
    ...actual,
    forwardImageGenerationRequest: forwardImageGenerationRequestMock,
  };
});

describe("/api/image POST", () => {
  beforeEach(() => {
    forwardImageGenerationRequestMock.mockReset();
  });

  it("requires targetUrl", async () => {
    const { POST } = await import("@/app/api/image/route");
    const request = new NextRequest("http://localhost:3000/api/image", {
      method: "POST",
      body: JSON.stringify({ payload: { prompt: "cat" } }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Missing targetUrl" });
    expect(forwardImageGenerationRequestMock).not.toHaveBeenCalled();
  });

  it("returns sanitized ImageGenerationServiceError payloads with matching status", async () => {
    const { ImageGenerationServiceError } = await import("@/lib/server/imageGenerationService");
    forwardImageGenerationRequestMock.mockRejectedValue(
      new ImageGenerationServiceError("认证失败，请检查 API Key 是否正确", 403),
    );

    const { POST } = await import("@/app/api/image/route");
    const request = new NextRequest("http://localhost:3000/api/image", {
      method: "POST",
      body: JSON.stringify({
        targetUrl: "https://api.example.com/v1/images",
        headers: { Authorization: "Bearer test" },
        payload: { prompt: "cat" },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "认证失败，请检查 API Key 是否正确",
      status: 403,
    });
  });

  it("maps timeout errors to 504", async () => {
    const timeoutError = new Error("timed out");
    timeoutError.name = "TimeoutError";
    forwardImageGenerationRequestMock.mockRejectedValue(timeoutError);

    const { POST } = await import("@/app/api/image/route");
    const request = new NextRequest("http://localhost:3000/api/image", {
      method: "POST",
      body: JSON.stringify({
        targetUrl: "https://api.example.com/v1/images",
        headers: {},
        payload: { prompt: "cat" },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({
      error: "Request timeout, please try again",
    });
  });

  it("returns JSON results from the image generation forwarder", async () => {
    forwardImageGenerationRequestMock.mockResolvedValue({
      data: [{ b64_json: "abc" }],
    });

    const { POST } = await import("@/app/api/image/route");
    const request = new NextRequest("http://localhost:3000/api/image", {
      method: "POST",
      body: JSON.stringify({
        targetUrl: "https://api.example.com/v1/images",
        headers: {},
        payload: { prompt: "cat" },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [{ b64_json: "abc" }],
    });
  });
});
