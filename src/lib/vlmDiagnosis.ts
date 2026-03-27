import type {
  ComicScript,
  PanelVisualScore,
  PartialLLMConfig,
  VisualDiagnosisActionability,
  VisualDiagnosisConfidence,
  VisualDiagnosisEvidenceStrength,
  VisualDiagnosisIssue,
  VisualDiagnosisPanel,
  VisualDiagnosisReport,
  VisualDiagnosisSeverity,
  VisualQualityScore,
  VisualRepairMode,
} from "./types";
import { extractJsonObject } from "./utils";
import { callVisionModel, resolveImageToBase64 } from "./vlmScorer";

type TrustInput = {
  modelConfidence?: string;
  evidence: string;
  alignsWithScoreWeakness: boolean;
  ambiguityPenalty?: "low" | "medium" | "high";
};

type DiagnosisParseContext = {
  imageUrl: string;
  promptSnapshot: string;
  alignsWithScoreWeakness: boolean;
};

type DiagnosisPromptInput = {
  panelIndex: number;
  imagePrompt: string;
  style: string;
  totalPanels: number;
  panelScore: PanelVisualScore;
  crossPanelIssues?: string[];
};

function normalizeModelConfidence(value: string | undefined): VisualDiagnosisConfidence {
  return value === "high" || value === "medium" || value === "low" ? value : "medium";
}

function normalizeSeverity(value: unknown): VisualDiagnosisSeverity {
  return value === "high" || value === "medium" || value === "low" ? value : "medium";
}

function normalizeAffectedDimensions(value: unknown): VisualDiagnosisIssue["affectedDimensions"] {
  if (!Array.isArray(value)) return ["compositionQuality"];
  return value.filter((dimension): dimension is VisualDiagnosisIssue["affectedDimensions"][number] => (
    dimension === "textImageAlignment"
    || dimension === "styleAdherence"
    || dimension === "artifactScore"
    || dimension === "compositionQuality"
    || dimension === "crossPanelConsistency"
  ));
}

function deriveEvidenceStrength(evidence: string): VisualDiagnosisEvidenceStrength {
  const normalized = evidence.trim().toLowerCase();
  if (!normalized || normalized.length < 20 || /feels|maybe|slightly|a bit|kind of/.test(normalized)) {
    return "weak";
  }
  if (/left|right|top|bottom|cropped|cut off|missing|extra|\d/.test(normalized) || normalized.length >= 32) {
    return "strong";
  }
  return "medium";
}

export function deriveIssueTrust(input: TrustInput): {
  confidence: VisualDiagnosisConfidence;
  evidenceStrength: VisualDiagnosisEvidenceStrength;
  falsePositiveRisk: VisualDiagnosisConfidence;
  actionability: VisualDiagnosisActionability;
} {
  const modelConfidence = normalizeModelConfidence(input.modelConfidence);
  const evidenceStrength = deriveEvidenceStrength(input.evidence);

  let score = modelConfidence === "high" ? 2 : modelConfidence === "medium" ? 1 : 0;
  if (input.alignsWithScoreWeakness) score += 1;
  if (evidenceStrength === "strong") score += 1;
  if (evidenceStrength === "weak") score -= 1;
  if (input.ambiguityPenalty === "high") score -= 2;
  if (input.ambiguityPenalty === "medium") score -= 1;

  const confidence: VisualDiagnosisConfidence = score >= 3 ? "high" : score >= 1 ? "medium" : "low";
  const falsePositiveRisk: VisualDiagnosisConfidence = input.ambiguityPenalty === "high" || confidence === "low"
    ? "high"
    : input.ambiguityPenalty === "medium" || confidence === "medium"
      ? "medium"
      : "low";
  const actionability: VisualDiagnosisActionability = falsePositiveRisk === "high"
    ? "manual_only"
    : confidence === "high" && evidenceStrength === "strong"
      ? "apply_directly"
      : "confirm_first";

  return { confidence, evidenceStrength, falsePositiveRisk, actionability };
}

export function deriveRepairMode(
  issueType: string,
  falsePositiveRisk: VisualDiagnosisConfidence,
): VisualRepairMode {
  if (falsePositiveRisk === "high") return "manual";
  if ([
    "composition_mismatch",
    "scene_misread",
    "subject_emphasis_error",
    "style_drift",
    "character_drift",
  ].includes(issueType)) {
    return "rewrite";
  }
  return "patch";
}

export function pickDiagnosisCandidates(
  visualScore: VisualQualityScore,
  targetPanels?: number[],
): number[] {
  const scoredPanels = new Set(visualScore.panels.map((panel) => panel.panelIndex));
  if (targetPanels?.length) {
    return Array.from(new Set(targetPanels.filter((panelIndex) => scoredPanels.has(panelIndex)))).sort((a, b) => a - b);
  }

  const panelIndices = new Set<number>();
  for (const recommendation of visualScore.retryRecommendations) {
    panelIndices.add(recommendation.panelIndex);
  }
  for (const issue of visualScore.crossPanelDetail?.issues ?? []) {
    for (const panelIndex of issue.panelIndices) {
      if (scoredPanels.has(panelIndex)) panelIndices.add(panelIndex);
    }
  }

  return Array.from(panelIndices).sort((a, b) => a - b);
}

export function buildDiagnosisPrompt(input: DiagnosisPromptInput): string {
  const weakDimensions = [
    { dimension: "textImageAlignment", score: input.panelScore.textImageAlignment },
    { dimension: "styleAdherence", score: input.panelScore.styleAdherence },
    { dimension: "artifactScore", score: input.panelScore.artifactScore },
    { dimension: "compositionQuality", score: input.panelScore.compositionQuality },
  ]
    .filter((item) => item.score < 6)
    .map((item) => item.dimension);

  return `You are a visual diagnosis expert for AI-generated comic panels.

Inspect panel ${input.panelIndex + 1} of ${input.totalPanels}.

## Target Prompt
${input.imagePrompt}

## Target Style
${input.style}

## Score-Pass Weak Dimensions
${weakDimensions.length > 0 ? weakDimensions.join(", ") : "none"}

## Cross-Panel Context
${input.crossPanelIssues?.length ? input.crossPanelIssues.join("\n") : "none"}

Return JSON only with:
- issues[]
- repair
`;
}

export function parseDiagnosisResponse(
  panelIndex: number,
  content: string,
  context: DiagnosisParseContext,
): VisualDiagnosisPanel {
  const parsed = extractJsonObject(content) ?? {};
  const issuesInput = Array.isArray(parsed.issues) ? parsed.issues : [];

  const issues: VisualDiagnosisIssue[] = issuesInput.flatMap((issue) => {
    if (!issue || typeof issue !== "object") return [];
    const candidate = issue as Record<string, unknown>;
    if (typeof candidate.issueType !== "string" || typeof candidate.evidence !== "string") return [];

    const trust = deriveIssueTrust({
      modelConfidence: typeof candidate.modelConfidence === "string" ? candidate.modelConfidence : undefined,
      evidence: candidate.evidence,
      alignsWithScoreWeakness: context.alignsWithScoreWeakness,
      ambiguityPenalty: candidate.ambiguityPenalty === "low" || candidate.ambiguityPenalty === "medium" || candidate.ambiguityPenalty === "high"
        ? candidate.ambiguityPenalty
        : undefined,
    });

    const affectedDimensions = normalizeAffectedDimensions(candidate.affectedDimensions);
    if (affectedDimensions.length === 0) return [];

    return [{
      issueType: candidate.issueType,
      severity: normalizeSeverity(candidate.severity),
      affectedDimensions,
      evidence: candidate.evidence.trim(),
      confidence: trust.confidence,
      evidenceStrength: trust.evidenceStrength,
      falsePositiveRisk: trust.falsePositiveRisk,
      actionability: trust.actionability,
    }];
  });

  const topIssue = issues[0];
  const repairInput = parsed.repair && typeof parsed.repair === "object"
    ? parsed.repair as Record<string, unknown>
    : {};
  const recommendedMode = topIssue
    ? deriveRepairMode(topIssue.issueType, topIssue.falsePositiveRisk)
    : "manual";

  return {
    panelIndex,
    imageUrl: context.imageUrl,
    promptSnapshot: context.promptSnapshot,
    status: issues.length > 0 ? "issues_found" : "clean",
    topIssueType: topIssue?.issueType ?? "no_issue_detected",
    severity: topIssue?.severity ?? "low",
    issues,
    repair: {
      recommendedMode,
      rationale: typeof repairInput.rationale === "string" && repairInput.rationale.trim()
        ? repairInput.rationale
        : topIssue
          ? `Diagnosis suggests ${recommendedMode} for ${topIssue.issueType}.`
          : "No actionable issue detected.",
      suggestedPrompt: typeof repairInput.suggestedPrompt === "string" ? repairInput.suggestedPrompt : undefined,
      suggestedNegativePrompt: typeof repairInput.suggestedNegativePrompt === "string" ? repairInput.suggestedNegativePrompt : undefined,
      patchPositive: Array.isArray(repairInput.patchPositive) ? repairInput.patchPositive.filter((item): item is string => typeof item === "string") : undefined,
      patchNegative: Array.isArray(repairInput.patchNegative) ? repairInput.patchNegative.filter((item): item is string => typeof item === "string") : undefined,
      expectedImprovement: Array.isArray(repairInput.expectedImprovement)
        ? repairInput.expectedImprovement.filter((item): item is string => typeof item === "string")
        : [],
    },
  };
}

export function summarizeDiagnosisReport(
  panels: VisualDiagnosisPanel[],
): VisualDiagnosisReport["summary"] {
  return {
    problemPanelCount: panels.filter((panel) => panel.status !== "clean").length,
    highSeverityCount: panels.filter((panel) => panel.severity === "high").length,
    actionableCount: panels.filter((panel) => panel.issues.some((issue) => issue.actionability !== "manual_only")).length,
    crossPanelIssueCount: panels.reduce((count, panel) => count + panel.issues.filter((issue) => issue.affectedDimensions.includes("crossPanelConsistency")).length, 0),
  };
}

export async function evaluateVisualDiagnosis(
  script: ComicScript,
  visualScore: VisualQualityScore,
  vlmConfig: PartialLLMConfig,
  targetPanels?: number[],
): Promise<VisualDiagnosisReport> {
  const candidateIndices = pickDiagnosisCandidates(visualScore, targetPanels);
  const crossPanelIssuesByIndex = new Map<number, string[]>();

  for (const issue of visualScore.crossPanelDetail?.issues ?? []) {
    for (const panelIndex of issue.panelIndices) {
      const existing = crossPanelIssuesByIndex.get(panelIndex) ?? [];
      existing.push(issue.description);
      crossPanelIssuesByIndex.set(panelIndex, existing);
    }
  }

  const diagnosedPanels: VisualDiagnosisPanel[] = [];
  for (const panelIndex of candidateIndices) {
    const panel = script.panels[panelIndex];
    const panelScore = visualScore.panels.find((item) => item.panelIndex === panelIndex);
    if (!panel?.imageUrl || !panelScore) continue;

    const imageBase64 = await resolveImageToBase64(panel.imageUrl);
    if (!imageBase64) continue;

    const prompt = buildDiagnosisPrompt({
      panelIndex,
      imagePrompt: panel.imagePrompt,
      style: panel.styleOverride ?? script.style,
      totalPanels: script.panels.length,
      panelScore,
      crossPanelIssues: crossPanelIssuesByIndex.get(panelIndex),
    });
    const content = await callVisionModel(prompt, imageBase64, vlmConfig);
    diagnosedPanels.push(parseDiagnosisResponse(panelIndex, content, {
      imageUrl: panel.imageUrl,
      promptSnapshot: panel.imagePrompt,
      alignsWithScoreWeakness: panelScore.overall < 6
        || visualScore.retryRecommendations.some((recommendation) => recommendation.panelIndex === panelIndex),
    }));
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceEvaluatedAt: visualScore.evaluatedAt,
    model: {
      provider: vlmConfig.provider,
      model: vlmConfig.model,
    },
    summary: summarizeDiagnosisReport(diagnosedPanels),
    panels: diagnosedPanels,
  };
}

export async function runVisualDiagnosisFlow({
  script,
  visualScore,
  vlmConfig,
  targetPanels,
  saveReport,
  saveFailure,
}: {
  script: ComicScript;
  visualScore: VisualQualityScore;
  vlmConfig: PartialLLMConfig;
  targetPanels?: number[];
  saveReport: (report: VisualDiagnosisReport) => Promise<void> | void;
  saveFailure?: () => Promise<void> | void;
}): Promise<VisualDiagnosisReport> {
  try {
    const report = await evaluateVisualDiagnosis(script, visualScore, vlmConfig, targetPanels);
    await saveReport(report);
    return report;
  } catch (error) {
    await saveFailure?.();
    throw error;
  }
}
