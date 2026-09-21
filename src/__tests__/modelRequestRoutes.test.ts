import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createEmptyUserConfig } from "@/lib/config/userConfig";
const { getConfigMock, forwardMock, comfyMock } = vi.hoisted(() => ({ getConfigMock: vi.fn(), forwardMock: vi.fn(), comfyMock: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getConfig: getConfigMock }));
vi.mock("@/lib/server/imageGenerationService", () => ({ forwardImageGenerationRequest: forwardMock, ImageGenerationServiceError: class extends Error {} }));
vi.mock("@/lib/server/comfyuiClient", () => ({ runComfyWorkflow: comfyMock, ComfyUIClientError: class extends Error {} }));
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
  getConfigMock.mockReturnValue({ ...createEmptyUserConfig(), llmConfigs: [{ id: "text", model: "registered-text", apiUrl: "http://localhost:8317", apiKey: "server-only-secret", protocolType: "openai-compatible" }], imageConfigs: [{ id: "image", model: "registered-image", apiUrl: "http://localhost:8317", apiKey: "server-only-image", endpointType: "images" }, { id: "comfy", model: "workflow", apiUrl: "http://localhost:8188", size: "512x768", endpointType: "comfyui", comfyuiWorkflow: '{"node":{"class_type":"QA"}}' }] });
});
const request = (body: unknown) => new NextRequest("http://localhost/api/model", { method: "POST", body: JSON.stringify(body) });
describe("saved-model proxy routes", () => {
  it.each(["text", "stream"])("%s route resolves a reference before forwarding and refuses redirects", async kind => {
    const fetcher = vi.fn().mockResolvedValue(new Response(kind === "stream" ? "data: [DONE]\n\n" : '{"choices":[]}', { headers: { "Content-Type": kind === "stream" ? "text/event-stream" : "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    const { POST } = kind === "text" ? await import("@/app/api/llm/route") : await import("@/app/api/llm-stream/route");
    const response = await POST(request({ modelRef: { role: "llm", id: "text" }, payload: { messages: [], model: "injected" }, targetUrl: "https://other.example" }));
    expect(response.status).toBe(200);
    expect(fetcher.mock.calls[0][0]).toBe("http://localhost:8317/v1/chat/completions");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: "error", headers: { Authorization: "Bearer server-only-secret" } });
    expect(JSON.parse(fetcher.mock.calls[0][1].body).model).toBe("registered-text");
  });
  it("returns 404 for a deleted model and never forwards to a fallback URL", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const { POST } = await import("@/app/api/llm/route");
    const response = await POST(request({ modelRef: { role: "llm", id: "deleted" }, targetUrl: "https://other.example", payload: {} }));
    expect(response.status).toBe(404); expect(fetcher).not.toHaveBeenCalled();
  });
  it("resolves registered image auth before invoking the image service", async () => {
    forwardMock.mockResolvedValue({ data: [] });
    const { POST } = await import("@/app/api/image/route");
    const response = await POST(request({ modelRef: { role: "image", id: "image" }, payload: { prompt: "QA" } }));
    expect(response.status).toBe(200);
    expect(forwardMock).toHaveBeenCalledWith(expect.objectContaining({ targetUrl: "http://localhost:8317/v1/images/generations", headers: { Authorization: "Bearer server-only-image" }, payload: { prompt: "QA", model: "registered-image" } }));
  });
  it("uses the registered ComfyUI workflow, not the browser-supplied workflow or server URL", async () => {
    comfyMock.mockResolvedValue({ imageUrl: "data:image/png;base64,QA" });
    const { POST } = await import("@/app/api/comfyui/route");
    const response = await POST(request({ modelRef: { role: "image", id: "comfy" }, comfyuiUrl: "https://other.example", workflow: { bad: true }, prompt: "QA" }));
    expect(response.status).toBe(200);
    expect(comfyMock).toHaveBeenCalledWith(expect.objectContaining({ comfyuiUrl: "http://localhost:8188", workflow: { node: { class_type: "QA" } }, width: 512, height: 768 }));
  });
});
