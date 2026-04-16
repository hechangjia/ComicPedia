import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/lib/retryQueue", () => ({
  withRetry: vi.fn(async (fn: () => Promise<string>) => fn()),
}));

vi.mock("@/lib/errors", () => ({
  AppError: class AppError extends Error {
    code: string;
    retryable: boolean;
    constructor(opts: { code: string; message: string; retryable: boolean }) {
      super(opts.message);
      this.code = opts.code;
      this.retryable = opts.retryable;
    }
  },
}));

vi.mock("@/lib/config/styles", () => ({
  getStyleModifier: vi.fn((style: string) => `${style}-modifier`),
  getStyleNegativePrompt: vi.fn((style: string) =>
    style === "anime" ? "realistic, photo" : ""
  ),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock btoa for PromptOnlyAdapter
global.btoa = (s: string) => Buffer.from(s).toString("base64");

import { getImageAdapter } from "@/lib/imageGen/index";

describe("imageGen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Adapter Selection ──

  describe("getImageAdapter", () => {
    it("returns PromptOnlyAdapter when no config", () => {
      const adapter = getImageAdapter();
      expect(adapter.name).toBe("Prompt Only");
    });

    it("returns PromptOnlyAdapter when apiUrl is empty", () => {
      const adapter = getImageAdapter({ apiUrl: "" });
      expect(adapter.name).toBe("Prompt Only");
    });

    it("returns PromptOnlyAdapter when apiUrl is undefined", () => {
      const adapter = getImageAdapter({ apiUrl: undefined });
      expect(adapter.name).toBe("Prompt Only");
    });

    it("returns ComfyUIAdapter for comfyui endpointType", () => {
      const adapter = getImageAdapter({
        apiUrl: "http://localhost:8188",
        endpointType: "comfyui",
      });
      expect(adapter.name).toBe("ComfyUI");
    });

    it("returns ChatImageAdapter for chat endpointType", () => {
      const adapter = getImageAdapter({
        apiUrl: "http://api.example.com",
        endpointType: "chat",
      });
      expect(adapter.name).toBe("Chat Image API");
    });

    it("returns ChatImageAdapter for images endpointType", () => {
      const adapter = getImageAdapter({
        apiUrl: "http://api.example.com",
        endpointType: "images",
      });
      expect(adapter.name).toBe("Chat Image API");
    });

    it("returns ChatImageAdapter for auto endpointType", () => {
      const adapter = getImageAdapter({
        apiUrl: "http://api.example.com",
        endpointType: "auto",
      });
      expect(adapter.name).toBe("Chat Image API");
    });

    it("defaults endpointType to auto", () => {
      const adapter = getImageAdapter({
        apiUrl: "http://api.example.com",
      });
      expect(adapter.name).toBe("Chat Image API");
    });
  });

  // ── PromptOnlyAdapter ──

  describe("PromptOnlyAdapter", () => {
    it("returns base64 text data URI", async () => {
      const adapter = getImageAdapter();
      const result = await adapter.generate("a cat", "anime");
      expect(result).toMatch(/^data:text\/plain;base64,/);
    });

    it("includes style modifier in output", async () => {
      const adapter = getImageAdapter();
      const result = await adapter.generate("a cat", "anime");
      const decoded = Buffer.from(
        result.replace("data:text/plain;base64,", ""),
        "base64"
      ).toString("utf-8");
      expect(decoded).toContain("anime-modifier");
      expect(decoded).toContain("a cat");
    });
  });

  // ── ChatImageAdapter ──

  describe("ChatImageAdapter", () => {
    const baseConfig = {
      apiUrl: "http://api.example.com/v1",
      apiKey: "test-key",
      model: "dall-e-3",
    };

    it("sends request to /api/image proxy", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "application/json" },
        text: () =>
          Promise.resolve(
            JSON.stringify({ data: [{ b64_json: "abc123" }] })
          ),
      });

      const adapter = getImageAdapter(baseConfig);
      await adapter.generate("a cat", "anime");

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/image",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("extracts image from OpenAI images API format (b64_json)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "application/json" },
        text: () =>
          Promise.resolve(
            JSON.stringify({ data: [{ b64_json: "iVBORtest" }] })
          ),
      });

      const adapter = getImageAdapter(baseConfig);
      const result = await adapter.generate("a cat", "anime");
      expect(result).toBe("data:image/png;base64,iVBORtest");
    });

    it("extracts image from OpenAI images API format (url)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "application/json" },
        text: () =>
          Promise.resolve(
            JSON.stringify({
              data: [{ url: "https://example.com/img.png" }],
            })
          ),
      });

      const adapter = getImageAdapter(baseConfig);
      const result = await adapter.generate("a cat", "anime");
      expect(result).toBe("https://example.com/img.png");
    });

    it("extracts image from chat completions multimodal format", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "application/json" },
        text: () =>
          Promise.resolve(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: [
                      {
                        type: "image_url",
                        image_url: { url: "https://example.com/gen.png" },
                      },
                    ],
                  },
                },
              ],
            })
          ),
      });

      const adapter = getImageAdapter({ ...baseConfig, endpointType: "chat" });
      const result = await adapter.generate("a cat", "anime");
      expect(result).toBe("https://example.com/gen.png");
    });

    it("extracts image from Gemini inline_data format", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "application/json" },
        text: () =>
          Promise.resolve(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: [
                      {
                        inline_data: {
                          mime_type: "image/jpeg",
                          data: "geminiBase64",
                        },
                      },
                    ],
                  },
                },
              ],
            })
          ),
      });

      const adapter = getImageAdapter({ ...baseConfig, endpointType: "chat" });
      const result = await adapter.generate("a cat", "anime");
      expect(result).toBe("data:image/jpeg;base64,geminiBase64");
    });

    it("extracts from string content URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "application/json" },
        text: () =>
          Promise.resolve(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: "https://cdn.example.com/image.png",
                  },
                },
              ],
            })
          ),
      });

      const adapter = getImageAdapter({ ...baseConfig, endpointType: "chat" });
      const result = await adapter.generate("a cat", "anime");
      expect(result).toBe("https://cdn.example.com/image.png");
    });

    it("throws non-retryable error on 401", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        headers: { get: () => "text/plain" },
        text: () => Promise.resolve("Unauthorized"),
      });

      const adapter = getImageAdapter(baseConfig);
      await expect(adapter.generate("a cat", "anime")).rejects.toThrow(
        /文生图 API 错误/
      );
    });

    it("throws on unextractable response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "application/json" },
        text: () => Promise.resolve(JSON.stringify({ unrelated: true })),
      });

      const adapter = getImageAdapter(baseConfig);
      await expect(adapter.generate("a cat", "anime")).rejects.toThrow(
        /无法从 API 响应中提取图片/
      );
    });

    it("handles non-JSON response with data URI", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "text/plain" },
        text: () => Promise.resolve("data:image/png;base64,abc123"),
      });

      const adapter = getImageAdapter(baseConfig);
      const result = await adapter.generate("a cat", "anime");
      expect(result).toBe("data:image/png;base64,abc123");
    });

    it("includes Authorization header when apiKey provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "application/json" },
        text: () =>
          Promise.resolve(JSON.stringify({ data: [{ url: "http://x.com/i.png" }] })),
      });

      const adapter = getImageAdapter({ ...baseConfig, apiKey: "sk-test" });
      await adapter.generate("a cat", "anime");

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.headers.Authorization).toBe("Bearer sk-test");
    });

    it("uses images endpoint by default for auto mode", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "application/json" },
        text: () =>
          Promise.resolve(JSON.stringify({ data: [{ url: "http://x.com/i.png" }] })),
      });

      const adapter = getImageAdapter({
        apiUrl: "http://api.example.com/v1",
        endpointType: "auto",
      });
      await adapter.generate("a cat", "anime");

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.targetUrl).toContain("/images/generations");
    });

    it("uses chat endpoint when endpointType is chat", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "application/json" },
        text: () =>
          Promise.resolve(
            JSON.stringify({
              choices: [{ message: { content: "https://x.com/i.png" } }],
            })
          ),
      });

      const adapter = getImageAdapter({
        apiUrl: "http://api.example.com/v1",
        endpointType: "chat",
      });
      await adapter.generate("a cat", "anime");

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.targetUrl).toContain("/chat/completions");
    });
  });

  // ── ComfyUIAdapter ──

  describe("ComfyUIAdapter", () => {
    it("throws when no workflow configured", async () => {
      const adapter = getImageAdapter({
        apiUrl: "http://localhost:8188",
        endpointType: "comfyui",
      });

      await expect(adapter.generate("a cat", "anime")).rejects.toThrow(
        /未配置 ComfyUI Workflow/
      );
    });

    it("throws on invalid workflow JSON", async () => {
      const adapter = getImageAdapter({
        apiUrl: "http://localhost:8188",
        endpointType: "comfyui",
        comfyuiWorkflow: "not json{{{",
      });

      await expect(adapter.generate("a cat", "anime")).rejects.toThrow(
        /Workflow JSON 格式错误/
      );
    });

    it("sends request to /api/comfyui", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ image: "data:image/png;base64,abc" }),
      });

      const adapter = getImageAdapter({
        apiUrl: "http://localhost:8188",
        endpointType: "comfyui",
        comfyuiWorkflow: '{"nodes":{}}',
      });

      const result = await adapter.generate("a cat", "anime");

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/comfyui",
        expect.objectContaining({ method: "POST" })
      );
      expect(result).toBe("data:image/png;base64,abc");
    });

    it("throws when ComfyUI returns no image", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const adapter = getImageAdapter({
        apiUrl: "http://localhost:8188",
        endpointType: "comfyui",
        comfyuiWorkflow: '{"nodes":{}}',
      });

      await expect(adapter.generate("a cat", "anime")).rejects.toThrow(
        /ComfyUI 未返回图片/
      );
    });

    it("throws retryable error on 500", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "Internal error" }),
      });

      const adapter = getImageAdapter({
        apiUrl: "http://localhost:8188",
        endpointType: "comfyui",
        comfyuiWorkflow: '{"nodes":{}}',
      });

      await expect(adapter.generate("a cat", "anime")).rejects.toThrow(
        /Internal error/
      );
    });
  });

  // ── Config defaults ──

  describe("configuration defaults", () => {
    it("defaults model to dall-e-3", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "application/json" },
        text: () =>
          Promise.resolve(JSON.stringify({ data: [{ url: "http://x.com/i.png" }] })),
      });

      const adapter = getImageAdapter({ apiUrl: "http://api.example.com/v1" });
      await adapter.generate("a cat", "anime");

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.payload.model).toBe("dall-e-3");
    });

    it("defaults size to 1024x1024", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "application/json" },
        text: () =>
          Promise.resolve(JSON.stringify({ data: [{ url: "http://x.com/i.png" }] })),
      });

      const adapter = getImageAdapter({ apiUrl: "http://api.example.com/v1" });
      await adapter.generate("a cat", "anime");

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.payload.size).toBe("1024x1024");
    });
  });
});
