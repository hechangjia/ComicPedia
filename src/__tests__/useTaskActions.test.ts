import { describe, expect, it } from "vitest";
import type { GenerateTask, VisualDiagnosisReport, VisualQualityScore } from "@/lib/types";
import {
  applyDiagnosisInvalidation,
  applyVisualDiagnosisFailureUpdate,
  applyVisualDiagnosisReportUpdate,
  applyVisualQualityScoreUpdate,
  beginVisualRepairExecution,
  completeVisualRepairExecution,
  failVisualRepairExecution,
} from "@/hooks/useTaskActions";

function makeTask(): GenerateTask {
  return {
    id: "task-actions-diagnosis",
    status: "completed",
    progress: 100,
    script: {
      title: "Diagnosis Task",
      topic: "VLM",
      style: "anime",
      panels: [
        {
          id: 1,
          scene: "Scene 1",
          dialogue: "Dialogue 1",
          imagePrompt: "Prompt 1",
          imageUrl: "data:image/png;base64,panel-1",
          status: "completed",
        },
      ],
    },
    createdAt: new Date("2026-03-27T00:00:00.000Z"),
    updatedAt: new Date("2026-03-27T00:00:00.000Z"),
  };
}

function makeDiagnosisReport(): VisualDiagnosisReport {
  return {
    schemaVersion: 1,
    generatedAt: "2026-03-27T01:10:00.000Z",
    sourceEvaluatedAt: "2026-03-27T01:00:00.000Z",
    model: {
      provider: "openai-compatible",
      model: "gpt-4o",
    },
    summary: {
      problemPanelCount: 1,
      highSeverityCount: 1,
      actionableCount: 1,
      crossPanelIssueCount: 0,
    },
    panels: [
      {
        panelIndex: 0,
        imageUrl: "data:image/png;base64,panel-1",
        promptSnapshot: "Prompt 1",
        status: "issues_found",
        topIssueType: "composition_mismatch",
        severity: "high",
        issues: [
          {
            issueType: "composition_mismatch",
            severity: "high",
            affectedDimensions: ["compositionQuality"],
            evidence: "Main subject is cropped out of frame",
            confidence: "high",
            evidenceStrength: "strong",
            falsePositiveRisk: "low",
            actionability: "confirm_first",
          },
        ],
        repair: {
          recommendedMode: "rewrite",
          rationale: "The framing needs a wider layout.",
          expectedImprovement: ["Keeps the main subject fully visible"],
        },
      },
    ],
  };
}

function makeVisualQualityScore(): VisualQualityScore {
  return {
    overall: 6,
    panels: [
      {
        panelIndex: 0,
        textImageAlignment: 6,
        styleAdherence: 6,
        artifactScore: 5,
        compositionQuality: 6,
        overall: 6,
        issues: ["clarity"],
      },
    ],
    retryRecommendations: [
      {
        panelIndex: 0,
        reason: "clarity",
        suggestedFix: "Increase detail",
      },
    ],
    evaluatedAt: "2026-03-27T02:05:00.000Z",
  };
}

describe("applyVisualDiagnosisReportUpdate", () => {
  it("persists a diagnosis report and marks diagnosis as succeeded", () => {
    const task = makeTask();

    applyVisualDiagnosisReportUpdate(task, makeDiagnosisReport());

    expect(task.visualDiagnosisReport).toBeDefined();
    expect(task.visualDiagnosisState).toBe("succeeded");
    expect(task.visualDiagnosisStale).toBe(false);
    expect(task.lastDiagnosisAt).toBe("2026-03-27T01:10:00.000Z");
  });
});

describe("applyDiagnosisInvalidation", () => {
  it("marks diagnosis stale after a panel edit", () => {
    const task = makeTask();
    applyVisualDiagnosisReportUpdate(task, makeDiagnosisReport());

    task.script!.panels[0].imagePrompt = "Prompt 1 updated";
    applyDiagnosisInvalidation(task);

    expect(task.visualDiagnosisStale).toBe(true);
  });

  it("marks diagnosis stale before regenerate", () => {
    const task = makeTask();
    applyVisualDiagnosisReportUpdate(task, makeDiagnosisReport());

    applyDiagnosisInvalidation(task);

    expect(task.visualDiagnosisStale).toBe(true);
  });

  it("marks diagnosis stale before reorder", () => {
    const task = makeTask();
    applyVisualDiagnosisReportUpdate(task, makeDiagnosisReport());

    applyDiagnosisInvalidation(task);

    expect(task.visualDiagnosisStale).toBe(true);
  });

  it("marks diagnosis stale before style change", () => {
    const task = makeTask();
    applyVisualDiagnosisReportUpdate(task, makeDiagnosisReport());

    task.script!.style = "manga";
    applyDiagnosisInvalidation(task);

    expect(task.visualDiagnosisStale).toBe(true);
  });

  it("marks diagnosis stale before VLM retry", () => {
    const task = makeTask();
    applyVisualDiagnosisReportUpdate(task, makeDiagnosisReport());

    task.script!.panels[0].imagePrompt = "Prompt 1 patched";
    applyDiagnosisInvalidation(task);

    expect(task.visualDiagnosisStale).toBe(true);
  });
});

describe("applyVisualDiagnosisFailureUpdate", () => {
  it("marks diagnosis state as failed without deleting the last report", () => {
    const task = makeTask();
    applyVisualDiagnosisReportUpdate(task, makeDiagnosisReport());

    applyVisualDiagnosisFailureUpdate(task);

    expect(task.visualDiagnosisState).toBe("failed");
    expect(task.visualDiagnosisReport).toBeDefined();
  });
});

describe("applyVisualQualityScoreUpdate", () => {
  it("still preserves the existing visual score projection behavior", () => {
    const task = makeTask();

    applyVisualQualityScoreUpdate(task, {
      overall: 5,
      panels: [
        {
          panelIndex: 0,
          textImageAlignment: 5,
          styleAdherence: 5,
          artifactScore: 4,
          compositionQuality: 5,
          overall: 5,
          issues: ["blurry image"],
        },
      ],
      retryRecommendations: [
        {
          panelIndex: 0,
          reason: "blurry image",
          suggestedFix: "add sharper detail guidance",
        },
      ],
      evaluatedAt: "2026-03-27T01:00:00.000Z",
    });

    expect(task.reviewStatus).toBe("needs_repair");
    expect(task.panelReview?.[0].status).toBe("needs_repair");
    expect(task.lastReviewAt).toBe("2026-03-27T01:00:00.000Z");
  });
});

describe("visual repair execution helpers", () => {
  it("marks execution as running when a repair starts", () => {
    const task = makeTask();
    applyVisualDiagnosisReportUpdate(task, makeDiagnosisReport());

    beginVisualRepairExecution(task, {
      panelIndices: [0],
      mode: "rewrite",
      startedAt: "2026-03-27T02:00:00.000Z",
    });

    expect(task.visualRepairExecution?.status).toBe("running");
    expect(task.visualRepairExecution?.panelIndices).toEqual([0]);
    expect(task.visualRepairExecution?.mode).toBe("rewrite");
    expect(task.visualRepairExecution?.startedAt).toBe("2026-03-27T02:00:00.000Z");
    expect(task.visualDiagnosisStale).toBe(true);
  });

  it("records scores/outcome on success while keeping diagnosis stale", () => {
    const task = makeTask();
    applyVisualDiagnosisReportUpdate(task, makeDiagnosisReport());
    applyVisualQualityScoreUpdate(task, makeVisualQualityScore());

    beginVisualRepairExecution(task, {
      panelIndices: [0],
      mode: "rewrite",
      startedAt: "2026-03-27T02:00:00.000Z",
    });

    const improvedScore: VisualQualityScore = {
      ...makeVisualQualityScore(),
      overall: 8,
      panels: [
        {
          ...makeVisualQualityScore().panels[0],
          artifactScore: 8,
          overall: 8,
          issues: [],
        },
      ],
      evaluatedAt: "2026-03-27T02:10:00.000Z",
    };

    completeVisualRepairExecution(task, improvedScore, "improved", "2026-03-27T02:15:00.000Z");

    expect(task.visualRepairExecution?.status).toBe("completed");
    expect(task.visualRepairExecution?.scoreBefore).toBe(6);
    expect(task.visualRepairExecution?.scoreAfter).toBe(8);
    expect(task.visualRepairExecution?.outcome).toBe("improved");
    expect(task.visualRepairExecution?.finishedAt).toBe("2026-03-27T02:15:00.000Z");
    expect(task.visualDiagnosisStale).toBe(true);
  });

  it("records failed execution state without clearing diagnosis staleness", () => {
    const task = makeTask();
    applyVisualDiagnosisReportUpdate(task, makeDiagnosisReport());

    beginVisualRepairExecution(task, {
      panelIndices: [0],
      mode: "rewrite",
      startedAt: "2026-03-27T02:00:00.000Z",
    });

    failVisualRepairExecution(task, "2026-03-27T02:05:00.000Z");

    expect(task.visualRepairExecution?.status).toBe("failed");
    expect(task.visualRepairExecution?.finishedAt).toBe("2026-03-27T02:05:00.000Z");
    expect(task.visualDiagnosisStale).toBe(true);
  });
});
