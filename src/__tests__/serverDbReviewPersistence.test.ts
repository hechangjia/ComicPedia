import fs from "fs";
import os from "os";
import path from "path";
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
    generationConfig: {
      quality: "fine",
      generatedAt: "2026-03-27T00:00:00.000Z",
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
    expect(roundTripped?.factPack).toEqual(task.factPack);
    expect(roundTripped?.researchBrief).toEqual(task.researchBrief);
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
});
