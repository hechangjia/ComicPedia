import { describe, it, expect, vi, beforeEach } from "vitest";
import { callLLM, generateTopicResearch, buildEnhancedTopicFromResearch, TopicResearchResult } from "@/lib/llm";

// Mock withRetry to just call the function directly (no actual retries/delays)
vi.mock("@/lib/retryQueue", () => ({
  withRetry: (fn: () => Promise<unknown>) => fn(),
}));

// Mock contentRegistry (used by generateScript* but not by our tested functions)
vi.mock("@/lib/contentRegistry", () => ({
  getContentHandler: () => ({
    buildPrompt: () => "mock prompt",
    parseResponse: () => null,
  }),
}));

function mockFetchResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
  // Mock window/document to simulate browser environment
  (global as any).window = {};
  (global as any).document = {};
});

// ============================================================
// callLLM
// ============================================================
describe("callLLM", () => {
  it("routes to OpenAI-compatible and returns content", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      mockFetchResponse({ choices: [{ message: { content: "hello world" } }] })
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await callLLM("test prompt", {
      apiUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      model: "gpt-4o",
      provider: "openai-compatible",
    });

    expect(result).toBe("hello world");
    // Check either proxy format or direct format
    const firstArg = mockFetch.mock.calls[0][0];
    const secondArg = mockFetch.mock.calls[0][1];
    if (firstArg === "/api/llm") {
      // Proxy mode
      const body = JSON.parse(secondArg.body);
      expect(body.targetUrl).toContain("/chat/completions");
      expect(body.headers.Authorization).toBe("Bearer sk-test");
    } else {
      // Direct mode
      expect(firstArg).toContain("/chat/completions");
      const headers = secondArg.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer sk-test");
    }
  });

  it("routes to Anthropic and returns content", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      mockFetchResponse({ content: [{ text: "anthropic reply" }] })
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await callLLM("test prompt", {
      apiUrl: "https://api.anthropic.com/v1/messages",
      apiKey: "ant-key",
      model: "claude-3",
      provider: "anthropic",
    });

    expect(result).toBe("anthropic reply");
    const firstArg = mockFetch.mock.calls[0][0];
    const secondArg = mockFetch.mock.calls[0][1];
    if (firstArg === "/api/llm") {
      // Proxy mode
      const body = JSON.parse(secondArg.body);
      expect(body.headers["x-api-key"]).toBe("ant-key");
      expect(body.headers["anthropic-version"]).toBe("2023-06-01");
      expect(body.payload.max_tokens).toBe(2048);
    } else {
      // Direct mode
      const headers = secondArg.headers as Record<string, string>;
      expect(headers["x-api-key"]).toBe("ant-key");
      expect(headers["anthropic-version"]).toBe("2023-06-01");
    }
  });

  it("throws when apiUrl is missing", async () => {
    await expect(callLLM("test")).rejects.toThrow("未配置 LLM API");
  });

  it("throws descriptive error on 4xx response", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      mockFetchResponse("invalid api key", 401)
    );
    vi.stubGlobal("fetch", mockFetch);

    await expect(
      callLLM("test", { apiUrl: "https://api.openai.com/v1", provider: "openai-compatible" })
    ).rejects.toThrow("LLM API 错误 (401)");
  });

  it("throws retryable error on 429 response", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      mockFetchResponse("rate limited", 429)
    );
    vi.stubGlobal("fetch", mockFetch);

    await expect(
      callLLM("test", { apiUrl: "https://api.openai.com/v1", provider: "openai-compatible" })
    ).rejects.toThrow("LLM 暂时不可用: 429");
  });

  it("appends /chat/completions when apiUrl has no path", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      mockFetchResponse({ choices: [{ message: { content: "ok" } }] })
    );
    vi.stubGlobal("fetch", mockFetch);

    await callLLM("test", { apiUrl: "https://api.deepseek.com/v1", provider: "openai-compatible" });
    const firstArg = mockFetch.mock.calls[0][0];
    const secondArg = mockFetch.mock.calls[0][1];
    if (firstArg === "/api/llm") {
      // Proxy mode
      const body = JSON.parse(secondArg.body);
      expect(body.targetUrl).toBe("https://api.deepseek.com/v1/chat/completions");
    } else {
      // Direct mode
      expect(firstArg).toBe("https://api.deepseek.com/v1/chat/completions");
    }
  });

  it("preserves apiUrl when it already contains /chat/completions", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      mockFetchResponse({ choices: [{ message: { content: "ok" } }] })
    );
    vi.stubGlobal("fetch", mockFetch);

    await callLLM("test", {
      apiUrl: "https://custom.api.com/v1/chat/completions",
      provider: "openai-compatible",
    });
    const firstArg = mockFetch.mock.calls[0][0];
    const secondArg = mockFetch.mock.calls[0][1];
    if (firstArg === "/api/llm") {
      // Proxy mode
      const body = JSON.parse(secondArg.body);
      expect(body.targetUrl).toBe("https://custom.api.com/v1/chat/completions");
    } else {
      // Direct mode
      expect(firstArg).toBe("https://custom.api.com/v1/chat/completions");
    }
  });

  it("strips trailing slashes from apiUrl before appending path", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      mockFetchResponse({ choices: [{ message: { content: "ok" } }] })
    );
    vi.stubGlobal("fetch", mockFetch);

    await callLLM("test", { apiUrl: "https://api.example.com/v1///", provider: "openai-compatible" });
    const firstArg = mockFetch.mock.calls[0][0];
    const secondArg = mockFetch.mock.calls[0][1];
    if (firstArg === "/api/llm") {
      // Proxy mode
      const body = JSON.parse(secondArg.body);
      expect(body.targetUrl).toBe("https://api.example.com/v1/chat/completions");
    } else {
      // Direct mode
      expect(firstArg).toBe("https://api.example.com/v1/chat/completions");
    }
  });
});

// ============================================================
// generateTopicResearch
// ============================================================
describe("generateTopicResearch", () => {
  it("parses valid JSON response with all fields", async () => {
    const responseJson = {
      expandedDescription: "量子计算是一种利用量子力学原理进行计算的技术",
      keyFacts: ["量子比特", "叠加态", "量子纠缠"],
      narrativeAngle: "从经典计算的局限性出发",
      narrativeAngles: [
        { angle: "经典vs量子", relevance: 9, rationale: "对比鲜明" },
        { angle: "薛定谔的猫", relevance: 7, rationale: "广为人知" },
      ],
      knowledgeMap: {
        core: ["量子比特"],
        sub: ["量子门"],
        related: ["量子密码"],
      },
    };

    const mockFetch = vi.fn().mockResolvedValue(
      mockFetchResponse({ choices: [{ message: { content: JSON.stringify(responseJson) } }] })
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await generateTopicResearch("量子计算", {
      apiUrl: "https://api.openai.com/v1",
      provider: "openai-compatible",
    });

    expect(result.originalTopic).toBe("量子计算");
    expect(result.expandedDescription).toBe(responseJson.expandedDescription);
    expect(result.keyFacts).toEqual(responseJson.keyFacts);
    expect(result.narrativeAngles).toHaveLength(2);
    expect(result.narrativeAngles![0].relevance).toBe(9);
    expect(result.knowledgeMap?.core).toEqual(["量子比特"]);
  });

  it("sorts narrativeAngles by relevance descending", async () => {
    const responseJson = {
      expandedDescription: "test",
      keyFacts: [],
      narrativeAngle: "test",
      narrativeAngles: [
        { angle: "low", relevance: 3, rationale: "r" },
        { angle: "high", relevance: 10, rationale: "r" },
        { angle: "mid", relevance: 6, rationale: "r" },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue(
      mockFetchResponse({ choices: [{ message: { content: JSON.stringify(responseJson) } }] })
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await generateTopicResearch("test", {
      apiUrl: "https://api.openai.com/v1",
      provider: "openai-compatible",
    });

    expect(result.narrativeAngles![0].angle).toBe("high");
    expect(result.narrativeAngles![2].angle).toBe("low");
  });

  it("clamps relevance to 1-10 range", async () => {
    const responseJson = {
      expandedDescription: "test",
      keyFacts: [],
      narrativeAngle: "",
      narrativeAngles: [
        { angle: "a", relevance: -5, rationale: "" },
        { angle: "b", relevance: 15, rationale: "" },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue(
      mockFetchResponse({ choices: [{ message: { content: JSON.stringify(responseJson) } }] })
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await generateTopicResearch("test", {
      apiUrl: "https://api.openai.com/v1",
      provider: "openai-compatible",
    });

    expect(result.narrativeAngles![0].relevance).toBe(10);
    expect(result.narrativeAngles![1].relevance).toBe(1);
  });

  it("strips markdown code fences from response", async () => {
    const json = { expandedDescription: "desc", keyFacts: ["f1"], narrativeAngle: "angle" };
    const wrapped = "```json\n" + JSON.stringify(json) + "\n```";

    const mockFetch = vi.fn().mockResolvedValue(
      mockFetchResponse({ choices: [{ message: { content: wrapped } }] })
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await generateTopicResearch("test", {
      apiUrl: "https://api.openai.com/v1",
      provider: "openai-compatible",
    });

    expect(result.expandedDescription).toBe("desc");
    expect(result.keyFacts).toEqual(["f1"]);
  });

  it("returns graceful fallback on invalid JSON", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      mockFetchResponse({ choices: [{ message: { content: "not json at all {{{" } }] })
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await generateTopicResearch("量子计算", {
      apiUrl: "https://api.openai.com/v1",
      provider: "openai-compatible",
    });

    expect(result.originalTopic).toBe("量子计算");
    expect(result.expandedDescription).toBe("量子计算");
    expect(result.keyFacts).toEqual([]);
  });

  it("works with Anthropic provider", async () => {
    const responseJson = {
      expandedDescription: "desc",
      keyFacts: ["fact"],
      narrativeAngle: "angle",
    };

    const mockFetch = vi.fn().mockResolvedValue(
      mockFetchResponse({ content: [{ text: JSON.stringify(responseJson) }] })
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await generateTopicResearch("test", {
      apiUrl: "https://api.anthropic.com/v1/messages",
      apiKey: "ant-key",
      provider: "anthropic",
    });

    expect(result.expandedDescription).toBe("desc");
    // Verify Anthropic-specific headers
    const firstArg = mockFetch.mock.calls[0][0];
    const secondArg = mockFetch.mock.calls[0][1];
    if (firstArg === "/api/llm") {
      // Proxy mode
      const body = JSON.parse(secondArg.body);
      expect(body.headers["x-api-key"]).toBe("ant-key");
    } else {
      // Direct mode
      const headers = secondArg.headers as Record<string, string>;
      expect(headers["x-api-key"]).toBe("ant-key");
    }
  });
});

// ============================================================
// buildEnhancedTopicFromResearch
// ============================================================
describe("buildEnhancedTopicFromResearch", () => {
  it("builds enhanced topic with all fields", () => {
    const research: TopicResearchResult = {
      originalTopic: "量子计算",
      expandedDescription: "量子计算描述",
      keyFacts: ["事实1", "事实2"],
      narrativeAngle: "角度",
      narrativeAngles: [
        { angle: "最佳角度", relevance: 9, rationale: "理由" },
      ],
      knowledgeMap: {
        core: ["核心1"],
        sub: ["子1"],
        related: ["关联1"],
      },
    };

    const result = buildEnhancedTopicFromResearch(research);

    expect(result).toContain("量子计算描述");
    expect(result).toContain("1. 事实1");
    expect(result).toContain("2. 事实2");
    expect(result).toContain("核心概念");
    expect(result).toContain("核心1");
    expect(result).toContain("辅助概念");
    expect(result).toContain("子1");
    expect(result).toContain("最佳角度");
    expect(result).toContain("理由");
  });

  it("falls back to narrativeAngle when narrativeAngles is empty", () => {
    const research: TopicResearchResult = {
      originalTopic: "test",
      expandedDescription: "desc",
      keyFacts: [],
      narrativeAngle: "fallback angle",
    };

    const result = buildEnhancedTopicFromResearch(research);

    expect(result).toContain("fallback angle");
  });

  it("handles minimal research result", () => {
    const research: TopicResearchResult = {
      originalTopic: "test",
      expandedDescription: "just a description",
      keyFacts: [],
      narrativeAngle: "",
    };

    const result = buildEnhancedTopicFromResearch(research);
    expect(result).toBe("just a description");
  });
});
