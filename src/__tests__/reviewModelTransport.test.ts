import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createEmptyUserConfig } from "@/lib/config/userConfig";
import { resolveReviewModel } from "@/lib/config/reviewModel";
import { callVisionModel } from "@/lib/vlmScorer";
import { callLLM } from "@/lib/llm/client";
import type { UserAPIConfigV2 } from "@/lib/types";
const store = vi.hoisted(() => ({ getConfig: vi.fn() }));
vi.mock("@/lib/server/db", () => store);
vi.mock("@/lib/retryQueue", () => ({ withRetry: (fn: () => unknown) => fn() }));
import { POST } from "@/app/api/llm/route";

let browserConfig: UserAPIConfigV2;
beforeEach(() => {
  const model = { id: "collision", name: "QA", provider: "custom" as const, apiUrl: "http://localhost:18343", apiKey: "server-text-fixture", model: "identical-model", protocolType: "openai-compatible" as const };
  const saved: UserAPIConfigV2 = { ...createEmptyUserConfig(), llmConfigs: [model], vlmConfigs: [{ ...model, protocolType: "anthropic", apiKey: "server-vision-fixture" }], activeLLMId: model.id, activeVLMId: model.id };
  store.getConfig.mockReturnValue(saved);
  browserConfig = { ...saved, llmConfigs: saved.llmConfigs.map(c => ({ ...c, apiKey: "", hasApiKey: true })), vlmConfigs: saved.vlmConfigs!.map(c => ({ ...c, apiKey: "", hasApiKey: true })) };
  vi.stubGlobal("window", {}); vi.stubGlobal("document", {});
});
afterEach(() => vi.unstubAllGlobals());

describe("review config through browser transport and server proxy", () => {
  it.each(["llm", "vlm"] as const)("resolves only the saved %s credential for otherwise colliding entries", async role => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === "/api/llm") return POST(new NextRequest("http://localhost/api/llm", { method: init?.method, headers: init?.headers, body: init?.body }));
      return Response.json(role === "vlm" ? { content: [{ type: "text", text: "OK" }] } : { choices: [{ message: { content: "OK" } }] });
    }));
    const selected = resolveReviewModel(browserConfig, role);
    const output = role === "vlm" ? await callVisionModel("QA", "data:image/png;base64,QA", selected) : await callLLM("QA", selected);
    expect(output).toBe("OK");
    expect(calls).toHaveLength(2);
    const browserBody = JSON.parse(String(calls[0].init!.body));
    expect(browserBody.modelRef).toEqual({ id: "collision", role });
    expect(browserBody).not.toHaveProperty("headers");
    expect(browserBody).not.toHaveProperty("targetUrl");
    expect(JSON.stringify(browserBody)).not.toContain("fixture");
    expect(calls[1].url).toBe(`http://localhost:18343/v1/${role === "vlm" ? "messages" : "chat/completions"}`);
    const headers = calls[1].init!.headers;
    expect(headers).toMatchObject(role === "vlm" ? { "x-api-key": "server-vision-fixture" } : { Authorization: "Bearer server-text-fixture" });
    expect(headers).not.toHaveProperty(role === "vlm" ? "Authorization" : "x-api-key");
  });
  it("returns a deleted-config error without invoking an upstream or another role", async () => {
    const selected = resolveReviewModel(browserConfig, "vlm");
    store.getConfig().vlmConfigs = [];
    const fetcher = vi.fn((url: string, init?: RequestInit) => {
      expect(url).toBe("/api/llm");
      return POST(new NextRequest("http://localhost/api/llm", { method: init?.method, headers: init?.headers, body: init?.body }));
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(callVisionModel("QA", "data:image/png;base64,QA", selected)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
