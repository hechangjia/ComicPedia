import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const runComfyWorkflowMock = vi.fn();
const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

vi.mock("@/lib/server/comfyuiClient", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/comfyuiClient")>("@/lib/server/comfyuiClient");
  return {
    ...actual,
    runComfyWorkflow: runComfyWorkflowMock,
  };
});

function mockJsonResponse(body: unknown, ok: boolean = true, status: number = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("/api/comfyui POST", () => {
  beforeEach(() => {
    runComfyWorkflowMock.mockReset();
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it("pings ComfyUI with the normalized base url", async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({
      devices: [{ name: "RTX 4090" }],
    }));

    const { POST } = await import("@/app/api/comfyui/route");
    const request = new NextRequest("http://localhost:3000/api/comfyui", {
      method: "POST",
      body: JSON.stringify({
        comfyuiUrl: "http://localhost:8188/",
        ping: true,
      }),
    });

    const response = await POST(request);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8188/system_stats",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      detail: "GPU: RTX 4090",
    });
  });

  it("returns 502 when the ComfyUI ping fails", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const { POST } = await import("@/app/api/comfyui/route");
    const request = new NextRequest("http://localhost:3000/api/comfyui", {
      method: "POST",
      body: JSON.stringify({
        comfyuiUrl: "http://localhost:8188",
        ping: true,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "无法连接 ComfyUI (http://localhost:8188): ECONNREFUSED",
    });
  });

  it("requires comfyuiUrl, workflow, and prompt for generation requests", async () => {
    const { POST } = await import("@/app/api/comfyui/route");
    const request = new NextRequest("http://localhost:3000/api/comfyui", {
      method: "POST",
      body: JSON.stringify({
        comfyuiUrl: "http://localhost:8188",
        workflow: {},
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "缺少必要参数: comfyuiUrl, workflow, prompt",
    });
    expect(runComfyWorkflowMock).not.toHaveBeenCalled();
  });

  it("passes workflow generation payload through to the ComfyUI client", async () => {
    runComfyWorkflowMock.mockResolvedValue({
      image: "data:image/png;base64,abc",
      promptId: "prompt-1",
      seed: 42,
    });

    const { POST } = await import("@/app/api/comfyui/route");
    const request = new NextRequest("http://localhost:3000/api/comfyui", {
      method: "POST",
      body: JSON.stringify({
        comfyuiUrl: "http://localhost:8188",
        workflow: { "1": { class_type: "KSampler" } },
        prompt: "draw a cat",
        width: 1024,
        height: 768,
        seed: 42,
        negativePrompt: "blurry",
        referenceImage: "data:image/png;base64,ref",
      }),
    });

    const response = await POST(request);

    expect(runComfyWorkflowMock).toHaveBeenCalledWith({
      comfyuiUrl: "http://localhost:8188",
      workflow: { "1": { class_type: "KSampler" } },
      prompt: "draw a cat",
      width: 1024,
      height: 768,
      seed: 42,
      negativePrompt: "blurry",
      referenceImage: "data:image/png;base64,ref",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      image: "data:image/png;base64,abc",
    });
  });

  it("maps ComfyUIClientError to its declared status code", async () => {
    const { ComfyUIClientError } = await import("@/lib/server/comfyuiClient");
    runComfyWorkflowMock.mockRejectedValue(new ComfyUIClientError("workflow exploded", 504));

    const { POST } = await import("@/app/api/comfyui/route");
    const request = new NextRequest("http://localhost:3000/api/comfyui", {
      method: "POST",
      body: JSON.stringify({
        comfyuiUrl: "http://localhost:8188",
        workflow: { "1": { class_type: "KSampler" } },
        prompt: "draw a cat",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({
      error: "workflow exploded",
    });
  });
});
