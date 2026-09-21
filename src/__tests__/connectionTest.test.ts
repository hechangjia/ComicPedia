import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testImageConnection, testLLMConnection, testVLMConnection } from "@/lib/api/connectionTest";
import type { UserImageConfig, UserLLMConfig } from "@/lib/types";

const originalFetch = globalThis.fetch;

function makeImageConfig(overrides: Partial<UserImageConfig> = {}): UserImageConfig {
  return {
    id: "image-test",
    name: "Image Test",
    provider: "custom",
    apiUrl: "https://aiapi.exe.xyz",
    apiKey: "secret",
    model: "google/nano-banana-2",
    size: "1024x1024",
    endpointType: "chat",
    ...overrides,
  };
}

describe("connectionTest", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("reports html pages as an invalid image api endpoint instead of a successful connection", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("<!doctype html><html><body>Not an API</body></html>", {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    }));

    const result = await testImageConnection(makeImageConfig());

    expect(result).toEqual(
      expect.objectContaining({
        status: "error",
        message: expect.stringContaining("HTML"),
        detail: expect.stringContaining("/chat/completions"),
      }),
    );
  });
});


const luna: UserLLMConfig = { id: "luna", name: "Local Luna", provider: "custom", apiUrl: "http://localhost:8317", apiKey: "test-only-secret", model: "gpt-5.6-luna", protocolType: "openai-compatible" };

describe("truthful model capability tests", () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => { globalThis.fetch = originalFetch; vi.unstubAllGlobals(); });
  it.each([
    { choices: [{ message: { content: "I can only produce text" } }] },
    { data: [] },
    { unexpected: true },
  ])("does not claim image generation from a non-image HTTP 200: %j", async (data) => {
    vi.mocked(fetch).mockResolvedValue(Response.json(data));
    expect((await testImageConnection(makeImageConfig())).status).toBe("error");
  });
  it("requires a real textual output", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ choices: [] }));
    expect((await testLLMConnection(luna)).status).toBe("error");
  });
  it("sends actual image input for vision and checks its answer", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ choices: [{ message: { content: '{"left":"red","right":"blue"}' } }] }));
    const result = await testVLMConnection(luna);
    expect(result.status).toBe("success");
    const request = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(request.targetUrl).toBe("http://localhost:8317/v1/chat/completions");
    expect(request.payload.messages[0].content.some((part: { type: string }) => part.type === "image_url")).toBe(true);
  });
  it("rejects vision responses that did not identify the actual image", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ choices: [{ message: { content: '{"left":"blue","right":"red"}' } }] }));
    expect((await testVLMConnection(luna)).status).toBe("error");
  });
  it("does not leak the supplied credential through provider errors", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(luna.apiKey, { status: 401 }));
    expect(JSON.stringify(await testLLMConnection(luna))).not.toContain(luna.apiKey);
  });
  it("reports decoded image dimensions, not the requested dimensions", async () => {
    vi.stubGlobal("Image", class {
      naturalWidth = 1374;
      naturalHeight = 1145;
      onload?: () => void;
      onerror?: () => void;
      set src(value: string) { if (value) queueMicrotask(() => this.onload?.()); }
    });
    vi.mocked(fetch).mockResolvedValue(Response.json({ data: [{ b64_json: "aW1hZ2U=" }] }));
    const result = await testImageConnection(makeImageConfig({ endpointType: "images", model: "gpt-image-2" }));
    expect(result.status).toBe("success");
    expect(result.detail).toContain("1374×1145");
  });
  it("uses POST for external artifact decoding without forwarding provider credentials", async () => {
    vi.stubGlobal("Image", class {
      naturalWidth = 64; naturalHeight = 64;
      onload?: () => void;
      set src(value: string) { if (value) queueMicrotask(() => this.onload?.()); }
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ data: [{ url: "https://images.example/artifact.png" }] }))
      .mockResolvedValueOnce(new Response("image", { headers: { "Content-Type": "image/png" } }));
    const result = await testImageConnection(makeImageConfig());
    expect(result.status).toBe("success");
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe("/api/proxy-image");
    const request = vi.mocked(fetch).mock.calls[1][1]!;
    expect(request.method).toBe("POST");
    expect(JSON.parse(request.body as string)).toEqual({ url: "https://images.example/artifact.png" });
    expect(JSON.stringify(request)).not.toContain("secret");
  });
  it("rejects an invalid image payload even when the envelope looks correct", async () => {
    vi.stubGlobal("Image", class {
      onerror?: () => void;
      set src(value: string) { if (value) queueMicrotask(() => this.onerror?.()); }
    });
    vi.mocked(fetch).mockResolvedValue(Response.json({ data: [{ b64_json: "bm90LWFuLWltYWdl" }] }));
    expect((await testImageConnection(makeImageConfig())).status).toBe("error");
  });

  it("tests saved text and vision using role references rather than blank credentials", async () => {
    const config: UserLLMConfig = { id: "saved", name: "Saved", provider: "custom", apiUrl: "http://localhost:8317", apiKey: "", hasApiKey: true, model: "text", protocolType: "openai-compatible" };
    vi.mocked(fetch).mockResolvedValue(Response.json({ choices: [{ message: { content: "COMICPEDIA_OK" } }] }));
    expect((await testLLMConnection(config, true)).status).toBe("success");
    let body = JSON.parse(vi.mocked(fetch).mock.calls.at(-1)![1]!.body as string);
    expect(body.modelRef).toEqual({ id: "saved", role: "llm" }); expect(body.headers).toBeUndefined(); expect(body.targetUrl).toBeUndefined();
    await testVLMConnection(config, true);
    body = JSON.parse(vi.mocked(fetch).mock.calls.at(-1)![1]!.body as string);
    expect(body.modelRef).toEqual({ id: "saved", role: "vlm" });
  });

  it("tests saved image services by reference including ComfyUI ping", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({}));
    await testImageConnection(makeImageConfig({ apiKey: "", hasApiKey: true }), true);
    expect(JSON.parse(vi.mocked(fetch).mock.calls.at(-1)![1]!.body as string).modelRef).toEqual({ id: "image-test", role: "image" });
    await testImageConnection(makeImageConfig({ endpointType: "comfyui" }), true);
    expect(JSON.parse(vi.mocked(fetch).mock.calls.at(-1)![1]!.body as string)).toEqual({ modelRef: { id: "image-test", role: "image" }, ping: true });
  });

});
