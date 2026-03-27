import type {
  AccuracyIssuePanel,
  AccuracyPanelClaim,
  AccuracyReviewResult,
  ComicScript,
  FactPack,
  PanelClaimSet,
} from "@/lib/types";

const YEAR_REGEX = /\b(1[0-9]{3}|20[0-9]{2})\b/g;
const AGE_REGEX = /(\d{1,3})\s*岁/g;

function normalizeValue(rawText: string, claimType: AccuracyPanelClaim["claimType"]): string {
  if (claimType === "date" || claimType === "number") {
    const digits = rawText.match(/\d+/g);
    return digits ? digits.join("") : rawText.trim();
  }
  return rawText.trim().toLowerCase();
}

function buildSourceCoverage(factPack: FactPack): AccuracyReviewResult["sourceCoverage"] {
  return {
    anchor: factPack.sourceEntries.some((entry) => entry.sourceTier === "anchor"),
    whitelist: factPack.sourceEntries.some((entry) => entry.sourceTier === "whitelist"),
    open_web: factPack.sourceEntries.some((entry) => entry.sourceTier === "open_web"),
  };
}

function matchClaim(claim: AccuracyPanelClaim, factPack: FactPack): AccuracyPanelClaim {
  const sameTypeFacts = factPack.hardFacts.filter((fact) => fact.claimType === claim.claimType);
  const exactMatch = sameTypeFacts.find((fact) => fact.normalizedValue === claim.normalizedValue);
  if (exactMatch) {
    return {
      ...claim,
      matchedFactId: exactMatch.id,
      matchStatus: "matched",
    };
  }

  if (sameTypeFacts.length > 0) {
    return {
      ...claim,
      matchedFactId: sameTypeFacts[0].id,
      matchStatus: "conflicting",
    };
  }

  return {
    ...claim,
    matchStatus: "missing",
  };
}

function extractDateClaims(text: string): AccuracyPanelClaim[] {
  return Array.from(new Set(text.match(YEAR_REGEX) || [])).map((rawText) => ({
    claimType: "date" as const,
    rawText,
    normalizedValue: normalizeValue(rawText, "date"),
    matchStatus: "missing" as const,
  }));
}

function extractNumberClaims(text: string): AccuracyPanelClaim[] {
  return Array.from(new Set(
    Array.from(text.matchAll(AGE_REGEX)).map((match) => match[0]),
  )).map((rawText) => ({
    claimType: "number" as const,
    rawText,
    normalizedValue: normalizeValue(rawText, "number"),
    matchStatus: "missing" as const,
  }));
}

export function extractPanelClaims(script: ComicScript): PanelClaimSet[] {
  return script.panels.map((panel, index) => ({
    panelIndex: index,
    hardClaims: [
      ...extractDateClaims(panel.dialogue),
      ...extractNumberClaims(panel.dialogue),
    ],
    unsupportedClaims: [],
    riskLevel: "low",
  }));
}

export function reviewPanelClaims(script: ComicScript, factPack: FactPack): AccuracyReviewResult {
  const panelClaims = extractPanelClaims(script).map((panel) => {
    const hardClaims = panel.hardClaims.map((claim) => matchClaim(claim, factPack));
    const unsupportedClaims = hardClaims.filter((claim) => claim.matchStatus !== "matched");
    const riskLevel: PanelClaimSet["riskLevel"] = hardClaims.some((claim) => claim.matchStatus === "conflicting")
      ? "high"
      : unsupportedClaims.length > 0
        ? "medium"
        : "low";

    return {
      ...panel,
      hardClaims,
      unsupportedClaims,
      riskLevel,
    };
  });

  const panels: AccuracyIssuePanel[] = [];
  let repairableIssueCount = 0;

  panelClaims.forEach((panel) => {
    panel.hardClaims.forEach((claim) => {
      if (claim.matchStatus === "conflicting") {
        panels.push({
          panelIndex: panel.panelIndex,
          claimType: claim.claimType,
          rawText: claim.rawText,
          reason: "conflicts with fact pack",
          matchedFactId: claim.matchedFactId,
        });
      } else if (claim.matchStatus === "missing" || claim.matchStatus === "ambiguous") {
        repairableIssueCount += 1;
      }
    });
  });

  return {
    status: panels.length > 0
      ? "blocked"
      : repairableIssueCount > 0
        ? "repair_required"
        : "passed",
    blockingIssueCount: panels.length,
    repairableIssueCount,
    panelClaims,
    panels,
    sourceCoverage: buildSourceCoverage(factPack),
  };
}
