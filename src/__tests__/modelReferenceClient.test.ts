import { afterEach, describe, expect, it, vi } from "vitest";
import { callLLM, callOpenAICompatibleStream } from "@/lib/llm/client";
import { getImageAdapter } from "@/lib/imageGen";
import { callVisionModel } from "@/lib/vlmScorer";
vi.mock("@/lib/retryQueue", () => ({ withRetry: (fn: () => unknown) => fn() }));
afterEach(() => vi.unstubAllGlobals());
const reference = { configId: "saved-text", configRole: "llm" as const, apiUrl: "http://localhost:8317", apiKey: "must-not-leave-browser", model: "configured-model", provider: "openai-compatible" as const };
function browserFetch(content: unknown, streaming = false) {
  vi.stubGlobal("window", {}); vi.stubGlobal("document", {});
  const fetcher = vi.fn().mockResolvedValue(new Response(streaming ? String(content) : JSON.stringify(content), { headers: { "Content-Type": streaming ? "text/event-stream" : "application/json" } }));
  vi.stubGlobal("fetch", fetcher); return fetcher;
}
function assertReference(fetcher: ReturnType<typeof vi.fn>, role: string, id: string) {
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body.modelRef).toEqual({ role, id }); expect(body.headers).toBeUndefined(); expect(body.targetUrl).toBeUndefined();
  expect(JSON.stringify(body)).not.toContain("must-not-leave-browser");
}
describe("browser model reference transport", () => {
  it("routes saved text without transmitting credentials", async () => {
    const fetcher = browserFetch({ choices: [{ message: { content: "OK" } }] });
    expect(await callLLM("QA", reference)).toBe("OK"); assertReference(fetcher, "llm", "saved-text");
  });
  it("routes saved streams without transmitting credentials", async () => {
    const fetcher = browserFetch('data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n', true);
    await callOpenAICompatibleStream("QA", reference, () => {}); assertReference(fetcher, "llm", "saved-text");
  });
  it("routes VLM independently of LLM and keeps multimodal inputs", async () => {
    const fetcher = browserFetch({ choices: [{ message: { content: "OK" } }] });
    await callVisionModel("QA", "data:image/png;base64,QA", { ...reference, configId: "saved-vision", configRole: "vlm" });
    assertReference(fetcher, "vlm", "saved-vision");
  });
  it("routes image generation through its saved role", async () => {
    const fetcher = browserFetch({ data: [{ b64_json: "QA" }] });
    const adapter = getImageAdapter({ ...reference, configId: "saved-image", configRole: "image", endpointType: "images" });
    await adapter.generate("QA", "anime"); assertReference(fetcher, "image", "saved-image");
  });
  it("does not require or transmit a saved ComfyUI workflow in the browser", async () => {
    const fetcher = browserFetch({ image: "data:image/png;base64,QA" });
    await getImageAdapter({ ...reference, configId: "comfy", configRole: "image", endpointType: "comfyui" }).generate("QA", "anime");
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.modelRef).toEqual({ id: "comfy", role: "image" }); expect(body.workflow).toBeUndefined(); expect(body.comfyuiUrl).toBeUndefined();
  });
});
