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
const PLACE_REGEX = /(?:出生于|位于|来自|起源于|源于)\s*([^，。；！？]+)/g;
const EVENT_REGEX = /([^，。；！？]{2,80}由[^，。；！？]{2,20}提出)/g;
const PERSON_ROLE_REGEX = /([^，。；！？]{1,12})是[^，。；！？]{1,20}(?:家|者|学家)/g;
const PERSON_BIRTH_REGEX = /([^，。；！？]{1,12})出生于/g;
const PERSON_ATTRIBUTION_REGEX = /由([^，。；！？]{1,12})提出/g;
const GEOGRAPHIC_PLACE_SUFFIX_REGEX = /(国|省|郡|州|市|县|乡|镇|村|城|京|岛|洲|湾|海|洋|湖|山|河|谷|庄园|学院|教堂|宫|殿|寺|馆|大陆|半岛)$/;
const PERSON_HONORIFIC_REGEX = /\b(?:sir|prs|mp)\b|爵士/g;

function canonicalizeText(rawText: string): string {
  return rawText
    .trim()
    .toLowerCase()
    .replace(PERSON_HONORIFIC_REGEX, "")
    .replace(/[（(][^）)]{1,40}[）)]/g, "")
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
  if (claimType === "term") {
    return canonicalizeText(normalizeTermText(rawText));
  }
  return canonicalizeText(rawText);
}

function isLikelyNoisyPlaceClaim(rawText: string): boolean {
  const value = rawText.trim();
  if (!value) return true;
  if (/^[这此该同每本那其某]/.test(value)) return true;
  if (/(过程|反应|放电|云层|声波|空气|耳朵|细胞|细胞质|染色体|模板|通道|压力波)$/.test(value)) return true;
  if (/(之中|过程中|反应中)$/.test(value)) return true;
  if (/(中|里|内)$/.test(value) && !GEOGRAPHIC_PLACE_SUFFIX_REGEX.test(value)) return true;
  return false;
}

function isLikelyMetaTermClaim(rawText: string): boolean {
  return /^(?:最关键的一点|最重要的一点|关键是|重点是|更重要的是|真正重要的是|核心是)[:：，,]?/.test(rawText.trim())
    || /之一[:：，,]?是/.test(rawText.trim())
    || /最著名的突破[:：，,]?是/.test(rawText.trim())
    || /不过可以确定的是[:：，,]?/.test(rawText.trim())
    || /^(?:把它拆开看|先抓住核心|先分清两件事|最后记住两点|再看它在.*位置)[:：]/.test(rawText.trim())
    || /^(?:后世记住|人们记住).*?(?:不只是|更是)/.test(rawText.trim());
}

function isLikelyAliasIntroTermClaim(rawText: string): boolean {
  return /^(?:(?:这就是|这位就是|这叫|它就是|中文叫|又叫|也叫|叫做|全名叫|名字叫)[^。；！？]{1,80}|(?:先认识[^：]{0,20}[:：][^。；！？]{1,80}))$/.test(rawText.trim());
}

function isLikelyNoisyTermClaim(rawText: string): boolean {
  const value = rawText.trim();
  return isLikelyMetaTermClaim(value)
    || isLikelyAliasIntroTermClaim(value)
    || /(出生|生于|出生在|位于|来自|起源于|源于)/.test(value);
}

function normalizeTermText(rawText: string): string {
  let text = rawText.trim();
  const segments = text.split(/[，,:：；]/).map((item) => item.trim()).filter(Boolean);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (/(?:是|指)/.test(segments[index])) {
      text = segments[index];
      break;
    }
  }

  text = text
    .replace(/^(?:是因为|因为)(?:他|她|它|这|该|其)?(?:是|指|就是)/, "")
    .replace(/^(?:他|她|它|这|该|其)(?:就|也|正|仍|便)?(?:是|指|就是)/, "")
    .replace(/^(?:就是|是|指)/, "")
    .trim();

  if (/(dna|脱氧核糖核酸)/i.test(rawText) && /(双螺旋|double helix)/i.test(text)) {
    return "DNA forms double helix";
  }
  if (/(dna|脱氧核糖核酸)/i.test(rawText) && /(多核苷酸链|polynucleotide chains?)/i.test(text) && (/(聚合物|polymer)/i.test(text) || /组成的/.test(text))) {
    return "DNA is a polymer composed of two polynucleotide chains";
  }
  if (/(dna|脱氧核糖核酸)/i.test(rawText) && /(遗传指令|genetic instructions)/i.test(text)) {
    return "DNA carries genetic instructions";
  }

  return text || rawText.trim();
}

function buildTermClaim(rawText: string): AccuracyPanelClaim {
  return {
    claimType: "term" as const,
    rawText,
    normalizedValue: normalizeValue(rawText, "term"),
    matchStatus: "missing" as const,
  };
}

function extractSpecialScientificTermClaims(text: string): AccuracyPanelClaim[] {
  const claims: AccuracyPanelClaim[] = [];
  if (/(dna|脱氧核糖核酸)/i.test(text) && /(双螺旋|double helix)/i.test(text)) {
    claims.push(buildTermClaim("DNA双螺旋"));
  }
  if (/(dna|脱氧核糖核酸)/i.test(text) && /(遗传指令|genetic instructions)/i.test(text)) {
    claims.push(buildTermClaim("DNA遗传指令"));
  }
  return claims;
}

function isLikelyNoisyPersonClaim(rawText: string): boolean {
  const value = rawText.trim();
  if (!value) return true;
  if (/^(?:是因为|因为|所以|如果|就是|正是)/.test(value)) return true;
  if (/^(?:他|她|它|这|该|其)同时$/.test(value)) return true;
  if (/^(?:他|她|它|这|该|其|他们|她们|它们)$/.test(value)) return true;
  return false;
}

function matchesNormalizedText(factValue: string, claimValue: string, factPack: FactPack): boolean {
  const factNormalized = stripKnownPersonAliases(factValue, factPack);
  const claimNormalized = stripKnownPersonAliases(claimValue, factPack);
  if (!factNormalized || !claimNormalized) return false;
  return factNormalized === claimNormalized
    || factNormalized.includes(claimNormalized)
    || claimNormalized.includes(factNormalized);
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
      return matchesNormalizedText(
        normalizeValue(fact.normalizedValue || fact.object, "term"),
        claim.normalizedValue,
        factPack,
      );
    }

    if (claim.claimType === "event") {
      return matchesNormalizedText(
        normalizeValue(fact.normalizedValue || fact.object, "event"),
        claim.normalizedValue,
        factPack,
      );
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
    if (claim.claimType === "term") {
      return {
        ...claim,
        matchStatus: "missing",
      };
    }
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
  const years = new Set(text.match(YEAR_REGEX) || []);
  const mixedCalendarMatch = text.match(/儒略历[^0-9]*(\d{4})[\s\S]*?格里历[^0-9]*(\d{4})/);
  if (mixedCalendarMatch) {
    const julian = mixedCalendarMatch[1];
    const gregorian = mixedCalendarMatch[2];
    if (Math.abs(Number(gregorian) - Number(julian)) <= 1) {
      years.delete(julian);
      years.add(gregorian);
    }
  }

  return Array.from(years).map((rawText) => ({
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
  const baseClaims = Array.from(new Set(text.match(TERM_REGEX) || []))
    .filter((rawText) => !isLikelyNoisyTermClaim(rawText))
    .map((rawText) => buildTermClaim(rawText));

  const allClaims = [...baseClaims, ...extractSpecialScientificTermClaims(text)];
  const seen = new Set<string>();
  return allClaims.filter((claim) => {
    const key = claim.normalizedValue;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractPlaceClaims(text: string): AccuracyPanelClaim[] {
  return Array.from(new Set(
    Array.from(text.matchAll(PLACE_REGEX)).map((match) => match[1]),
  ))
    .filter((rawText) => !/\d/.test(rawText) && !isLikelyNoisyPlaceClaim(rawText))
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
    .filter((rawText) => rawText.length >= 2 && rawText.length <= 12 && !/\d/.test(rawText) && !isLikelyNoisyPersonClaim(rawText))
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
