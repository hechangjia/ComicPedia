import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getWikipediaSummaryMock,
  resolveAccuracyProvidersMock,
  searchWithProviderMock,
  fetchWithProviderMock,
} = vi.hoisted(() => ({
  getWikipediaSummaryMock: vi.fn(),
  resolveAccuracyProvidersMock: vi.fn(),
  searchWithProviderMock: vi.fn(),
  fetchWithProviderMock: vi.fn(),
}));

vi.mock("@/lib/server/wikipedia", () => ({
  getWikipediaSummary: getWikipediaSummaryMock,
}));

vi.mock("@/lib/accuracy/providerRegistry", () => ({
  resolveAccuracyProviders: resolveAccuracyProvidersMock,
  getWhitelistDomains: (config: { whitelistDomains?: string[] }) =>
    (config.whitelistDomains || []).map((domain) => domain.trim().toLowerCase()).filter(Boolean),
}));

vi.mock("@/lib/accuracy/providerClients", () => ({
  searchWithProvider: searchWithProviderMock,
  fetchWithProvider: fetchWithProviderMock,
}));

describe("accuracy research", () => {
  beforeEach(() => {
    getWikipediaSummaryMock.mockReset();
    resolveAccuracyProvidersMock.mockReset();
    searchWithProviderMock.mockReset();
    fetchWithProviderMock.mockReset();
  });

  it("uses wikipedia anchor evidence first and skips provider fallback when anchor coverage is sufficient", async () => {
    const { runAccuracyResearch } = await import("@/lib/accuracy/research");

    getWikipediaSummaryMock.mockResolvedValue({
      title: "DNA",
      extract: "DNA stands for deoxyribonucleic acid. DNA was first isolated in 1869 and carries hereditary information in living organisms.",
      lang: "en",
      sections: ["History", "Structure"],
      pageUrl: "https://en.wikipedia.org/wiki/DNA",
    });
    resolveAccuracyProvidersMock.mockReturnValue([]);

    const result = await runAccuracyResearch({
      topic: "DNA",
      contentType: "science",
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

    expect(searchWithProviderMock).not.toHaveBeenCalled();
    expect(result.factPack.sourceEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceTier: "anchor",
          retrievalMethod: "wikipedia",
          domain: "en.wikipedia.org",
        }),
      ]),
    );
    expect(result.researchBrief.sourceTiersUsed).toEqual(["anchor"]);
    expect(result.researchBrief.verifiedHardFactCount).toBeGreaterThan(0);
    expect(result.researchBrief.safeToGenerate).toBe(true);
  });

  it("filters whitelist results, caps source counts, and truncates excerpts", async () => {
    const { runAccuracyResearch } = await import("@/lib/accuracy/research");

    getWikipediaSummaryMock.mockResolvedValue({
      title: "火药",
      extract: "火药是一种重要发明。",
      lang: "zh",
      sections: ["历史"],
      pageUrl: "https://zh.wikipedia.org/wiki/%E7%81%AB%E8%8D%AF",
    });

    resolveAccuracyProvidersMock.mockReturnValue([
      {
        id: "search-primary",
        name: "Firecrawl Search",
        kind: "search",
        vendor: "firecrawl",
        baseUrl: "https://api.firecrawl.dev",
        apiKey: "fc",
        enabled: true,
        priority: 1,
        capabilities: ["search"],
      },
    ]);

    searchWithProviderMock.mockResolvedValue([
      { url: "https://allowed.com/a", title: "A", domain: "allowed.com", excerpt: "x".repeat(1200) },
      { url: "https://blocked.com/a", title: "B", domain: "blocked.com", excerpt: "blocked" },
      { url: "https://allowed.com/b", title: "C", domain: "allowed.com", excerpt: "c".repeat(1200) },
      { url: "https://allowed.com/c", title: "D", domain: "allowed.com", excerpt: "d".repeat(1200) },
      { url: "https://allowed.com/d", title: "E", domain: "allowed.com", excerpt: "e".repeat(1200) },
    ]);
    fetchWithProviderMock.mockResolvedValue({
      url: "https://allowed.com/a",
      title: "A fetched",
      domain: "allowed.com",
      excerpt: "f".repeat(1200),
    });

    const result = await runAccuracyResearch({
      topic: "火药",
      contentType: "science",
      accuracyConfig: {
        providers: [],
        slots: {
          primarySearch: "search-primary",
          fallbackSearch: null,
          primaryFetch: null,
          fallbackFetch: null,
        },
        whitelistDomains: [" allowed.com ", "allowed.com"],
      },
    });

    const whitelistEntries = result.factPack.sourceEntries.filter((entry) => entry.sourceTier === "whitelist");
    expect(whitelistEntries).toHaveLength(3);
    expect(whitelistEntries.every((entry) => entry.domain === "allowed.com")).toBe(true);
    expect(whitelistEntries.every((entry) => entry.excerpt.length <= 800)).toBe(true);
  });

  it("records a coverage gap instead of unbounded fallback when the research budget is exhausted", async () => {
    const { runAccuracyResearch } = await import("@/lib/accuracy/research");

    getWikipediaSummaryMock.mockResolvedValue({
      title: "未知主题",
      extract: "资料很少。",
      lang: "zh",
      sections: [],
      pageUrl: "https://zh.wikipedia.org/wiki/%E6%9C%AA%E7%9F%A5%E4%B8%BB%E9%A2%98",
    });
    resolveAccuracyProvidersMock.mockReturnValue([
      {
        id: "search-primary",
        name: "Search Primary",
        kind: "search",
        vendor: "custom",
        baseUrl: "https://search.example.com",
        apiKey: "secret",
        enabled: true,
        priority: 1,
        capabilities: ["search"],
      },
    ]);

    const result = await runAccuracyResearch({
      topic: "未知主题",
      contentType: "science",
      accuracyConfig: {
        providers: [],
        slots: {
          primarySearch: "search-primary",
          fallbackSearch: null,
          primaryFetch: null,
          fallbackFetch: null,
        },
        whitelistDomains: ["allowed.com"],
      },
      budgetMs: 0,
    });

    expect(searchWithProviderMock).not.toHaveBeenCalled();
    expect(result.factPack.coverageGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: expect.stringContaining("budget"),
        }),
      ]),
    );
    expect(result.researchBrief.safeToGenerate).toBe(false);
  });

  it("extracts richer hard facts for the 牛顿 golden topic from anchor evidence", async () => {
    const { runAccuracyResearch } = await import("@/lib/accuracy/research");

    getWikipediaSummaryMock.mockResolvedValue({
      title: "艾萨克·牛顿",
      extract: "艾萨克·牛顿是英国物理学家和数学家，出生于英国林肯郡伍尔索普庄园，万有引力理论由艾萨克·牛顿提出。",
      lang: "zh",
      sections: ["生平", "科学贡献"],
      pageUrl: "https://zh.wikipedia.org/wiki/%E8%89%BE%E8%90%A8%E5%85%8B%C2%B7%E7%89%9B%E9%A1%BF",
    });
    resolveAccuracyProvidersMock.mockReturnValue([]);

    const result = await runAccuracyResearch({
      topic: "牛顿",
      contentType: "science",
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

    expect(result.factPack.hardFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "person",
          object: "艾萨克·牛顿",
        }),
        expect.objectContaining({
          claimType: "place",
          object: "英国林肯郡伍尔索普庄园",
        }),
        expect.objectContaining({
          claimType: "event",
          object: "万有引力理论由艾萨克·牛顿提出",
        }),
      ]),
    );
  });

  it("extracts origin-place hard facts for the 火药 golden topic", async () => {
    const { runAccuracyResearch } = await import("@/lib/accuracy/research");

    getWikipediaSummaryMock.mockResolvedValue({
      title: "火药",
      extract: "火药是中国古代发明的一种混合炸药，起源于中国。",
      lang: "zh",
      sections: ["历史"],
      pageUrl: "https://zh.wikipedia.org/wiki/%E7%81%AB%E8%8D%AF",
    });
    resolveAccuracyProvidersMock.mockReturnValue([]);

    const result = await runAccuracyResearch({
      topic: "火药",
      contentType: "science",
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

    expect(result.factPack.hardFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          claimType: "place",
          object: "中国",
        }),
      ]),
    );
  });
});
