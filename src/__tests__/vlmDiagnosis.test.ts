import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComicScript, VisualDiagnosisPanel, VisualQualityScore } from "@/lib/types";
import {
  buildDiagnosisPrompt,
  deriveIssueTrust,
  deriveRepairMode,
  evaluateVisualDiagnosis,
  parseDiagnosisResponse,
  pickDiagnosisCandidates,
  summarizeDiagnosisReport,
} from "@/lib/vlmDiagnosis";

function makeVisualScore(overrides: Partial<VisualQualityScore> = {}): VisualQualityScore {
  return {
    overall: 6.4,
    panels: [
      {
        panelIndex: 0,
        textImageAlignment: 8,
        styleAdherence: 8,
        artifactScore: 8,
        compositionQuality: 8,
        overall: 8,
        issues: [],
      },
      {
        panelIndex: 1,
        textImageAlignment: 4,
        styleAdherence: 5,
        artifactScore: 6,
        compositionQuality: 4,
        overall: 4.8,
        issues: ["main subject is cropped out of frame"],
      },
      {
        panelIndex: 2,
        textImageAlignment: 7,
        styleAdherence: 7,
        artifactScore: 7,
        compositionQuality: 7,
        overall: 7,
        issues: [],
      },
    ],
    retryRecommendations: [
      {
        panelIndex: 1,
        reason: "main subject is cropped out of frame",
        suggestedFix: "use a wider shot",
      },
    ],
    crossPanelDetail: {
      characterConsistency: 5,
      styleDrift: 6,
      colorPaletteCoherence: 6,
      overall: 5.7,
      issues: [
        {
          panelIndices: [1, 2],
          description: "主角外观在相邻面板间不一致",
        },
      ],
    },
    evaluatedAt: "2026-03-27T01:00:00.000Z",
    ...overrides,
  };
}

function makeScript(): ComicScript {
  return {
    title: "Diagnosis Comic",
    topic: "Diagnosis Topic",
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
      {
        id: 2,
        scene: "Scene 2",
        dialogue: "Dialogue 2",
        imagePrompt: "Prompt 2",
        imageUrl: "data:image/png;base64,panel-2",
        status: "completed",
      },
      {
        id: 3,
        scene: "Scene 3",
        dialogue: "Dialogue 3",
        imagePrompt: "Prompt 3",
        imageUrl: "data:image/png;base64,panel-3",
        status: "completed",
      },
    ],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pickDiagnosisCandidates", () => {
  it("selects retry panels and cross-panel flagged panels without duplicates", () => {
    expect(pickDiagnosisCandidates(makeVisualScore())).toEqual([1, 2]);
  });
});

describe("deriveIssueTrust", () => {
  it("marks specific aligned evidence as high confidence and directly actionable", () => {
    expect(deriveIssueTrust({
      modelConfidence: "high",
      evidence: "Main subject is cropped out of frame on the right edge.",
      alignsWithScoreWeakness: true,
      ambiguityPenalty: "low",
    })).toEqual({
      confidence: "high",
      evidenceStrength: "strong",
      falsePositiveRisk: "low",
      actionability: "apply_directly",
    });
  });

  it("downgrades vague ambiguous findings to manual only", () => {
    expect(deriveIssueTrust({
      modelConfidence: "medium",
      evidence: "style feels a bit off",
      alignsWithScoreWeakness: false,
      ambiguityPenalty: "high",
    })).toEqual({
      confidence: "low",
      evidenceStrength: "weak",
      falsePositiveRisk: "high",
      actionability: "manual_only",
    });
  });
});

describe("deriveRepairMode", () => {
  it("prefers rewrite for composition-level problems", () => {
    expect(deriveRepairMode("composition_mismatch", "low")).toBe("rewrite");
  });

  it("falls back to manual for high-risk findings", () => {
    expect(deriveRepairMode("anatomy_defect", "high")).toBe("manual");
  });
});

describe("parseDiagnosisResponse", () => {
  it("parses diagnosis JSON into a normalized panel audit card", () => {
    const parsed = parseDiagnosisResponse(1, JSON.stringify({
      issues: [
        {
          issueType: "composition_mismatch",
          severity: "high",
          affectedDimensions: ["compositionQuality", "textImageAlignment"],
          evidence: "Main subject is cropped out of frame",
          modelConfidence: "high",
          ambiguityPenalty: "low",
        },
      ],
      repair: {
        suggestedPrompt: "A wider shot that keeps the full subject visible.",
        suggestedNegativePrompt: "cropped subject, cut off body",
        expectedImprovement: ["Keeps the full subject in frame"],
      },
    }), {
      imageUrl: "data:image/png;base64,panel-2",
      promptSnapshot: "Prompt 2",
      alignsWithScoreWeakness: true,
    });

    expect(parsed.panelIndex).toBe(1);
    expect(parsed.status).toBe("issues_found");
    expect(parsed.topIssueType).toBe("composition_mismatch");
    expect(parsed.issues[0].confidence).toBe("high");
    expect(parsed.repair.recommendedMode).toBe("rewrite");
    expect(parsed.repair.suggestedPrompt).toContain("wider shot");
  });
});

describe("buildDiagnosisPrompt", () => {
  it("includes score-pass weakness and cross-panel context in the prompt", () => {
    const prompt = buildDiagnosisPrompt({
      panelIndex: 1,
      imagePrompt: "Prompt 2",
      style: "anime",
      totalPanels: 3,
      panelScore: makeVisualScore().panels[1],
      crossPanelIssues: ["主角外观在相邻面板间不一致"],
    });

    expect(prompt).toContain("panel 2 of 3");
    expect(prompt).toContain("Prompt 2");
    expect(prompt).toContain("compositionQuality");
    expect(prompt).toContain("主角外观在相邻面板间不一致");
  });
});

describe("summarizeDiagnosisReport", () => {
  it("counts problem, high-severity, actionable, and cross-panel issues", () => {
    const panels: VisualDiagnosisPanel[] = [
      {
        panelIndex: 1,
        imageUrl: "data:image/png;base64,panel-2",
        promptSnapshot: "Prompt 2",
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
          rationale: "Framing problem changes the scene layout.",
          expectedImprovement: ["Keeps the main subject visible"],
        },
      },
      {
        panelIndex: 2,
        imageUrl: "data:image/png;base64,panel-3",
        promptSnapshot: "Prompt 3",
        status: "issues_found",
        topIssueType: "character_drift",
        severity: "medium",
        issues: [
          {
            issueType: "character_drift",
            severity: "medium",
            affectedDimensions: ["crossPanelConsistency"],
            evidence: "Character outfit differs from adjacent panel",
            confidence: "medium",
            evidenceStrength: "medium",
            falsePositiveRisk: "medium",
            actionability: "confirm_first",
          },
        ],
        repair: {
          recommendedMode: "rewrite",
          rationale: "Cross-panel identity mismatch needs prompt clarification.",
          expectedImprovement: ["Restores consistent character appearance"],
        },
      },
    ];

    expect(summarizeDiagnosisReport(panels)).toEqual({
      problemPanelCount: 2,
      highSeverityCount: 1,
      actionableCount: 2,
      crossPanelIssueCount: 1,
    });
  });
});

describe("evaluateVisualDiagnosis", () => {
  it("diagnoses only retry or cross-panel candidates and returns a structured report", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              issues: [
                {
                  issueType: "composition_mismatch",
                  severity: "high",
                  affectedDimensions: ["compositionQuality", "textImageAlignment"],
                  evidence: "Main subject is cropped out of frame",
                  modelConfidence: "high",
                  ambiguityPenalty: "low",
                },
              ],
              repair: {
                suggestedPrompt: "A wider shot that keeps the full subject visible.",
                expectedImprovement: ["Keeps the main subject in frame"],
              },
            }),
          },
        }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const report = await evaluateVisualDiagnosis(
      makeScript(),
      makeVisualScore(),
      { apiUrl: "https://example.com/v1", model: "gpt-4o", provider: "openai-compatible", apiKey: "test" },
    );

    expect(report.schemaVersion).toBe(1);
    expect(report.sourceEvaluatedAt).toBe("2026-03-27T01:00:00.000Z");
    expect(report.panels.map((panel) => panel.panelIndex)).toEqual([1, 2]);
    expect(report.summary.problemPanelCount).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("skips candidates whose images cannot be resolved", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              issues: [
                {
                  issueType: "composition_mismatch",
                  severity: "high",
                  affectedDimensions: ["compositionQuality"],
                  evidence: "Main subject is cropped out of frame",
                  modelConfidence: "high",
                  ambiguityPenalty: "low",
                },
              ],
              repair: {
                suggestedPrompt: "A wider shot that keeps the full subject visible.",
                expectedImprovement: ["Keeps the main subject in frame"],
              },
            }),
          },
        }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const script = makeScript();
    script.panels[1].imageUrl = "";
    const report = await evaluateVisualDiagnosis(
      script,
      makeVisualScore(),
      { apiUrl: "https://example.com/v1", model: "gpt-4o", provider: "openai-compatible", apiKey: "test" },
      [1, 2],
    );

    expect(report.panels.map((panel) => panel.panelIndex)).toEqual([2]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
