import { describe, expect, it, vi } from "vitest";
import type { UserAPIConfigV2 } from "@/lib/types";
import type { AccuracyGoldenTopicSmokeResult } from "@/lib/accuracy/goldenTopicSmoke";

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

  it("loads smoke wikipedia fallback for science cases when an anchor title is configured", async () => {
    vi.resetModules();
    vi.doMock("@/lib/server/wikipedia", () => ({
      getWikipediaSummary: vi.fn().mockResolvedValue(null),
    }));

    const { loadSmokeWikipediaContent } = await import("@/lib/accuracy/goldenTopicSmoke");

    const result = await loadSmokeWikipediaContent({
      id: "thunder",
      topic: "为什么会打雷",
      contentType: "science",
      style: "flat",
      quality: "fast",
      wikipediaTitle: "雷",
      wikipediaLang: "zh",
    });

    expect(result.usedFallback).toBe(true);
    expect(result.content).toEqual(
      expect.objectContaining({
        title: "雷",
        lang: "zh",
      }),
    );
  });

  it("builds smoke diagnostics with panel dialogue and unsupported claims", async () => {
    const { buildAccuracyGoldenTopicSmokeReportEntry } = await import("@/lib/accuracy/goldenTopicSmoke");

    const result: AccuracyGoldenTopicSmokeResult = {
      smokeCase: {
        id: "newton",
        topic: "牛顿",
        contentType: "wikipedia",
        style: "flat",
        quality: "fast",
        panelCount: 4,
        wikipediaTitle: "艾萨克·牛顿",
        wikipediaLang: "zh",
        allowGuideCharacter: false,
      },
      wikipediaContent: {
        title: "艾萨克·牛顿",
        extract: "艾萨克·牛顿是英国物理学家。",
        lang: "zh",
        sections: ["生平"],
      },
      wikipediaFallbackUsed: false,
      safeToGenerate: true,
      verifiedHardFactCount: 3,
      hardFactCount: 3,
      hardFactsSummary: [
        {
          claimType: "place",
          object: "伍尔索普庄园",
          normalizedValue: "伍尔索普庄园",
        },
      ],
      softFactCount: 1,
      sourceTierSummary: {
        anchor: true,
        whitelist: false,
        open_web: false,
      },
      outlineGenerated: false,
      validationWarningCount: 0,
      scriptRepairRounds: 1,
      accuracyReview: {
        status: "repair_required",
        blockingIssueCount: 0,
        repairableIssueCount: 2,
        panels: [],
        sourceCoverage: {
          anchor: true,
          whitelist: false,
          open_web: false,
        },
        panelClaims: [
          {
            panelIndex: 0,
            riskLevel: "medium",
            hardClaims: [
              {
                claimType: "place",
                rawText: "牛顿出生在英国林肯郡",
                normalizedValue: "英国林肯郡",
                matchStatus: "missing",
              },
              {
                claimType: "date",
                rawText: "牛顿出生于1643年",
                normalizedValue: "1643",
                matchedFactId: "fact-1643",
                matchStatus: "matched",
              },
            ],
            unsupportedClaims: [
              {
                claimType: "place",
                rawText: "牛顿出生在英国林肯郡",
                normalizedValue: "英国林肯郡",
                matchStatus: "missing",
              },
            ],
          },
          {
            panelIndex: 1,
            riskLevel: "medium",
            hardClaims: [
              {
                claimType: "term",
                rawText: "牛顿发明了万有引力",
                normalizedValue: "发明万有引力",
                matchStatus: "ambiguous",
              },
            ],
            unsupportedClaims: [
              {
                claimType: "term",
                rawText: "牛顿发明了万有引力",
                normalizedValue: "发明万有引力",
                matchStatus: "ambiguous",
              },
            ],
          },
        ],
      },
      finalStatus: "script_ready",
      script: {
        title: "牛顿不只是一颗苹果",
        topic: "牛顿",
        style: "flat",
        panels: [
          {
            id: 1,
            scene: "庄园",
            dialogue: "牛顿出生在英国林肯郡，时间是1643年。",
            imagePrompt: "Newton manor",
            status: "pending",
          },
          {
            id: 2,
            scene: "苹果树",
            dialogue: "有人误以为牛顿发明了万有引力。",
            imagePrompt: "Newton apple tree",
            status: "pending",
          },
        ],
      },
    };

    const report = buildAccuracyGoldenTopicSmokeReportEntry(result);

    expect(report.panelDiagnostics).toEqual([
      {
        panelIndex: 0,
        dialogue: "牛顿出生在英国林肯郡，时间是1643年。",
        riskLevel: "medium",
        hardClaimCount: 2,
        unsupportedClaims: [
          {
            claimType: "place",
            rawText: "牛顿出生在英国林肯郡",
            normalizedValue: "英国林肯郡",
            matchStatus: "missing",
          },
        ],
      },
      {
        panelIndex: 1,
        dialogue: "有人误以为牛顿发明了万有引力。",
        riskLevel: "medium",
        hardClaimCount: 1,
        unsupportedClaims: [
          {
            claimType: "term",
            rawText: "牛顿发明了万有引力",
            normalizedValue: "发明万有引力",
            matchStatus: "ambiguous",
          },
        ],
      },
    ]);
    expect(report.topUnsupportedClaims).toEqual([
      {
        panelIndex: 0,
        claimType: "place",
        rawText: "牛顿出生在英国林肯郡",
        normalizedValue: "英国林肯郡",
        matchStatus: "missing",
      },
      {
        panelIndex: 1,
        claimType: "term",
        rawText: "牛顿发明了万有引力",
        normalizedValue: "发明万有引力",
        matchStatus: "ambiguous",
      },
    ]);
  });

  it("runs accuracy repair even for fast smoke cases so the harness matches taskLifecycle", async () => {
    vi.resetModules();

    const runAccuracyResearch = vi.fn().mockResolvedValue({
      factPack: {
        topic: "为什么会打雷",
        queryPlan: {
          hardFactQueries: ["雷"],
          softFactQueries: ["雷声"],
          fallbackUsed: false,
        },
        hardFacts: [
          {
            id: "fact-thunder",
            claimType: "term",
            subject: "雷",
            predicate: "mechanism",
            object: "雷是静电释放的反应",
            normalizedValue: "雷是静电释放的反应",
            sourceIds: ["anchor-1"],
            confidence: 0.95,
            mustPreserve: true,
          },
        ],
        softFacts: [],
        sourceEntries: [
          {
            id: "anchor-1",
            url: "https://zh.wikipedia.org/wiki/%E9%9B%B7",
            domain: "zh.wikipedia.org",
            title: "雷",
            sourceTier: "anchor",
            retrievalMethod: "wikipedia",
            excerpt: "雷是静电释放的反应。",
            retrievedAt: "2026-03-27T00:00:00.000Z",
            trustScore: 0.95,
          },
        ],
        coverageGaps: [],
        confidenceSummary: {
          hardFactCoverage: 1,
          softFactCoverage: 0,
          overallRisk: "low",
        },
        recommendedNarrativeAngles: [],
      },
      researchBrief: {
        verifiedHardFactCount: 1,
        sourceTiersUsed: ["anchor"],
        majorRisks: [],
        safeToGenerate: true,
      },
    });
    const generateScript = vi.fn().mockResolvedValue({
      title: "雷声从哪来",
      topic: "为什么会打雷",
      style: "flat",
      panels: [
        {
          id: 1,
          scene: "storm",
          dialogue: "原始脚本",
          imagePrompt: "storm cloud",
          status: "pending",
        },
      ],
    });
    const reviewPanelClaims = vi.fn()
      .mockReturnValueOnce({
        status: "repair_required",
        blockingIssueCount: 0,
        repairableIssueCount: 1,
        panelClaims: [
          {
            panelIndex: 0,
            hardClaims: [
              {
                claimType: "term",
                rawText: "原始脚本",
                normalizedValue: "原始脚本",
                matchStatus: "missing",
              },
            ],
            unsupportedClaims: [
              {
                claimType: "term",
                rawText: "原始脚本",
                normalizedValue: "原始脚本",
                matchStatus: "missing",
              },
            ],
            riskLevel: "medium",
          },
        ],
        panels: [],
        sourceCoverage: {
          anchor: true,
          whitelist: false,
          open_web: false,
        },
      })
      .mockReturnValueOnce({
        status: "passed",
        blockingIssueCount: 0,
        repairableIssueCount: 0,
        panelClaims: [
          {
            panelIndex: 0,
            hardClaims: [],
            unsupportedClaims: [],
            riskLevel: "low",
          },
        ],
        panels: [],
        sourceCoverage: {
          anchor: true,
          whitelist: false,
          open_web: false,
        },
      });
    const repairAccuracyIssues = vi.fn().mockResolvedValue({
      title: "雷声从哪来",
      topic: "为什么会打雷",
      style: "flat",
      panels: [
        {
          id: 1,
          scene: "storm",
          dialogue: "修复后的脚本",
          imagePrompt: "storm cloud",
          status: "pending",
        },
      ],
    });
    const validateScript = vi.fn().mockReturnValue({ warnings: [] });
    const applyCanonicalCharacterDesc = vi.fn();
    const stripDisallowedGuideCharacterFromScript = vi.fn((script) => script);

    vi.doMock("@/lib/accuracy/research", () => ({ runAccuracyResearch }));
    vi.doMock("@/lib/llm", () => ({
      generateScript,
      generateTopicResearch: vi.fn(),
      buildEnhancedTopicFromResearch: vi.fn(),
    }));
    vi.doMock("@/lib/accuracy/claimReview", () => ({ reviewPanelClaims }));
    vi.doMock("@/lib/accuracy/repair", () => ({ repairAccuracyIssues }));
    vi.doMock("@/lib/scriptValidator", () => ({ validateScript, applyCanonicalCharacterDesc }));
    vi.doMock("@/lib/guideCharacterPolicy", () => ({ stripDisallowedGuideCharacterFromScript }));
    vi.doMock("@/lib/scriptRepair", () => ({ repairScript: vi.fn() }));
    vi.doMock("@/lib/director", () => ({ generateNarrativeOutline: vi.fn() }));
    vi.doMock("@/lib/server/wikipedia", () => ({ getWikipediaSummary: vi.fn() }));

    const { runAccuracyGoldenTopicSmokeCase } = await import("@/lib/accuracy/goldenTopicSmoke");

    const result = await runAccuracyGoldenTopicSmokeCase({
      smokeCase: {
        id: "thunder-fast",
        topic: "为什么会打雷",
        contentType: "science",
        style: "flat",
        quality: "fast",
        panelCount: 1,
        allowGuideCharacter: false,
      },
      llmConfig: {
        apiUrl: "https://example.com/v1",
        apiKey: "key",
        model: "gpt-test",
        provider: "openai-compatible",
      },
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

    expect(repairAccuracyIssues).toHaveBeenCalledTimes(1);
    expect(reviewPanelClaims).toHaveBeenCalledTimes(2);
    expect(result.accuracyReview.status).toBe("passed");
  });

  it("retries accuracy repair for a second round when the first repair still leaves repair_required claims", async () => {
    vi.resetModules();

    const runAccuracyResearch = vi.fn().mockResolvedValue({
      factPack: {
        topic: "DNA",
        queryPlan: {
          hardFactQueries: ["DNA"],
          softFactQueries: ["DNA overview"],
          fallbackUsed: false,
        },
        hardFacts: [
          {
            id: "fact-dna",
            claimType: "term",
            subject: "DNA",
            predicate: "definition",
            object: "DNA forms double helix",
            normalizedValue: "DNA forms double helix",
            sourceIds: ["anchor-1"],
            confidence: 0.95,
            mustPreserve: true,
          },
        ],
        softFacts: [],
        sourceEntries: [
          {
            id: "anchor-1",
            url: "https://en.wikipedia.org/wiki/DNA",
            domain: "en.wikipedia.org",
            title: "DNA",
            sourceTier: "anchor",
            retrievalMethod: "wikipedia",
            excerpt: "DNA forms double helix.",
            retrievedAt: "2026-03-27T00:00:00.000Z",
            trustScore: 0.95,
          },
        ],
        coverageGaps: [],
        confidenceSummary: {
          hardFactCoverage: 1,
          softFactCoverage: 0,
          overallRisk: "low",
        },
        recommendedNarrativeAngles: [],
      },
      researchBrief: {
        verifiedHardFactCount: 1,
        sourceTiersUsed: ["anchor"],
        majorRisks: [],
        safeToGenerate: true,
      },
    });
    const generateScript = vi.fn().mockResolvedValue({
      title: "DNA",
      topic: "DNA",
      style: "flat",
      panels: [
        { id: 1, scene: "scene", dialogue: "初始脚本", imagePrompt: "prompt", status: "pending" },
      ],
    });
    const reviewPanelClaims = vi.fn()
      .mockReturnValueOnce({
        status: "repair_required",
        blockingIssueCount: 0,
        repairableIssueCount: 2,
        panelClaims: [{ panelIndex: 0, hardClaims: [], unsupportedClaims: [], riskLevel: "medium" }],
        panels: [],
        sourceCoverage: { anchor: true, whitelist: false, open_web: false },
      })
      .mockReturnValueOnce({
        status: "repair_required",
        blockingIssueCount: 0,
        repairableIssueCount: 1,
        panelClaims: [{ panelIndex: 0, hardClaims: [], unsupportedClaims: [], riskLevel: "medium" }],
        panels: [],
        sourceCoverage: { anchor: true, whitelist: false, open_web: false },
      })
      .mockReturnValueOnce({
        status: "passed",
        blockingIssueCount: 0,
        repairableIssueCount: 0,
        panelClaims: [{ panelIndex: 0, hardClaims: [], unsupportedClaims: [], riskLevel: "low" }],
        panels: [],
        sourceCoverage: { anchor: true, whitelist: false, open_web: false },
      });
    const repairAccuracyIssues = vi.fn()
      .mockResolvedValueOnce({
        title: "DNA",
        topic: "DNA",
        style: "flat",
        panels: [
          { id: 1, scene: "scene", dialogue: "第一次修复", imagePrompt: "prompt", status: "pending" },
        ],
      })
      .mockResolvedValueOnce({
        title: "DNA",
        topic: "DNA",
        style: "flat",
        panels: [
          { id: 1, scene: "scene", dialogue: "第二次修复", imagePrompt: "prompt", status: "pending" },
        ],
      });
    const validateScript = vi.fn().mockReturnValue({ warnings: [] });
    const applyCanonicalCharacterDesc = vi.fn();
    const stripDisallowedGuideCharacterFromScript = vi.fn((script) => script);

    vi.doMock("@/lib/accuracy/research", () => ({ runAccuracyResearch }));
    vi.doMock("@/lib/llm", () => ({
      generateScript,
      generateTopicResearch: vi.fn(),
      buildEnhancedTopicFromResearch: vi.fn(),
    }));
    vi.doMock("@/lib/accuracy/claimReview", () => ({ reviewPanelClaims }));
    vi.doMock("@/lib/accuracy/repair", () => ({ repairAccuracyIssues }));
    vi.doMock("@/lib/scriptValidator", () => ({ validateScript, applyCanonicalCharacterDesc }));
    vi.doMock("@/lib/guideCharacterPolicy", () => ({ stripDisallowedGuideCharacterFromScript }));
    vi.doMock("@/lib/scriptRepair", () => ({ repairScript: vi.fn() }));
    vi.doMock("@/lib/director", () => ({ generateNarrativeOutline: vi.fn() }));
    vi.doMock("@/lib/server/wikipedia", () => ({ getWikipediaSummary: vi.fn().mockResolvedValue(null) }));

    const { runAccuracyGoldenTopicSmokeCase } = await import("@/lib/accuracy/goldenTopicSmoke");

    const result = await runAccuracyGoldenTopicSmokeCase({
      smokeCase: {
        id: "dna",
        topic: "DNA",
        contentType: "wikipedia",
        style: "flat",
        quality: "fast",
        panelCount: 1,
        wikipediaTitle: "DNA",
        wikipediaLang: "en",
        allowGuideCharacter: false,
      },
      llmConfig: {
        apiUrl: "https://example.com/v1",
        apiKey: "key",
        model: "gpt-test",
        provider: "openai-compatible",
      },
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

    expect(repairAccuracyIssues).toHaveBeenCalledTimes(2);
    expect(reviewPanelClaims).toHaveBeenCalledTimes(3);
    expect(result.accuracyReview.status).toBe("passed");
  });
});
