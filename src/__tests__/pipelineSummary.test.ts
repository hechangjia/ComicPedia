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
});
