import { describe, expect, it } from "vitest";
import type { AccuracySettings } from "@/lib/types";

describe("accuracy provider registry", () => {
  it("prefers slotted search providers before remaining enabled providers", async () => {
    const { resolveAccuracyProviders } = await import("@/lib/accuracy/providerRegistry");

    const resolved = resolveAccuracyProviders({
      providers: [
        {
          id: "search-low-priority",
          name: "Search Low Priority",
          kind: "search",
          vendor: "custom",
          baseUrl: "https://search-low.example.com",
          apiKey: "low",
          enabled: true,
          priority: 50,
          capabilities: ["search"],
        },
        {
          id: "search-primary",
          name: "Search Primary",
          kind: "search",
          vendor: "firecrawl",
          baseUrl: "https://api.firecrawl.dev",
          apiKey: "primary",
          enabled: true,
          priority: 99,
          capabilities: ["search"],
        },
        {
          id: "search-fallback",
          name: "Search Fallback",
          kind: "search",
          vendor: "tavily",
          baseUrl: "https://api.tavily.com",
          apiKey: "fallback",
          enabled: true,
          priority: 1,
          capabilities: ["search"],
        },
      ],
      slots: {
        primarySearch: "search-primary",
        fallbackSearch: "search-fallback",
        primaryFetch: null,
        fallbackFetch: null,
      },
      whitelistDomains: [],
    }, "search");

    expect(resolved.map((provider) => provider.id)).toEqual([
      "search-primary",
      "search-fallback",
      "search-low-priority",
    ]);
  });

  it("ignores disabled providers and mismatched kinds when resolving slots", async () => {
    const { resolveAccuracyProviders, getAssignedProvider } = await import("@/lib/accuracy/providerRegistry");

    const config: AccuracySettings = {
      providers: [
        {
          id: "search-disabled",
          name: "Disabled Search",
          kind: "search",
          vendor: "custom",
          baseUrl: "https://disabled.example.com",
          apiKey: "disabled",
          enabled: false,
          priority: 1,
          capabilities: ["search"],
        },
        {
          id: "fetch-primary",
          name: "Primary Fetch",
          kind: "fetch",
          vendor: "firecrawl",
          baseUrl: "https://api.firecrawl.dev",
          apiKey: "fetch",
          enabled: true,
          priority: 3,
          capabilities: ["fetch"],
        },
      ],
      slots: {
        primarySearch: "search-disabled",
        fallbackSearch: "fetch-primary",
        primaryFetch: "fetch-primary",
        fallbackFetch: null,
      },
      whitelistDomains: [],
    };

    expect(resolveAccuracyProviders(config, "search")).toEqual([]);
    expect(getAssignedProvider(config, "primaryFetch")?.id).toBe("fetch-primary");
    expect(getAssignedProvider(config, "primarySearch")).toBeNull();
    expect(getAssignedProvider(config, "fallbackSearch")).toBeNull();
  });

  it("returns normalized whitelist domains exactly once", async () => {
    const { getWhitelistDomains } = await import("@/lib/accuracy/providerRegistry");

    expect(getWhitelistDomains({
      providers: [],
      slots: {
        primarySearch: null,
        fallbackSearch: null,
        primaryFetch: null,
        fallbackFetch: null,
      },
      whitelistDomains: [" Wikipedia.org ", "example.com", "wikipedia.org", ""],
    })).toEqual(["wikipedia.org", "example.com"]);
  });
});
