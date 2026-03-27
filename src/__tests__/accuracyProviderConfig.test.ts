import { describe, expect, it } from "vitest";

describe("accuracy provider config", () => {
  it("initializes an empty accuracy config with empty slots and whitelist", async () => {
    const { createEmptyAccuracyConfig } = await import("@/lib/accuracy/providerConfig");

    expect(createEmptyAccuracyConfig()).toEqual({
      providers: [],
      slots: {
        primarySearch: null,
        fallbackSearch: null,
        primaryFetch: null,
        fallbackFetch: null,
      },
      whitelistDomains: [],
    });
  });

  it("sanitizes provider secrets for client payloads while keeping masked secret state", async () => {
    const { sanitizeAccuracyConfigForClient } = await import("@/lib/accuracy/providerConfig");

    const sanitized = sanitizeAccuracyConfigForClient({
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
          healthStatus: "success",
          lastCheckedAt: "2026-03-27T10:00:00.000Z",
          lastError: "timeout once",
        },
      ],
      slots: {
        primarySearch: "search-firecrawl",
        fallbackSearch: null,
        primaryFetch: null,
        fallbackFetch: null,
      },
      whitelistDomains: ["wikipedia.org"],
    });

    expect(sanitized.providers[0]).toMatchObject({
      id: "search-firecrawl",
      hasApiKey: true,
      maskedApiKey: expect.stringContaining("abcd"),
      healthStatus: "success",
      lastError: "timeout once",
    });
    expect("apiKey" in sanitized.providers[0]).toBe(false);
  });

  it("preserves stored provider secret when edit payload leaves apiKey blank", async () => {
    const { mergeAccuracyProviderSecrets } = await import("@/lib/accuracy/providerConfig");

    const merged = mergeAccuracyProviderSecrets(
      {
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
      {
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
    );

    expect(merged.providers[0].apiKey).toBe("fc_live_secret");
    expect(merged.providers[0].baseUrl).toBe("https://api.firecrawl.dev/v2");
  });

  it("drops invalid slot references after disabled or deleted providers are normalized", async () => {
    const { normalizeAccuracyConfig } = await import("@/lib/accuracy/providerConfig");

    const normalized = normalizeAccuracyConfig({
      providers: [
        {
          id: "search-disabled",
          name: "Disabled Search",
          kind: "search",
          vendor: "tavily",
          baseUrl: "https://api.tavily.com",
          apiKey: "tv_secret",
          enabled: false,
          priority: 1,
          capabilities: ["search"],
        },
      ],
      slots: {
        primarySearch: "search-disabled",
        fallbackSearch: "missing-provider",
        primaryFetch: "search-disabled",
        fallbackFetch: null,
      },
      whitelistDomains: [" Example.COM ", "example.com", ""],
    });

    expect(normalized.slots).toEqual({
      primarySearch: null,
      fallbackSearch: null,
      primaryFetch: null,
      fallbackFetch: null,
    });
    expect(normalized.whitelistDomains).toEqual(["example.com"]);
  });
});
