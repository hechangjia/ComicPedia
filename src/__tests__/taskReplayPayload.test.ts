import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerateRequest, UserAPIConfigV2 } from "@/lib/types";

const { getConfigMock } = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
}));

vi.mock("@/lib/server/db", () => ({
  getConfig: getConfigMock,
}));

function makeConfig(): UserAPIConfigV2 {
  return {
    version: 2,
    llmConfigs: [
      {
        id: "llm-1",
        name: "OpenAI",
        provider: "openai",
        apiUrl: "https://api.example.com/v1",
        apiKey: "llm-secret",
        model: "gpt-4o",
        protocolType: "openai-compatible",
      },
    ],
    imageConfigs: [
      {
        id: "img-1",
        name: "Image",
        provider: "openai",
        apiUrl: "https://images.example.com/v1",
        apiKey: "img-secret",
        model: "gpt-image-1",
        size: "1024x1024",
        endpointType: "images",
      },
    ],
    vlmConfigs: [],
    accuracyConfig: {
      providers: [],
      slots: {
        primarySearch: null,
        fallbackSearch: null,
        primaryFetch: null,
        fallbackFetch: null,
      },
      whitelistDomains: [],
    },
    activeLLMId: "llm-1",
    activeImageId: "img-1",
    activeVLMId: null,
    updatedAt: "2026-04-05T00:00:00.000Z",
  };
}

describe("server script replay payload", () => {
  beforeEach(() => {
    vi.resetModules();
    getConfigMock.mockReset();
  });

  it("prefers explicit config ids and does not persist secret-bearing inline fallbacks", async () => {
    getConfigMock.mockReturnValue(makeConfig());
    const { buildServerScriptReplayPayload } = await import("@/lib/server/taskOrchestrator/replay");

    const request: GenerateRequest = {
      topic: "为什么会打雷",
      style: "flat",
      llmConfigId: "llm-1",
      imageConfigId: "img-1",
      llmConfig: {
        apiUrl: "https://api.example.com/v1",
        apiKey: "llm-secret",
        model: "gpt-4o",
        provider: "openai-compatible",
      },
      imageConfig: {
        apiUrl: "https://images.example.com/v1",
        apiKey: "img-secret",
        model: "gpt-image-1",
        size: "1024x1024",
        endpointType: "images",
      },
    };

    const payload = buildServerScriptReplayPayload(request);

    expect(payload).toEqual({
      request: {
        topic: "为什么会打雷",
        style: "flat",
        llmConfigId: "llm-1",
        imageConfigId: "img-1",
      },
      llm: {
        configId: "llm-1",
        fallback: undefined,
      },
      image: {
        configId: "img-1",
        fallback: undefined,
      },
    });
    expect(JSON.stringify(payload)).not.toContain("llm-secret");
    expect(JSON.stringify(payload)).not.toContain("img-secret");
  });

  it("hydrates by config id first and only uses sanitized local fallback when needed", async () => {
    getConfigMock.mockReturnValue(makeConfig());
    const { hydrateReplayRequest } = await import("@/lib/server/taskOrchestrator/replay");

    const hydrated = hydrateReplayRequest({
      request: {
        topic: "为什么会打雷",
        style: "flat",
        llmConfigId: "llm-1",
      },
      llm: {
        configId: "llm-1",
        fallback: {
          apiUrl: "http://localhost:11434/v1",
          model: "llama3",
          provider: "openai-compatible",
        },
      },
    });

    expect(hydrated.llmConfig).toEqual({
      apiUrl: "https://api.example.com/v1",
      apiKey: "llm-secret",
      model: "gpt-4o",
      provider: "openai-compatible",
    });

    getConfigMock.mockReturnValue(null);

    const localOnly = hydrateReplayRequest({
      request: {
        topic: "本地任务",
        style: "flat",
      },
      llm: {
        fallback: {
          apiUrl: "http://localhost:11434/v1",
          model: "llama3",
          provider: "openai-compatible",
        },
      },
    });

    expect(localOnly.llmConfig).toEqual({
      apiUrl: "http://localhost:11434/v1",
      model: "llama3",
      provider: "openai-compatible",
    });
  });
});
