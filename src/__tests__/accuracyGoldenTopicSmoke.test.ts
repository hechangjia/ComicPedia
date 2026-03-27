import { describe, expect, it } from "vitest";
import type { UserAPIConfigV2 } from "@/lib/types";

describe("accuracy golden topic smoke helpers", () => {
  it("defines five golden-topic smoke cases spanning science and wikipedia flows", async () => {
    const { getAccuracyGoldenTopicSmokeCases } = await import("@/lib/accuracy/goldenTopicSmoke");

    const cases = getAccuracyGoldenTopicSmokeCases();

    expect(cases).toHaveLength(5);
    expect(cases.map((item) => item.topic)).toEqual([
      "女娲",
      "DNA",
      "牛顿",
      "火药",
      "为什么会打雷",
    ]);
    expect(new Set(cases.map((item) => item.contentType))).toEqual(new Set(["science", "wikipedia"]));
  });

  it("resolves the active llm config for smoke runs", async () => {
    const { resolveAccuracySmokeLlmConfig } = await import("@/lib/accuracy/goldenTopicSmoke");

    const config: UserAPIConfigV2 = {
      version: 2,
      llmConfigs: [
        {
          id: "llm-1",
          name: "LLM 1",
          provider: "openai",
          apiUrl: "https://example.com/v1",
          apiKey: "key-1",
          model: "gpt-4o-mini",
          protocolType: "openai-compatible",
        },
        {
          id: "llm-2",
          name: "LLM 2",
          provider: "claude",
          apiUrl: "https://api.anthropic.com/v1/messages",
          apiKey: "key-2",
          model: "claude-3-7-sonnet",
          protocolType: "anthropic",
        },
      ],
      imageConfigs: [],
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
      activeLLMId: "llm-2",
      activeImageId: null,
      activeVLMId: null,
      updatedAt: "2026-03-27T00:00:00.000Z",
    };

    expect(resolveAccuracySmokeLlmConfig(config)).toEqual({
      apiUrl: "https://api.anthropic.com/v1/messages",
      apiKey: "key-2",
      model: "claude-3-7-sonnet",
      provider: "anthropic",
    });
  });

  it("falls back to the first llm config when activeLLMId is missing", async () => {
    const { resolveAccuracySmokeLlmConfig } = await import("@/lib/accuracy/goldenTopicSmoke");

    const config: UserAPIConfigV2 = {
      version: 2,
      llmConfigs: [
        {
          id: "llm-1",
          name: "LLM 1",
          provider: "openai",
          apiUrl: "https://example.com/v1",
          apiKey: "key-1",
          model: "gpt-4o-mini",
          protocolType: "openai-compatible",
        },
      ],
      imageConfigs: [],
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
      activeLLMId: null,
      activeImageId: null,
      activeVLMId: null,
      updatedAt: "2026-03-27T00:00:00.000Z",
    };

    expect(resolveAccuracySmokeLlmConfig(config)).toEqual({
      apiUrl: "https://example.com/v1",
      apiKey: "key-1",
      model: "gpt-4o-mini",
      provider: "openai-compatible",
    });
  });

  it("uses the preferred llm id when one is provided", async () => {
    const { resolveAccuracySmokeLlmConfig } = await import("@/lib/accuracy/goldenTopicSmoke");

    const config: UserAPIConfigV2 = {
      version: 2,
      llmConfigs: [
        {
          id: "llm-1",
          name: "LLM 1",
          provider: "openai",
          apiUrl: "https://example.com/v1",
          apiKey: "key-1",
          model: "gpt-4o-mini",
          protocolType: "openai-compatible",
        },
        {
          id: "llm-2",
          name: "LLM 2",
          provider: "claude",
          apiUrl: "https://api.anthropic.com/v1/messages",
          apiKey: "key-2",
          model: "claude-3-7-sonnet",
          protocolType: "anthropic",
        },
      ],
      imageConfigs: [],
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
      activeImageId: null,
      activeVLMId: null,
      updatedAt: "2026-03-27T00:00:00.000Z",
    };

    expect(resolveAccuracySmokeLlmConfig(config, "llm-2")).toEqual({
      apiUrl: "https://api.anthropic.com/v1/messages",
      apiKey: "key-2",
      model: "claude-3-7-sonnet",
      provider: "anthropic",
    });
  });

  it("throws when no llm config is available for smoke runs", async () => {
    const { resolveAccuracySmokeLlmConfig } = await import("@/lib/accuracy/goldenTopicSmoke");

    const config: UserAPIConfigV2 = {
      version: 2,
      llmConfigs: [],
      imageConfigs: [],
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
      activeLLMId: null,
      activeImageId: null,
      activeVLMId: null,
      updatedAt: "2026-03-27T00:00:00.000Z",
    };

    expect(() => resolveAccuracySmokeLlmConfig(config)).toThrow(/LLM/);
  });
});
