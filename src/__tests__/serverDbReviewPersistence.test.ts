import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Character, GenerateTask } from "@/lib/types";

type ServerDbModule = typeof import("@/lib/server/db");

let tempDir: string | undefined;
let cwdSpy: ReturnType<typeof vi.spyOn> | undefined;

async function loadIsolatedDb(): Promise<ServerDbModule> {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "comicpedia-db-test-"));
  vi.resetModules();
  cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);

  const dbModule = await import("@/lib/server/db");
  dbModule.clearAllTasks();
  dbModule.clearAllCharacters();

  return dbModule;
}

function makeTask(): GenerateTask {
  return {
    id: "task-review-roundtrip",
    status: "completed",
    progress: 100,
    createdAt: new Date("2026-03-27T00:00:00.000Z"),
    updatedAt: new Date("2026-03-27T00:10:00.000Z"),
    script: {
      title: "Review Task",
      topic: "Round-trip",
      style: "anime",
      panels: [
        {
          id: 1,
          scene: "Scene 1",
          dialogue: "Dialogue 1",
          imagePrompt: "Prompt 1",
          imageUrl: "data:image/png;base64,panel-1",
          imageVersions: [{ imageUrl: "data:image/png;base64,panel-1", createdAt: 1 }],
          activeVersionIndex: 0,
          status: "completed",
        },
      ],
    },
    visualQualityScore: {
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
    },
    reviewStatus: "needs_repair",
    panelReview: [
      {
        panelIndex: 0,
        status: "failed",
        score: 5,
        issues: ["blurry image"],
      },
    ],
    visualRetrySummary: {
      status: "failed",
      startedAt: "2026-03-27T01:00:00.000Z",
      finishedAt: "2026-03-27T01:05:00.000Z",
      initialOverallScore: 5,
      finalOverallScore: 5,
      attemptedPanels: [0],
      outcomes: [{ panelIndex: 0, status: "failed" }],
    },
    lastReviewAt: "2026-03-27T01:00:00.000Z",
    visualDiagnosisReport: {
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
              affectedDimensions: ["compositionQuality", "textImageAlignment"],
              evidence: "Main subject is cropped too tightly on the right edge.",
              confidence: "high",
              evidenceStrength: "strong",
              falsePositiveRisk: "low",
              actionability: "confirm_first",
            },
          ],
          repair: {
            recommendedMode: "rewrite",
            rationale: "The framing issue changes the core scene layout.",
            suggestedPrompt: "A wider shot that keeps the full subject inside the frame.",
            suggestedNegativePrompt: "cropped subject, cut off body",
            patchPositive: ["wide shot", "full body in frame"],
            patchNegative: ["cropped subject"],
            expectedImprovement: ["Keeps the main subject fully visible", "Improves scene readability"],
          },
        },
      ],
    },
    visualDiagnosisState: "succeeded",
    visualDiagnosisStale: false,
    lastDiagnosisAt: "2026-03-27T01:10:00.000Z",
    generationConfig: {
      quality: "fine",
      generatedAt: "2026-03-27T00:00:00.000Z",
    },
    visualRepairExecution: {
      status: "completed",
      panelIndices: [0],
      mode: "rewrite",
      scoreBefore: 5,
      scoreAfter: 7,
      outcome: "improved",
      startedAt: "2026-03-27T01:12:00.000Z",
      finishedAt: "2026-03-27T01:15:00.000Z",
    },
    queueSummary: {
      queued: 1,
      running: 2,
      paused: 0,
      failed: 1,
      attachFailed: 1,
      completed: 4,
      calibrationPending: 0,
    },
    presetSnapshot: {
      presetId: "balanced-auto",
      imageProvider: "comfyui",
      imageModel: "sdxl",
      calibrationRequired: true,
      calibrationApproved: false,
      concurrencyPolicy: "single_flight",
      imageQueue: {
        maxConcurrency: 1,
      },
    },
    factPack: {
      topic: "Round-trip",
      queryPlan: {
        hardFactQueries: ["Round-trip"],
        softFactQueries: ["Round-trip overview"],
        fallbackUsed: false,
      },
      hardFacts: [
        {
          id: "fact-1",
          claimType: "term",
          subject: "Round-trip",
          predicate: "definition",
          object: "Round-trip keeps metadata intact.",
          normalizedValue: "round-trip keeps metadata intact.",
          sourceIds: ["anchor-1"],
          confidence: 0.95,
          mustPreserve: true,
        },
      ],
      softFacts: [],
      sourceEntries: [
        {
          id: "anchor-1",
          url: "https://example.com/round-trip",
          domain: "example.com",
          title: "Round-trip",
          sourceTier: "anchor",
          retrievalMethod: "search",
          excerpt: "Round-trip keeps metadata intact.",
          retrievedAt: "2026-03-27T00:00:00.000Z",
          trustScore: 0.9,
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
      status: "blocked",
      blockingIssueCount: 1,
      repairableIssueCount: 0,
      panelClaims: [
        {
          panelIndex: 0,
          hardClaims: [
            {
              claimType: "date",
              rawText: "1642年",
              normalizedValue: "1642",
              matchedFactId: "fact-1",
              matchStatus: "conflicting",
            },
          ],
          unsupportedClaims: [],
          riskLevel: "high",
        },
      ],
      panels: [
        {
          panelIndex: 0,
          claimType: "date",
          rawText: "1642年",
          reason: "conflicts with fact pack",
          matchedFactId: "fact-1",
        },
      ],
      sourceCoverage: {
        anchor: true,
        whitelist: false,
        open_web: false,
      },
    },
    accuracyErrorSummary: {
      status: "blocked",
      blockingIssueCount: 1,
      panels: [
        {
          panelIndex: 0,
          claimType: "date",
          rawText: "1642年",
          reason: "conflicts with fact pack",
          matchedFactId: "fact-1",
        },
      ],
      generatedAt: "2026-03-27T00:09:00.000Z",
      sourceCoverage: {
        anchor: true,
        whitelist: false,
        open_web: false,
      },
    },
  };
}

function makeCharacter(): Character {
  return {
    id: "char-review-roundtrip",
    name: "Alice",
    description: "Main character",
    appearance: {
      gender: "female",
      age: "adult",
      hair: "black",
      eyes: "brown",
      clothing: "robe",
    },
    style: "anime",
    avatarUrl: null,
    referenceEntries: [],
    tags: ["hero"],
    visualScore: {
      overall: 6,
      featureClarity: 6,
      consistency: 7,
      imageQuality: 5,
      issues: ["slightly blurry"],
      suggestions: ["increase sharpness"],
      evaluatedAt: "2026-03-27T02:00:00.000Z",
    },
    reviewStatus: "needs_repair",
    lastReviewAt: "2026-03-27T02:00:00.000Z",
    createdAt: "2026-03-27T00:00:00.000Z",
    updatedAt: "2026-03-27T02:00:00.000Z",
  };
}

afterEach(() => {
  cwdSpy?.mockRestore();
  cwdSpy = undefined;

  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("server db review persistence", () => {
  it("round-trips task review metadata through SQLite metadata storage", async () => {
    const dbModule = await loadIsolatedDb();
    const task = makeTask();

    dbModule.upsertTask(task);
    const roundTripped = dbModule.getTaskById(task.id);

    expect(roundTripped).not.toBeNull();
    expect(roundTripped?.visualQualityScore).toEqual(task.visualQualityScore);
    expect(roundTripped?.reviewStatus).toBe(task.reviewStatus);
    expect(roundTripped?.panelReview).toEqual(task.panelReview);
    expect(roundTripped?.visualRetrySummary).toEqual(task.visualRetrySummary);
    expect(roundTripped?.lastReviewAt).toBe(task.lastReviewAt);
    expect(roundTripped?.visualDiagnosisReport).toEqual(task.visualDiagnosisReport);
    expect(roundTripped?.visualDiagnosisState).toBe(task.visualDiagnosisState);
    expect(roundTripped?.visualDiagnosisStale).toBe(task.visualDiagnosisStale);
    expect(roundTripped?.lastDiagnosisAt).toBe(task.lastDiagnosisAt);
    expect(roundTripped?.visualRepairExecution).toEqual(task.visualRepairExecution);
    expect(roundTripped?.factPack).toEqual(task.factPack);
    expect(roundTripped?.researchBrief).toEqual(task.researchBrief);
    expect(roundTripped?.accuracyReview).toEqual(task.accuracyReview);
    expect(roundTripped?.accuracyErrorSummary).toEqual(task.accuracyErrorSummary);
    expect(roundTripped?.queueSummary).toEqual(task.queueSummary);
    expect(roundTripped?.presetSnapshot).toEqual(task.presetSnapshot);
    expect(roundTripped?.createdAt).toEqual(task.createdAt);
    expect(roundTripped?.updatedAt).toEqual(task.updatedAt);
  });

  it("round-trips character review metadata through SQLite metadata storage", async () => {
    const dbModule = await loadIsolatedDb();
    const character = makeCharacter();

    dbModule.upsertCharacter(character);
    const roundTripped = dbModule.getCharacterById(character.id);

    expect(roundTripped).not.toBeNull();
    expect(roundTripped?.visualScore).toEqual(character.visualScore);
    expect(roundTripped?.reviewStatus).toBe(character.reviewStatus);
    expect(roundTripped?.lastReviewAt).toBe(character.lastReviewAt);
    expect(roundTripped?.createdAt).toBe(character.createdAt);
    expect(roundTripped?.updatedAt).toBe(character.updatedAt);
  });

  it("fails closed when persisted diagnosis metadata is malformed", async () => {
    const dbModule = await loadIsolatedDb();
    const task = makeTask();

    dbModule.upsertTask(task);

    const dbPath = path.join(tempDir!, "data", "comicpedia.db");
    const sqlite = new Database(dbPath);
    sqlite
      .prepare("UPDATE tasks SET metadata = ? WHERE id = ?")
      .run(JSON.stringify({
        visualDiagnosisState: "running-but-wrong",
        visualDiagnosisStale: "nope",
        lastDiagnosisAt: 42,
        visualDiagnosisReport: {
          schemaVersion: 1,
          generatedAt: "2026-03-27T01:10:00.000Z",
          sourceEvaluatedAt: "2026-03-27T01:00:00.000Z",
          panels: [{ panelIndex: "0" }],
        },
      }), task.id);
    sqlite.close();

    const roundTripped = dbModule.getTaskById(task.id);

    expect(roundTripped).not.toBeNull();
    expect(roundTripped?.visualDiagnosisReport).toBeUndefined();
    expect(roundTripped?.visualDiagnosisState).toBeUndefined();
    expect(roundTripped?.visualDiagnosisStale).toBeUndefined();
    expect(roundTripped?.lastDiagnosisAt).toBeUndefined();
  });

  it("cleans up durable task jobs when deleting a single task", async () => {
    const dbModule = await loadIsolatedDb();
    const task = makeTask();
    dbModule.upsertTask(task);
    dbModule.upsertTaskJob({
      id: "job-cleanup-single",
      taskId: task.id,
      kind: "panel_image",
      status: "queued",
      panelIndex: 0,
      attemptCount: 1,
      createdAt: "2026-03-27T00:00:00.000Z",
      updatedAt: "2026-03-27T00:00:00.000Z",
    });

    expect(dbModule.listTaskJobsByTaskId(task.id)).toHaveLength(1);
    expect(dbModule.deleteTask(task.id)).toBe(true);
    expect(dbModule.listTaskJobsByTaskId(task.id)).toHaveLength(0);
  });

  it("cleans up durable task jobs when clearing all tasks", async () => {
    const dbModule = await loadIsolatedDb();
    const task = makeTask();
    dbModule.upsertTask(task);
    dbModule.upsertTaskJob({
      id: "job-cleanup-bulk",
      taskId: task.id,
      kind: "panel_image",
      status: "queued",
      panelIndex: 0,
      attemptCount: 1,
      createdAt: "2026-03-27T00:00:00.000Z",
      updatedAt: "2026-03-27T00:00:00.000Z",
    });

    expect(dbModule.listTaskJobsByTaskId(task.id)).toHaveLength(1);
    dbModule.clearAllTasks();
    expect(dbModule.listTaskJobsByTaskId(task.id)).toHaveLength(0);
  });
});
