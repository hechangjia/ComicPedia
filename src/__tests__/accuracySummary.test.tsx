import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccuracySummary } from "@/components/result/AccuracySummary";
import type { GenerateTask } from "@/lib/types";

function makeTask(): GenerateTask {
  return {
    id: "task-accuracy-summary",
    origin: "user",
    status: "script_ready",
    progress: 60,
    createdAt: new Date("2026-04-09T00:00:00.000Z"),
    updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    factPack: {
      topic: "火药",
      queryPlan: {
        hardFactQueries: ["火药"],
        softFactQueries: ["火药 overview"],
        fallbackUsed: true,
        providerExecutions: [
          {
            phase: "whitelist_search",
            kind: "search",
            providerId: "search-primary",
            providerName: "Tavily Search",
            slot: "primarySearch",
            query: "火药",
            resultCount: 1,
            outcome: "success",
          },
          {
            phase: "whitelist_fetch",
            kind: "fetch",
            providerId: "fetch-primary",
            providerName: "Firecrawl Fetch",
            slot: "primaryFetch",
            url: "https://allowed.com/history/gunpowder",
            outcome: "success",
          },
        ],
      },
      hardFacts: [],
      softFacts: [],
      sourceEntries: [],
      coverageGaps: [],
      confidenceSummary: {
        hardFactCoverage: 2,
        softFactCoverage: 1,
        overallRisk: "low",
      },
      recommendedNarrativeAngles: [],
    },
    researchBrief: {
      verifiedHardFactCount: 2,
      sourceTiersUsed: ["anchor", "whitelist"],
      majorRisks: [],
      safeToGenerate: true,
    },
  };
}

describe("AccuracySummary", () => {
  it("renders the runtime provider trace for the research flow", () => {
    const html = renderToStaticMarkup(React.createElement(AccuracySummary, { task: makeTask() }));

    expect(html).toContain("命中链路");
    expect(html).toContain("Tavily Search");
    expect(html).toContain("主 Search");
    expect(html).toContain("Firecrawl Fetch");
    expect(html).toContain("主 Fetch");
  });
});
