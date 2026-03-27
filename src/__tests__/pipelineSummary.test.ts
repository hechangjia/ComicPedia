import { describe, expect, it } from "vitest";
import { getPipelinePhases, getPipelineSummaryLabel } from "@/lib/pipelineSummary";
import type { GenerateTask } from "@/lib/types";

function makeTask(): GenerateTask {
  return {
    id: "task-summary",
    status: "script_ready",
    progress: 30,
    createdAt: new Date("2026-03-27T00:00:00.000Z"),
    updatedAt: new Date("2026-03-27T00:00:00.000Z"),
    generationConfig: {
      quality: "standard",
      generatedAt: "2026-03-27T00:00:00.000Z",
    },
    factPack: {
      topic: "为什么会打雷",
      queryPlan: {
        hardFactQueries: ["为什么会打雷"],
        softFactQueries: ["为什么会打雷 overview"],
        fallbackUsed: false,
      },
      hardFacts: [
        {
          id: "fact-1",
          claimType: "term",
          subject: "为什么会打雷",
          predicate: "definition",
          object: "雷声来自闪电加热空气后的膨胀。",
          normalizedValue: "雷声来自闪电加热空气后的膨胀。",
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
          excerpt: "雷声来自闪电加热空气后的膨胀。",
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
    accuracyReview: {
      status: "passed",
      blockingIssueCount: 0,
      repairableIssueCount: 0,
      panelClaims: [],
      panels: [],
      sourceCoverage: {
        anchor: true,
        whitelist: false,
        open_web: false,
      },
    },
    script: {
      title: "为什么会打雷",
      topic: "为什么会打雷",
      style: "flat",
      panels: [
        {
          id: 1,
          scene: "乌云逼近",
          dialogue: "先看到异常现象",
          imagePrompt: "hook close-up lightning storm",
          status: "pending",
        },
      ],
    },
    narrativeOutline: {
      totalPanels: 5,
      templateType: "mechanism",
      source: "beat-plan",
      narrativeArc: "Use a hook before revealing the mechanism",
      infoDistribution: "progressive",
      characterList: [],
      panels: [
        {
          narrativeFunction: "opening",
          beatRole: "hook",
          suggestedComposition: "close-up",
          shotIntent: "hook-closeup",
          characters: [],
          keyInfo: "先展示读者熟悉但没想清楚的现象",
          knowledgeGoal: "先让读者产生疑问",
          infoDensity: "low",
          intensity: "high",
          carryForward: "为什么会这样",
        },
      ],
    },
  };
}

describe("pipelineSummary", () => {
  it("includes richer narrative outline metadata in phase detail", () => {
    const outlinePhase = getPipelinePhases(makeTask()).find((phase) => phase.name === "叙事大纲");
    expect(outlinePhase?.detail).toContain("mechanism");
    expect(outlinePhase?.detail).toContain("hook-closeup");
  });

  it("builds the summary label from phase counts", () => {
    const label = getPipelineSummaryLabel(makeTask());
    expect(label).toContain("Agent 管线摘要");
    expect(label).toContain("模式");
  });

  it("includes accuracy research and fact review phases", () => {
    const phases = getPipelinePhases(makeTask());
    expect(phases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "准确性研究", status: "done", detail: expect.stringContaining("1 个硬事实") }),
        expect.objectContaining({ name: "事实校验", status: "done", detail: expect.stringContaining("通过") }),
      ]),
    );
  });

  it("marks the fact review phase as failed when a task is blocked by factual conflicts", () => {
    const blockedTask: GenerateTask = {
      ...makeTask(),
      status: "failed",
      error: "高风险事实冲突，脚本未通过准确性校验",
      accuracyReview: {
        ...makeTask().accuracyReview!,
        status: "blocked",
        blockingIssueCount: 2,
        panels: [
          { panelIndex: 0, claimType: "date", rawText: "1642年", reason: "conflicts with fact pack", matchedFactId: "fact-1" },
          { panelIndex: 1, claimType: "number", rawText: "20岁", reason: "unsupported hard claim" },
        ],
      },
      accuracyErrorSummary: {
        status: "blocked",
        blockingIssueCount: 2,
        panels: [
          { panelIndex: 0, claimType: "date", rawText: "1642年", reason: "conflicts with fact pack", matchedFactId: "fact-1" },
          { panelIndex: 1, claimType: "number", rawText: "20岁", reason: "unsupported hard claim" },
        ],
        generatedAt: "2026-03-27T00:10:00.000Z",
        sourceCoverage: {
          anchor: true,
          whitelist: false,
          open_web: false,
        },
      },
    };

    const factReview = getPipelinePhases(blockedTask).find((phase) => phase.name === "事实校验");
    expect(factReview).toMatchObject({
      status: "failed",
    });
    expect(factReview?.detail).toContain("2 个阻塞问题");
  });
});
