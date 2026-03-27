import { describe, expect, it } from "vitest";
import type { GenerateTask, VisualDiagnosisPanel, VisualDiagnosisReport } from "@/lib/types";
import {
  deriveDiagnosisStaleness,
  invalidateDiagnosis,
  isDiagnosisPanelStale,
  markDiagnosisFailed,
  markDiagnosisRunning,
  markDiagnosisSkipped,
  markDiagnosisSucceeded,
} from "@/lib/vlmDiagnosisState";

function makeTask(): GenerateTask {
  return {
    id: "task-diagnosis-state",
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

function makePanelDiagnosis(): VisualDiagnosisPanel {
  return {
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
      rationale: "Framing needs a new layout.",
      expectedImprovement: ["Keeps the subject fully visible"],
    },
  };
}

function makeReport(): VisualDiagnosisReport {
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
    panels: [makePanelDiagnosis()],
  };
}

describe("markDiagnosisRunning", () => {
  it("marks diagnosis as running without deleting the last report", () => {
    const task = makeTask();
    task.visualDiagnosisReport = makeReport();

    markDiagnosisRunning(task);

    expect(task.visualDiagnosisState).toBe("running");
    expect(task.visualDiagnosisReport).toBeDefined();
  });
});

describe("markDiagnosisSucceeded", () => {
  it("stores the report and clears staleness", () => {
    const task = makeTask();
    task.visualDiagnosisStale = true;

    markDiagnosisSucceeded(task, makeReport());

    expect(task.visualDiagnosisState).toBe("succeeded");
    expect(task.visualDiagnosisStale).toBe(false);
    expect(task.lastDiagnosisAt).toBe("2026-03-27T01:10:00.000Z");
  });
});

describe("markDiagnosisFailed", () => {
  it("marks diagnosis as failed but preserves the last report", () => {
    const task = makeTask();
    task.visualDiagnosisReport = makeReport();

    markDiagnosisFailed(task, new Error("boom"));

    expect(task.visualDiagnosisState).toBe("failed");
    expect(task.visualDiagnosisReport).toBeDefined();
  });
});

describe("markDiagnosisSkipped", () => {
  it("marks diagnosis as skipped", () => {
    const task = makeTask();

    markDiagnosisSkipped(task);

    expect(task.visualDiagnosisState).toBe("skipped");
  });
});

describe("invalidateDiagnosis", () => {
  it("marks diagnosis stale without deleting the last report", () => {
    const task = makeTask();
    task.visualDiagnosisReport = makeReport();
    task.visualDiagnosisState = "succeeded";

    invalidateDiagnosis(task);

    expect(task.visualDiagnosisStale).toBe(true);
    expect(task.visualDiagnosisReport).toBeDefined();
  });
});

describe("isDiagnosisPanelStale", () => {
  it("returns false when image and prompt snapshots still match", () => {
    expect(isDiagnosisPanelStale(makeTask().script!.panels[0], makePanelDiagnosis())).toBe(false);
  });

  it("returns true when the prompt snapshot changed", () => {
    const panel = { ...makeTask().script!.panels[0], imagePrompt: "Prompt 1 updated" };
    expect(isDiagnosisPanelStale(panel, makePanelDiagnosis())).toBe(true);
  });
});

describe("deriveDiagnosisStaleness", () => {
  it("returns true when any diagnosed panel no longer matches the current script", () => {
    const task = makeTask();
    task.visualDiagnosisReport = makeReport();
    task.visualDiagnosisState = "succeeded";

    task.script!.panels[0].imagePrompt = "Prompt 1 updated";

    expect(deriveDiagnosisStaleness(task)).toBe(true);
  });
});
