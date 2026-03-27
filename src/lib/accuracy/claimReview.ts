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
const TERM_REGEX = /([^。！？；]{2,60}(?:是|指)[^。！？；]{2,80})/g;
const PLACE_REGEX = /(?:出生于|位于|来自)\s*([^，。；！？]+)/g;
const EVENT_REGEX = /([^，。；！？]{2,80}由[^，。；！？]{2,20}提出)/g;
const PERSON_ROLE_REGEX = /([^，。；！？]{1,12})是[^，。；！？]{1,20}(?:家|者|学家)/g;
const PERSON_BIRTH_REGEX = /([^，。；！？]{1,12})出生于/g;
const PERSON_ATTRIBUTION_REGEX = /由([^，。；！？]{1,12})提出/g;

function canonicalizeText(rawText: string): string {
  return rawText
    .trim()
    .toLowerCase()
    .replace(/[，。！？；：、“”"'（）()\[\]\s]/g, "")
    .replace(/[与及]/g, "和");
}

function buildPersonAliases(factPack: FactPack): string[] {
  const aliases = new Set<string>();
  factPack.hardFacts
    .filter((fact) => fact.claimType === "person")
    .forEach((fact) => {
      [fact.subject, fact.object, fact.normalizedValue].forEach((value) => {
        const normalized = canonicalizeText(value);
        if (normalized) aliases.add(normalized);
      });
      const splitParts = fact.object.split(/[·•\s]+/).map(canonicalizeText).filter(Boolean);
      splitParts.forEach((part) => aliases.add(part));
      if (splitParts.length > 0) {
        aliases.add(splitParts[splitParts.length - 1]);
      }
    });
  return [...aliases].sort((a, b) => b.length - a.length);
}

function stripKnownPersonAliases(value: string, factPack: FactPack): string {
  let normalized = value;
  for (const alias of buildPersonAliases(factPack)) {
    normalized = normalized.replaceAll(alias, "");
  }
  return normalized;
}

function normalizeValue(rawText: string, claimType: AccuracyPanelClaim["claimType"]): string {
  if (claimType === "date" || claimType === "number") {
    const digits = rawText.match(/\d+/g);
    return digits ? digits.join("") : rawText.trim();
  }
  return canonicalizeText(rawText);
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
  const exactMatch = sameTypeFacts.find((fact) => {
    if (claim.claimType === "person") {
      const aliases = [
        canonicalizeText(fact.subject),
        canonicalizeText(fact.object),
        canonicalizeText(fact.normalizedValue),
        ...fact.object.split(/[·•\s]+/).map(canonicalizeText).filter(Boolean),
      ];
      return aliases.includes(claim.normalizedValue);
    }

    if (claim.claimType === "term") {
      const factNormalized = stripKnownPersonAliases(normalizeValue(fact.normalizedValue || fact.object, "term"), factPack);
      const claimNormalized = stripKnownPersonAliases(claim.normalizedValue, factPack);
      return factNormalized === claimNormalized
        || factNormalized.includes(claimNormalized)
        || claimNormalized.includes(factNormalized);
    }

    return normalizeValue(fact.normalizedValue || fact.object, claim.claimType) === claim.normalizedValue;
  });
  if (exactMatch) {
    return {
      ...claim,
      matchedFactId: exactMatch.id,
      matchStatus: "matched",
    };
  }

  if (sameTypeFacts.length === 1) {
    return {
      ...claim,
      matchedFactId: sameTypeFacts[0].id,
      matchStatus: "conflicting",
    };
  }

  if (sameTypeFacts.length > 1) {
    return {
      ...claim,
      matchStatus: "ambiguous",
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

function extractTermClaims(text: string): AccuracyPanelClaim[] {
  return Array.from(new Set(text.match(TERM_REGEX) || [])).map((rawText) => ({
    claimType: "term" as const,
    rawText,
    normalizedValue: normalizeValue(rawText, "term"),
    matchStatus: "missing" as const,
  }));
}

function extractPlaceClaims(text: string): AccuracyPanelClaim[] {
  return Array.from(new Set(
    Array.from(text.matchAll(PLACE_REGEX)).map((match) => match[1]),
  ))
    .filter((rawText) => !/\d/.test(rawText))
    .map((rawText) => ({
    claimType: "place" as const,
    rawText,
    normalizedValue: normalizeValue(rawText, "place"),
    matchStatus: "missing" as const,
  }));
}

function extractEventClaims(text: string): AccuracyPanelClaim[] {
  return Array.from(new Set(text.match(EVENT_REGEX) || [])).map((rawText) => ({
    claimType: "event" as const,
    rawText,
    normalizedValue: normalizeValue(rawText, "event"),
    matchStatus: "missing" as const,
  }));
}

function extractPersonClaims(text: string): AccuracyPanelClaim[] {
  const rawMatches = [
    ...Array.from(text.matchAll(PERSON_ROLE_REGEX)).map((match) => match[1]),
    ...Array.from(text.matchAll(PERSON_BIRTH_REGEX)).map((match) => match[1]),
    ...Array.from(text.matchAll(PERSON_ATTRIBUTION_REGEX)).map((match) => match[1]),
  ];

  return Array.from(new Set(rawMatches))
    .filter((rawText) => rawText.length >= 2 && rawText.length <= 12 && !/\d/.test(rawText))
    .map((rawText) => ({
      claimType: "person" as const,
      rawText,
      normalizedValue: normalizeValue(rawText, "person"),
      matchStatus: "missing" as const,
    }));
}

export function extractPanelClaims(script: ComicScript): PanelClaimSet[] {
  return script.panels.map((panel, index) => ({
    panelIndex: index,
    hardClaims: [
      ...extractPersonClaims(panel.dialogue),
      ...extractDateClaims(panel.dialogue),
      ...extractNumberClaims(panel.dialogue),
      ...extractTermClaims(panel.dialogue),
      ...extractPlaceClaims(panel.dialogue),
      ...extractEventClaims(panel.dialogue),
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
