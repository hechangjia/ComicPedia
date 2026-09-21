import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getConfigMock, saveConfigMock } = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  saveConfigMock: vi.fn(),
}));

vi.mock("@/lib/server/db", () => ({
  getConfig: getConfigMock,
  saveConfigIfMatch: saveConfigMock,
}));

describe("/api/config", () => {
  beforeEach(() => {
    getConfigMock.mockReset();
    saveConfigMock.mockReset().mockReturnValue(true);
  });

  it("returns a default config payload that includes accuracy settings", async () => {
    getConfigMock.mockReturnValue(null);

    const { GET } = await import("@/app/api/config/route");
    const response = await GET();
    const body = await response.json();

    expect(body).toMatchObject({
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
    });
  });

  it("sanitizes provider api keys on GET while preserving masked secret state", async () => {
    getConfigMock.mockReturnValue({
      version: 2,
      llmConfigs: [],
      imageConfigs: [],
      vlmConfigs: [],
      activeLLMId: null,
      activeImageId: null,
      activeVLMId: null,
      updatedAt: "2026-03-27T10:00:00.000Z",
      accuracyConfig: {
        providers: [
          {
            id: "search-firecrawl",
            name: "Firecrawl Search",
            kind: "search",
            vendor: "firecrawl",
            baseUrl: "https://api.firecrawl.dev",
            apiKey: "fc_live_1234abcd",
            enabled: true,
            priority: 1,
            capabilities: ["search"],
          },
        ],
        slots: {
          primarySearch: "search-firecrawl",
          fallbackSearch: null,
          primaryFetch: null,
          fallbackFetch: null,
        },
        whitelistDomains: [],
      },
    });

    const { GET } = await import("@/app/api/config/route");
    const response = await GET();
    const body = await response.json();

    expect(body.accuracyConfig.providers[0].apiKey).toBeUndefined();
    expect(body.accuracyConfig.providers[0]).toMatchObject({
      id: "search-firecrawl",
      hasApiKey: true,
      maskedApiKey: expect.stringContaining("abcd"),
    });
  });

  it("preserves stored provider secrets on PUT when edited payload leaves apiKey blank", async () => {
    getConfigMock.mockReturnValue({
      version: 2,
      llmConfigs: [],
      imageConfigs: [],
      vlmConfigs: [],
      activeLLMId: null,
      activeImageId: null,
      activeVLMId: null,
      updatedAt: "2026-03-27T10:00:00.000Z",
      accuracyConfig: {
        providers: [
          {
            id: "search-firecrawl",
            name: "Firecrawl Search",
            kind: "search",
            vendor: "firecrawl",
            baseUrl: "https://api.firecrawl.dev",
            apiKey: "fc_live_secret",
            enabled: true,
            priority: 1,
            capabilities: ["search"],
          },
        ],
        slots: {
          primarySearch: "search-firecrawl",
          fallbackSearch: null,
          primaryFetch: null,
          fallbackFetch: null,
        },
        whitelistDomains: [],
      },
    });

    const request = new NextRequest("http://localhost:3000/api/config", {
      method: "PUT",
      headers: { "If-Match": "\"stored\"" },
      body: JSON.stringify({
        version: 2,
        llmConfigs: [],
        imageConfigs: [],
        vlmConfigs: [],
        activeLLMId: null,
        activeImageId: null,
        activeVLMId: null,
        updatedAt: "2026-03-27T10:05:00.000Z",
        accuracyConfig: {
          providers: [
            {
              id: "search-firecrawl",
              name: "Firecrawl Search",
              kind: "search",
              vendor: "firecrawl",
              baseUrl: "https://api.firecrawl.dev/v2",
              apiKey: "",
              enabled: true,
              priority: 1,
              capabilities: ["search"],
            },
          ],
          slots: {
            primarySearch: "search-firecrawl",
            fallbackSearch: null,
            primaryFetch: null,
            fallbackFetch: null,
          },
          whitelistDomains: [],
        },
      }),
    });

    const { PUT } = await import("@/app/api/config/route");
    const response = await PUT(request);

    expect(response.status).toBe(200);
    expect(saveConfigMock).toHaveBeenCalledTimes(1);
    expect(saveConfigMock.mock.calls[0][0].accuracyConfig.providers[0].apiKey).toBe("fc_live_secret");
    expect(saveConfigMock.mock.calls[0][0].accuracyConfig.providers[0].baseUrl).toBe("https://api.firecrawl.dev/v2");
  });
  it("rejects malformed bodies, old versions and missing preconditions before persistence", async () => {
    const { PUT } = await import("@/app/api/config/route");
    for (const [body, status] of [["{", 400], [JSON.stringify({ version: 1 }), 400], [JSON.stringify({ version: 2, llmConfigs: [], imageConfigs: [] }), 428]] as const) {
      const response = await PUT(new NextRequest("http://localhost/api/config", { method: "PUT", body }));
      expect(response.status).toBe(status);
    }
    expect(saveConfigMock).not.toHaveBeenCalled();
  });
  it("returns an opaque revision and no-store on GET", async () => {
    getConfigMock.mockReturnValue(null);
    const { GET } = await import("@/app/api/config/route");
    const response = await GET();
    expect(response.headers.get("etag")).toBe('"empty"');
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("returns 412 when the atomic database comparison rejects the revision", async () => {
    saveConfigMock.mockReturnValue(false);
    const { PUT } = await import("@/app/api/config/route");
    const response = await PUT(new NextRequest("http://localhost/api/config", {
      method: "PUT", headers: { "If-Match": '"old"' }, body: JSON.stringify({ version: 2, llmConfigs: [], imageConfigs: [] }),
    }));
    expect(response.status).toBe(412);
  });

  it("redacts all model keys and preserves them through an ordinary GET/edit/PUT", async () => {
    const { createEmptyUserConfig } = await import("@/lib/config/userConfig");
    const stored = { ...createEmptyUserConfig(), llmConfigs: [{ id: "a", name: "A", provider: "custom", apiUrl: "http://localhost:8317", apiKey: "private-model-secret", model: "text", protocolType: "openai-compatible" }] };
    getConfigMock.mockReturnValue(stored);
    const { GET, PUT } = await import("@/app/api/config/route");
    const response = await GET(); const raw = await response.text();
    expect(raw).not.toContain("private-model-secret");
    const edited = JSON.parse(raw); edited.llmConfigs[0].name = "Rename";
    const result = await PUT(new NextRequest("http://localhost/api/config", { method: "PUT", headers: { "If-Match": response.headers.get("etag")! }, body: JSON.stringify(edited) }));
    expect(result.status).toBe(200);
    expect(saveConfigMock.mock.calls[0][0].llmConfigs[0].apiKey).toBe("private-model-secret");
    expect(await result.text()).not.toContain("private-model-secret");
  });
});
