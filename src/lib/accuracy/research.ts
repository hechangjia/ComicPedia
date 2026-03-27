import type {
  AccuracyCoverageGap,
  AccuracyHardFact,
  AccuracySettings,
  AccuracySoftFact,
  AccuracySourceEntry,
  AccuracySourceTier,
  FactPack,
  ResearchBrief,
  WikipediaContent,
} from "@/lib/types";
import { getWikipediaSummary, searchWikipedia } from "@/lib/server/wikipedia";
import { resolveAccuracyProviders, getWhitelistDomains } from "@/lib/accuracy/providerRegistry";
import { searchWithProvider } from "@/lib/accuracy/providerClients";

const MAX_ANCHOR_SOURCES = 3;
const MAX_WHITELIST_SOURCES = 3;
const MAX_OPEN_WEB_SOURCES = 2;
const MAX_EXCERPT_CHARS = 800;
const PROVIDER_TIMEOUT_MS = 8000;
const RESEARCH_BUDGET_MS = 20000;
const PERSON_DEFINITION_REGEX = /^([^，。；！？（(]{1,24})(?:[（(][^）)]{1,40}[）)])?是[^。！？]{1,80}(?:家|者|人物|女神|学家|科学家|数学家|物理学家)/;
const PLACE_PATTERNS: Array<{ regex: RegExp; predicate: string }> = [
  { regex: /出生于\s*([^，。；！？]+)/g, predicate: "birth_place" },
  { regex: /(?:起源于|源于)\s*([^，。；！？]+)/g, predicate: "origin_place" },
  { regex: /发明于[^，。；！？]*?的([^，。；！？、]+)/g, predicate: "origin_place" },
  { regex: /位于\s*([^，。；！？]+)/g, predicate: "location" },
  { regex: /来自\s*([^，。；！？]+)/g, predicate: "origin_place" },
];
const EVENT_ATTRIBUTION_REGEX = /([^，。；！？]{2,40})由([^，。；！？]{1,24})提出/g;
const CENTURY_REGEX = /\b(\d{1,2})(?:st|nd|rd|th)\s+century\b|(\d{1,2})世纪/g;

export interface AccuracyResearchInput {
  topic: string;
  contentType?: string;
  accuracyConfig: AccuracySettings;
  wikipediaContent?: WikipediaContent;
  budgetMs?: number;
}

function detectWikiLang(topic: string, wikipediaContent?: WikipediaContent): string {
  if (wikipediaContent?.lang) return wikipediaContent.lang;
  return /^[\x00-\x7F]+$/.test(topic.trim()) ? "en" : "zh";
}

function buildSourceId(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`;
}

function normalizeValue(value: string): string {
  return value.trim().toLowerCase();
}

function isQuestionLikeTopic(topic: string): boolean {
  return /^(为什么会|为什么|为何会|为何|怎么会|怎么|什么是|什么叫)/.test(topic.trim());
}

function normalizeAnchorSearchQuery(topic: string): string {
  const trimmed = topic.trim();
  const stripped = trimmed
    .replace(/^(为什么会|为什么|为何会|为何|怎么会|怎么|什么是|什么叫)/, "")
    .replace(/[？?。！!]+$/g, "")
    .trim();

  if (stripped === "打雷") return "雷";
  if (stripped === "下雨") return "雨";
  return stripped || trimmed;
}

function resolveCanonicalFactSubject(topic: string, sourceEntries: AccuracySourceEntry[]): string {
  if (!isQuestionLikeTopic(topic)) return topic;
  const anchorTitle = sourceEntries.find((entry) => entry.sourceTier === "anchor")?.title?.trim();
  return anchorTitle || normalizeAnchorSearchQuery(topic);
}

function chooseBestWikipediaSearchTitle(topic: string, titles: string[]): string | null {
  if (titles.length === 0) return null;

  const normalizedQuery = normalizeAnchorSearchQuery(topic);
  const variants = [...new Set([
    normalizedQuery,
    normalizedQuery.replace(/^打/, ""),
    normalizedQuery.replace(/^下/, ""),
    topic.trim(),
  ].filter(Boolean))];

  let bestTitle = titles[0];
  let bestScore = Number.NEGATIVE_INFINITY;

  titles.forEach((title) => {
    let score = 0;
    variants.forEach((variant) => {
      if (title === variant) score += 100;
      else if (title.includes(variant)) score += 30;
      else if (variant.includes(title)) score += 20;
    });
    score -= title.length;
    if (score > bestScore) {
      bestScore = score;
      bestTitle = title;
    }
  });

  return bestTitle;
}

function cleanCapturedText(value: string): string {
  return value
    .trim()
    .replace(/^[“"'《〈（(]+/, "")
    .replace(/[”"'》〉。！？；，]+$/g, "")
    .replace(/^(?:并|又|也)/, "")
    .trim();
}

function splitEvidenceSentences(text: string): string[] {
  return (text.match(/[^。！？.!?]+[。！？.!?]?/g) || [text])
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function isLikelyNoisyPlace(value: string): boolean {
  return value.includes("、")
    || /的家$/.test(value)
    || /庙外$/.test(value)
    || /(祭祀|国家级|享受历朝历代皇帝尊奉)/.test(value);
}

function isLikelyWeakTermClause(value: string): boolean {
  return /(职业神|所祀奉|民间信仰中的神祇)/.test(value);
}

function extractAdditionalTermClauses(topic: string, excerpt: string): string[] {
  const clauses = new Set<string>();
  const normalizedTopic = topic.trim();
  const compactExcerpt = excerpt.replace(/\s+/g, " ").trim();

  const englishPatterns: Array<{ regex: RegExp; build: (match: RegExpExecArray) => string }> = [
    {
      regex: /\bto form (?:a |an )?([^.,;]+)/gi,
      build: (match) => `${normalizedTopic} forms ${cleanCapturedText(match[1])}`,
    },
    {
      regex: /\b(?:carries|carry|stores|store|contains|contain)\s+([^.;]+)/gi,
      build: (match) => `${normalizedTopic} carries ${cleanCapturedText(match[1])}`,
    },
  ];
  englishPatterns.forEach(({ regex, build }) => {
    for (const match of compactExcerpt.matchAll(regex)) {
      const clause = build(match);
      if (clause.length >= 12) clauses.add(clause);
    }
  });

  const chinesePatterns: Array<{ regex: RegExp; build: (match: RegExpExecArray) => string }> = [
    {
      regex: /形成([^，。；]+)/g,
      build: (match) => `${normalizedTopic}形成${cleanCapturedText(match[1])}`,
    },
    {
      regex: /由([^，。；]+)形成/g,
      build: (match) => `${normalizedTopic}由${cleanCapturedText(match[1])}形成`,
    },
    {
      regex: /(?:负责|用于|用来)([^，。；]+)/g,
      build: (match) => `${normalizedTopic}${cleanCapturedText(match[0])}`,
    },
    {
      regex: /成为([^，。；]+)/g,
      build: (match) => `${normalizedTopic}成为${cleanCapturedText(match[1])}`,
    },
    {
      regex: /(人首蛇身(?:（[^）]+）)?)/g,
      build: (match) => `${normalizedTopic}${cleanCapturedText(match[1])}`,
    },
    {
      regex: /携带([^，。；]+)/g,
      build: (match) => `${normalizedTopic}携带${cleanCapturedText(match[1])}`,
    },
    {
      regex: /(?:是|属于)([^，。；]*声波[^，。；]*)/g,
      build: (match) => `${normalizedTopic}是${cleanCapturedText(match[1])}`,
    },
  ];
  chinesePatterns.forEach(({ regex, build }) => {
    for (const match of excerpt.matchAll(regex)) {
      const clause = build(match);
      if (clause.length >= 6 && !isLikelyWeakTermClause(clause)) clauses.add(clause);
    }
  });

  return [...clauses];
}

function firstSentence(text: string): string {
  const sentence = text.match(/^[\s\S]*?[.!?。！？]/)?.[0] || text;
  return sentence.trim().slice(0, 240);
}

function collectDateEvidenceChunks(excerpt: string): string[] {
  const DATE_CONTEXT_REGEX = /(出生|生于|卒于|逝世|发表|发明|提出|记载|记录|首次|发现|实验|描述|出版|阐述)/;
  return splitEvidenceSentences(excerpt).filter((chunk, index) => index === 0 || DATE_CONTEXT_REGEX.test(chunk));
}

function trimExcerpt(excerpt: string): string {
  return excerpt.trim().slice(0, MAX_EXCERPT_CHARS);
}

function pushSourceEntry(
  sourceEntries: AccuracySourceEntry[],
  entry: Omit<AccuracySourceEntry, "id" | "excerpt" | "retrievedAt"> & { excerpt: string },
): void {
  const cap = entry.sourceTier === "anchor"
    ? MAX_ANCHOR_SOURCES
    : entry.sourceTier === "whitelist"
      ? MAX_WHITELIST_SOURCES
      : MAX_OPEN_WEB_SOURCES;
  const currentCount = sourceEntries.filter((item) => item.sourceTier === entry.sourceTier).length;
  if (currentCount >= cap) return;

  sourceEntries.push({
    ...entry,
    id: buildSourceId(entry.sourceTier, currentCount),
    excerpt: trimExcerpt(entry.excerpt),
    retrievedAt: new Date().toISOString(),
  });
}

function pushHardFact(
  facts: AccuracyHardFact[],
  seen: Set<string>,
  fact: Omit<AccuracyHardFact, "id">,
): void {
  const key = `${fact.claimType}:${normalizeValue(fact.normalizedValue || fact.object)}`;
  if (seen.has(key)) return;
  seen.add(key);
  facts.push({
    ...fact,
    id: `fact-${fact.claimType}-${facts.length + 1}`,
  });
}

function extractHardFacts(topic: string, sourceEntries: AccuracySourceEntry[]): AccuracyHardFact[] {
  const facts: AccuracyHardFact[] = [];
  const seen = new Set<string>();
  const factSubject = resolveCanonicalFactSubject(topic, sourceEntries);

  sourceEntries.forEach((entry) => {
    const definition = firstSentence(entry.excerpt);
    if (definition.length > 12) {
      pushHardFact(facts, seen, {
        claimType: "term",
        subject: factSubject,
        predicate: "definition",
        object: definition,
        normalizedValue: normalizeValue(definition),
        sourceIds: [entry.id],
        confidence: entry.sourceTier === "anchor" ? 0.92 : 0.7,
        mustPreserve: true,
      });
    }

    extractAdditionalTermClauses(factSubject, entry.excerpt).forEach((clause) => {
      pushHardFact(facts, seen, {
        claimType: "term",
        subject: factSubject,
        predicate: "property",
        object: clause,
        normalizedValue: normalizeValue(clause),
        sourceIds: [entry.id],
        confidence: entry.sourceTier === "anchor" ? 0.86 : 0.66,
        mustPreserve: true,
      });
    });

    const normalizedTopic = normalizeValue(factSubject);
    const personMatch = definition.match(PERSON_DEFINITION_REGEX);
    if (personMatch) {
      const canonicalPerson = cleanCapturedText(personMatch[1]);
      const normalizedPerson = normalizeValue(canonicalPerson);
      if (
        canonicalPerson
        && (normalizedPerson.includes(normalizedTopic) || normalizedTopic.includes(normalizedPerson))
      ) {
        pushHardFact(facts, seen, {
          claimType: "person",
          subject: factSubject,
          predicate: "name",
          object: canonicalPerson,
          normalizedValue: normalizedPerson,
          sourceIds: [entry.id],
          confidence: entry.sourceTier === "anchor" ? 0.9 : 0.68,
          mustPreserve: true,
        });
      }
    }

    PLACE_PATTERNS.forEach(({ regex, predicate }) => {
      Array.from(entry.excerpt.matchAll(regex)).forEach((match) => {
        const place = cleanCapturedText(match[1]);
        if (!place || /\d/.test(place) || isLikelyNoisyPlace(place)) return;
        pushHardFact(facts, seen, {
          claimType: "place",
          subject: factSubject,
          predicate,
          object: place,
          normalizedValue: normalizeValue(place),
          sourceIds: [entry.id],
          confidence: entry.sourceTier === "anchor" ? 0.88 : 0.64,
          mustPreserve: true,
        });
      });
    });

    Array.from(entry.excerpt.matchAll(EVENT_ATTRIBUTION_REGEX)).forEach((match) => {
      const eventSubject = cleanCapturedText(match[1]);
      const proposer = cleanCapturedText(match[2]);
      if (!eventSubject || !proposer) return;
      const eventText = `${eventSubject}由${proposer}提出`;
      pushHardFact(facts, seen, {
        claimType: "event",
        subject: eventSubject,
        predicate: "attribution",
        object: eventText,
        normalizedValue: normalizeValue(eventText),
        sourceIds: [entry.id],
        confidence: entry.sourceTier === "anchor" ? 0.88 : 0.64,
        mustPreserve: true,
      });
    });

    const dateEvidenceText = collectDateEvidenceChunks(entry.excerpt).join(" ");
    const years = Array.from(new Set(dateEvidenceText.match(/\b(1[0-9]{3}|20[0-9]{2})\b/g) || []));
    years.forEach((year) => {
      pushHardFact(facts, seen, {
        claimType: "date",
        subject: factSubject,
        predicate: "year",
        object: year,
        normalizedValue: year,
        sourceIds: [entry.id],
        confidence: entry.sourceTier === "anchor" ? 0.9 : 0.65,
        mustPreserve: true,
      });
    });

    Array.from(dateEvidenceText.matchAll(CENTURY_REGEX)).forEach((match) => {
      const century = match[2] ? `${match[2]}世纪` : `${match[1]} century`;
      pushHardFact(facts, seen, {
        claimType: "date",
        subject: factSubject,
        predicate: "century",
        object: century,
        normalizedValue: normalizeValue(century),
        sourceIds: [entry.id],
        confidence: entry.sourceTier === "anchor" ? 0.82 : 0.6,
        mustPreserve: true,
      });
    });
  });

  return facts;
}

function extractSoftFacts(sourceEntries: AccuracySourceEntry[]): AccuracySoftFact[] {
  return sourceEntries.slice(0, 3).map((entry, index) => ({
    id: `soft-${index + 1}`,
    summary: firstSentence(entry.excerpt),
    evidenceLevel: entry.sourceTier === "anchor" ? "strong" : entry.sourceTier === "whitelist" ? "medium" : "weak",
    sourceIds: [entry.id],
    rewriteFlexibility: entry.sourceTier === "anchor" ? "low" : "medium",
  }));
}

function deriveResearchBrief(factPack: FactPack): ResearchBrief {
  const sourceTiersUsed = Array.from(new Set(factPack.sourceEntries.map((entry) => entry.sourceTier))) as AccuracySourceTier[];
  const majorRisks = factPack.coverageGaps.map((gap) => gap.reason).slice(0, 3);
  const safeToGenerate = factPack.hardFacts.length > 0 && !factPack.coverageGaps.some((gap) => gap.severity !== "info");

  return {
    verifiedHardFactCount: factPack.hardFacts.length,
    sourceTiersUsed,
    majorRisks,
    safeToGenerate,
  };
}

function buildCoverageGap(question: string, reason: string, severity: AccuracyCoverageGap["severity"], missingType: AccuracyCoverageGap["missingType"]): AccuracyCoverageGap {
  return {
    question,
    reason,
    severity,
    missingType,
  };
}

function hasSufficientCoverage(hardFacts: AccuracyHardFact[]): boolean {
  return hardFacts.length >= 2;
}

export async function runAccuracyResearch(input: AccuracyResearchInput): Promise<{ factPack: FactPack; researchBrief: ResearchBrief }> {
  const startedAt = Date.now();
  const budgetMs = input.budgetMs ?? RESEARCH_BUDGET_MS;
  const sourceEntries: AccuracySourceEntry[] = [];
  const coverageGaps: AccuracyCoverageGap[] = [];

  const queryPlan = {
    hardFactQueries: [input.topic],
    softFactQueries: [`${input.topic} overview`],
    fallbackUsed: false,
  };

  const wikiLang = detectWikiLang(input.topic, input.wikipediaContent);

  if (input.wikipediaContent?.extract) {
    pushSourceEntry(sourceEntries, {
      url: `https://${wikiLang}.wikipedia.org/wiki/${encodeURIComponent(input.wikipediaContent.title.replace(/ /g, "_"))}`,
      domain: `${wikiLang}.wikipedia.org`,
      title: input.wikipediaContent.title,
      sourceTier: "anchor",
      retrievalMethod: "wikipedia",
      excerpt: input.wikipediaContent.extract,
      trustScore: 0.95,
    });
  } else {
    let summary = await getWikipediaSummary(input.topic, wikiLang);
    if (!summary) {
      const searchQuery = normalizeAnchorSearchQuery(input.topic);
      const searchResults = await searchWikipedia(searchQuery, wikiLang).catch(() => []);
      const bestTitle = chooseBestWikipediaSearchTitle(input.topic, searchResults.map((item) => item.title));
      if (bestTitle) {
        summary = await getWikipediaSummary(bestTitle, wikiLang).catch(() => null);
        if (summary) {
          queryPlan.fallbackUsed = true;
        }
      }
    }
    if (summary) {
      pushSourceEntry(sourceEntries, {
        url: summary.pageUrl,
        domain: new URL(summary.pageUrl).hostname,
        title: summary.title,
        sourceTier: "anchor",
        retrievalMethod: "wikipedia",
        excerpt: summary.extract,
        trustScore: 0.95,
      });
    } else {
      coverageGaps.push(buildCoverageGap(input.topic, "missing anchor summary", "warning", "source"));
    }
  }

  let hardFacts = extractHardFacts(input.topic, sourceEntries);

  const whitelistDomains = getWhitelistDomains(input.accuracyConfig);
  if (!hasSufficientCoverage(hardFacts) && whitelistDomains.length > 0) {
    if (Date.now() - startedAt >= budgetMs) {
      coverageGaps.push(buildCoverageGap(input.topic, "research budget exhausted before whitelist search", "warning", "budget"));
    } else {
      const searchProviders = resolveAccuracyProviders(input.accuracyConfig, "search");
      if (searchProviders.length === 0) {
        coverageGaps.push(buildCoverageGap(input.topic, "no search provider configured for whitelist expansion", "warning", "source"));
      } else {
        queryPlan.fallbackUsed = true;
        for (const provider of searchProviders) {
          const results = await searchWithProvider(provider, input.topic, {
            limit: MAX_WHITELIST_SOURCES + 2,
            timeoutMs: PROVIDER_TIMEOUT_MS,
          });

          results
            .filter((result) => whitelistDomains.some((domain) => result.domain === domain || result.domain.endsWith(`.${domain}`)))
            .forEach((result) => {
              pushSourceEntry(sourceEntries, {
                url: result.url,
                domain: result.domain,
                title: result.title,
                sourceTier: "whitelist",
                retrievalMethod: "search",
                providerId: provider.id,
                excerpt: result.excerpt,
                trustScore: 0.75,
              });
            });

          if (sourceEntries.filter((entry) => entry.sourceTier === "whitelist").length >= MAX_WHITELIST_SOURCES) {
            break;
          }
        }

        hardFacts = extractHardFacts(input.topic, sourceEntries);
      }
    }
  }

  if (!hasSufficientCoverage(hardFacts) && whitelistDomains.length === 0) {
    coverageGaps.push(buildCoverageGap(input.topic, "no whitelist domains configured", "info", "source"));
  }

  if (!hasSufficientCoverage(hardFacts) && Date.now() - startedAt < budgetMs) {
    const searchProviders = resolveAccuracyProviders(input.accuracyConfig, "search");
    if (searchProviders.length > 0) {
      queryPlan.fallbackUsed = true;
      const results = await searchWithProvider(searchProviders[0], input.topic, {
        limit: MAX_OPEN_WEB_SOURCES,
        timeoutMs: PROVIDER_TIMEOUT_MS,
      });
      results.slice(0, MAX_OPEN_WEB_SOURCES).forEach((result) => {
        pushSourceEntry(sourceEntries, {
          url: result.url,
          domain: result.domain,
          title: result.title,
          sourceTier: "open_web",
          retrievalMethod: "search",
          providerId: searchProviders[0].id,
          excerpt: result.excerpt,
          trustScore: 0.4,
        });
      });
      hardFacts = extractHardFacts(input.topic, sourceEntries);
    }
  } else if (!hasSufficientCoverage(hardFacts) && !coverageGaps.some((gap) => gap.missingType === "budget")) {
    coverageGaps.push(buildCoverageGap(input.topic, "research budget exhausted before open-web fallback", "warning", "budget"));
  }

  if (!hasSufficientCoverage(hardFacts)) {
    coverageGaps.push(buildCoverageGap(input.topic, "hard fact coverage is still thin after bounded retrieval", "warning", "hard_fact"));
  }

  const softFacts = extractSoftFacts(sourceEntries);
  const factPack: FactPack = {
    topic: input.topic,
    queryPlan,
    hardFacts,
    softFacts,
    sourceEntries,
    coverageGaps,
    confidenceSummary: {
      hardFactCoverage: hardFacts.length,
      softFactCoverage: softFacts.length,
      overallRisk: coverageGaps.some((gap) => gap.severity === "critical")
        ? "high"
        : coverageGaps.some((gap) => gap.severity === "warning")
          ? "medium"
          : "low",
    },
    recommendedNarrativeAngles: softFacts.map((fact) => fact.summary).slice(0, 3),
  };

  return {
    factPack,
    researchBrief: deriveResearchBrief(factPack),
  };
}
