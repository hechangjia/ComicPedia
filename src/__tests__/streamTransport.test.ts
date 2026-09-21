import { afterEach, describe, expect, it, vi } from "vitest";
import {
  callOpenAICompatibleStream,
  callAnthropicStream,
  type LLMConfig,
} from "@/lib/llm/client";
const config: LLMConfig = {
  apiUrl: "http://127.0.0.1:1234/v1",
  apiKey: "",
  model: "synthetic",
  provider: "openai-compatible",
};
afterEach(() => vi.unstubAllGlobals());
describe("server streaming request and lifecycle callback", () => {
  it.each(["openai-compatible", "anthropic"] as const)(
    "requests real streaming for %s",
    async (provider) => {
      const fetch = vi.fn().mockResolvedValue(new Response("data: [DONE]\n\n"));
      vi.stubGlobal("fetch", fetch);
      const call =
        provider === "anthropic"
          ? callAnthropicStream
          : callOpenAICompatibleStream;
      await call("synthetic", { ...config, provider }, vi.fn());
      expect(JSON.parse(fetch.mock.calls[0][1].body).stream).toBe(true);
    },
  );
  it("propagates callback cancellation instead of treating it as invalid JSON, and releases the stream", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"choices":[{"delta":{"content":"late result"}}]}\n\n',
          ),
        );
      },
      cancel,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream)));
    const error = new Error("execution no longer owned");
    await expect(
      callOpenAICompatibleStream("synthetic", config, () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
  });
});
