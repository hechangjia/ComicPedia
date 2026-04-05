import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { forwardImageGenerationRequest } from "@/lib/server/imageGenerationService";
import { runComfyWorkflow } from "@/lib/server/comfyuiClient";

describe("image provider services", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("runComfyWorkflow returns base64 image after prompt -> history -> view", async () => {
    const randomValue = 0.1234;
    const expectedSeed = Math.floor(randomValue * 2 ** 53);
    vi.spyOn(Math, "random").mockReturnValue(randomValue);

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/prompt")) {
        const reqBody = JSON.parse(String(init?.body));
        expect(reqBody.prompt["1"].inputs.text).toBe("new prompt");
        expect(reqBody.prompt["2"].inputs.seed).toBe(expectedSeed);
        expect(reqBody.prompt["3"].inputs.width).toBe(1024);
        expect(reqBody.prompt["3"].inputs.height).toBe(768);
        return new Response(JSON.stringify({ prompt_id: "pid-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/history/pid-1")) {
        return new Response(JSON.stringify({
          "pid-1": {
            status: { completed: true },
            outputs: {
              "save-1": {
                images: [{ filename: "result.png", subfolder: "", type: "output" }],
              },
            },
          },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/view?")) {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "Content-Type": "image/png" },
        });
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runComfyWorkflow({
      comfyuiUrl: "http://127.0.0.1:8188/",
      workflow: {
        "1": { class_type: "CLIPTextEncode", inputs: { text: "old prompt" } },
        "2": { class_type: "KSampler", inputs: { seed: 1, positive: ["1", 0] } },
        "3": { class_type: "EmptyLatentImage", inputs: { width: 512, height: 512 } },
      },
      prompt: "new prompt",
      width: 1024,
      height: 768,
    });

    expect(result.promptId).toBe("pid-1");
    expect(result.seed).toBe(expectedSeed);
    expect(result.image).toBe("data:image/png;base64,AQID");
  });

  it("runComfyWorkflow honors explicit seed when provided", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.98765);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/prompt")) {
        const reqBody = JSON.parse(String(init?.body));
        expect(reqBody.prompt["2"].inputs.seed).toBe(424242);
        return new Response(JSON.stringify({ prompt_id: "pid-seed" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/history/pid-seed")) {
        return new Response(JSON.stringify({
          "pid-seed": {
            status: { completed: true },
            outputs: {
              "save-1": {
                images: [{ filename: "seed.png", subfolder: "", type: "output" }],
              },
            },
          },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/view?")) {
        return new Response(new Uint8Array([4, 2]), {
          status: 200,
          headers: { "Content-Type": "image/png" },
        });
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runComfyWorkflow({
      comfyuiUrl: "http://127.0.0.1:8188",
      workflow: {
        "1": { class_type: "CLIPTextEncode", inputs: { text: "old prompt" } },
        "2": { class_type: "KSampler", inputs: { seed: 1, positive: ["1", 0] } },
      },
      prompt: "seed prompt",
      seed: 424242,
    });

    expect(result.seed).toBe(424242);
  });

  it("runComfyWorkflow tolerates transient history poll failures after prompt submission", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ prompt_id: "pid-retry" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockRejectedValueOnce(new Error("temporary poll failure"))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        "pid-retry": {
          status: { completed: true },
          outputs: {
            "save-1": {
              images: [{ filename: "retry.png", subfolder: "", type: "output" }],
            },
          },
        },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(new Uint8Array([7, 8, 9]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runComfyWorkflow({
      comfyuiUrl: "http://127.0.0.1:8188/",
      workflow: {
        "1": { class_type: "CLIPTextEncode", inputs: { text: "old prompt" } },
        "2": { class_type: "KSampler", inputs: { seed: 1, positive: ["1", 0] } },
      },
      prompt: "retry prompt",
    });

    expect(result.promptId).toBe("pid-retry");
    expect(result.image).toBe("data:image/png;base64,BwgJ");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("forwardImageGenerationRequest parses JSON and resolves external image URLs", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://api.example.com/v1/images/generations") {
        return new Response(JSON.stringify({
          data: [{ url: "http://cdn.example.com/a.png" }],
          choices: [{ message: { content: "https://cdn.example.com/b.jpg" } }],
          output: [{ url: "https://cdn.example.com/c.webp" }],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("cdn.example.com")) {
        return new Response(new Uint8Array([255, 0, 255]), {
          status: 200,
          headers: { "Content-Type": "image/png" },
        });
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await forwardImageGenerationRequest({
      targetUrl: "https://api.example.com/v1/images/generations",
      headers: { Authorization: "Bearer test" },
      payload: { prompt: "robot cat" },
    });

    expect(typeof result).toBe("object");
    const json = result as Record<string, any>;
    expect(json.data[0].url).toMatch(/^data:image\/png;base64,/);
    expect(json.choices[0].message.content).toMatch(/^data:image\/png;base64,/);
    expect(json.output[0].url).toMatch(/^data:image\/png;base64,/);
  });

  it("/api/image preserves upstream content-type for non-JSON success responses", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://api.example.com/raw") {
        return new Response("<svg></svg>", {
          status: 200,
          headers: { "Content-Type": "image/svg+xml" },
        });
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("http://localhost:3000/api/image", {
      method: "POST",
      body: JSON.stringify({
        targetUrl: "https://api.example.com/raw",
        headers: {},
        payload: { prompt: "x" },
      }),
    });

    const { POST } = await import("@/app/api/image/route");
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/svg+xml");
    expect(await response.text()).toBe("<svg></svg>");
  });
});
