import {
  AccuracyReviewResult,
  ComicScript,
  ComicStyle,
  GenerationQuality,
  PartialLLMConfig,
  UserAPIConfigV2,
  WikipediaContent,
} from "@/lib/types";
import { QUALITY_PRESETS } from "@/lib/config/quality";
import { runAccuracyResearch } from "@/lib/accuracy/research";
import { reviewPanelClaims } from "@/lib/accuracy/claimReview";
import { repairAccuracyIssues } from "@/lib/accuracy/repair";
import { getWikipediaSummary } from "@/lib/server/wikipedia";
import { generateScript, generateTopicResearch, buildEnhancedTopicFromResearch } from "@/lib/llm";
import { generateNarrativeOutline } from "@/lib/director";
import { validateScript, applyCanonicalCharacterDesc } from "@/lib/scriptValidator";
import { repairScript } from "@/lib/scriptRepair";
import { stripDisallowedGuideCharacterFromScript } from "@/lib/guideCharacterPolicy";

export interface AccuracyGoldenTopicSmokeCase {
  id: string;
  topic: string;
  contentType: "science" | "wikipedia";
  style: ComicStyle;
  quality: GenerationQuality;
  panelCount?: number;
  wikipediaTitle?: string;
  wikipediaLang?: string;
  allowGuideCharacter?: boolean;
}

export interface AccuracyGoldenTopicSmokeResult {
  smokeCase: AccuracyGoldenTopicSmokeCase;
  topicResearch?: {
    expandedDescription: string;
    keyFactCount: number;
  };
  wikipediaContent?: WikipediaContent;
  wikipediaFallbackUsed: boolean;
  safeToGenerate: boolean;
  verifiedHardFactCount: number;
  hardFactCount: number;
  hardFactsSummary: Array<{
    claimType: string;
    object: string;
    normalizedValue: string;
  }>;
  softFactCount: number;
  sourceTierSummary: AccuracyReviewResult["sourceCoverage"];
  outlineGenerated: boolean;
  validationWarningCount: number;
  scriptRepairRounds: number;
  accuracyReview: AccuracyReviewResult;
  finalStatus: "script_ready" | "failed";
  script: ComicScript;
}

export interface AccuracyGoldenTopicSmokeReportEntry {
  id: string;
  topic: string;
  contentType: AccuracyGoldenTopicSmokeCase["contentType"];
  wikipediaFallbackUsed: boolean;
  safeToGenerate: boolean;
  verifiedHardFactCount: number;
  hardFactCount: number;
  hardFactsSummary: AccuracyGoldenTopicSmokeResult["hardFactsSummary"];
  softFactCount: number;
  outlineGenerated: boolean;
  validationWarningCount: number;
  scriptRepairRounds: number;
  reviewStatus: AccuracyReviewResult["status"];
  blockingIssueCount: number;
  repairableIssueCount: number;
  blockingPanels: AccuracyReviewResult["panels"];
  finalStatus: AccuracyGoldenTopicSmokeResult["finalStatus"];
  sourceTierSummary: AccuracyGoldenTopicSmokeResult["sourceTierSummary"];
  title: string;
  panelCount: number;
  extractPreview?: string;
  panelDialogues: Array<{
    panelIndex: number;
    dialogue: string;
  }>;
  panelDiagnostics: Array<{
    panelIndex: number;
    dialogue: string;
    riskLevel: AccuracyReviewResult["panelClaims"][number]["riskLevel"];
    hardClaimCount: number;
    unsupportedClaims: AccuracyReviewResult["panelClaims"][number]["unsupportedClaims"];
  }>;
  topUnsupportedClaims: Array<AccuracyReviewResult["panelClaims"][number]["unsupportedClaims"][number] & {
    panelIndex: number;
  }>;
}

const GOLDEN_TOPIC_SMOKE_CASES: AccuracyGoldenTopicSmokeCase[] = [
  {
    id: "nuwa",
    topic: "女娲",
    contentType: "wikipedia",
    style: "inkwash",
    quality: "fast",
    panelCount: 4,
    wikipediaTitle: "女娲",
    wikipediaLang: "zh",
    allowGuideCharacter: false,
  },
  {
    id: "dna",
    topic: "DNA",
    contentType: "wikipedia",
    style: "infographic",
    quality: "fast",
    panelCount: 4,
    wikipediaTitle: "DNA",
    wikipediaLang: "en",
    allowGuideCharacter: false,
  },
  {
    id: "newton",
    topic: "牛顿",
    contentType: "wikipedia",
    style: "flat",
    quality: "fast",
    panelCount: 4,
    wikipediaTitle: "艾萨克·牛顿",
    wikipediaLang: "zh",
    allowGuideCharacter: false,
  },
  {
    id: "gunpowder",
    topic: "火药",
    contentType: "wikipedia",
    style: "flat",
    quality: "fast",
    panelCount: 4,
    wikipediaTitle: "火药",
    wikipediaLang: "zh",
    allowGuideCharacter: false,
  },
  {
    id: "thunder",
    topic: "为什么会打雷",
    contentType: "science",
    style: "flat",
    quality: "fast",
    panelCount: 4,
    wikipediaTitle: "雷",
    wikipediaLang: "zh",
    allowGuideCharacter: false,
  },
];

const WIKIPEDIA_FALLBACK_CONTENT: Record<string, WikipediaContent> = {
  nuwa: {
    title: "女娲",
    extract: "女娲是中国上古神话中的创世女神，常见传说包括抟土造人和炼石补天。她在中国神话中常被视为创造与拯救人类秩序的重要神祇。",
    lang: "zh",
    sections: ["神话地位", "造人传说", "补天传说"],
  },
  dna: {
    title: "DNA",
    extract: "DNA, or deoxyribonucleic acid, is the hereditary material in almost all known living organisms. It stores genetic instructions and its double helix structure was described in 1953 by James Watson and Francis Crick based on key evidence including Rosalind Franklin's data.",
    lang: "en",
    sections: ["Structure", "History", "Function"],
  },
  newton: {
    title: "艾萨克·牛顿",
    extract: "艾萨克·牛顿是英国物理学家、数学家和天文学家，出生于英国林肯郡伍尔索普庄园。他系统阐述了经典力学并提出万有引力理论，对近代科学影响深远。",
    lang: "zh",
    sections: ["生平", "科学贡献", "影响"],
  },
  gunpowder: {
    title: "火药",
    extract: "火药是中国古代发明的混合炸药，通常由硝石、硫黄和木炭组成。它起源于中国，并深刻影响了军事、工程和火器技术的发展。",
    lang: "zh",
    sections: ["组成", "历史", "传播与影响"],
  },
  thunder: {
    title: "雷",
    extract: "雷（thunder）古代亦写作“靁”，因雷云内部电荷分布不平均，产生高电位形成的带电云层，是静电释放的反应，因光热使空气迅速膨胀所产生的自然现象。",
    lang: "zh",
    sections: ["机制"],
  },
};

export function getAccuracyGoldenTopicSmokeCases(): AccuracyGoldenTopicSmokeCase[] {
  return GOLDEN_TOPIC_SMOKE_CASES.map((item) => ({ ...item }));
}

export function resolveAccuracySmokeLlmConfig(
  config: UserAPIConfigV2,
  preferredLlmId?: string,
): PartialLLMConfig {
  const preferredConfig = preferredLlmId
    ? config.llmConfigs.find((item) => item.id === preferredLlmId)
    : undefined;
  const activeConfig = config.llmConfigs.find((item) => item.id === config.activeLLMId);
  const candidate = preferredConfig ?? activeConfig ?? config.llmConfigs[0];
  if (!candidate) {
    throw new Error("LLM smoke run requires at least one configured LLM profile");
  }

  return {
    apiUrl: candidate.apiUrl,
    apiKey: candidate.apiKey,
    model: candidate.model,
    provider: candidate.protocolType,
  };
}

async function retryWikipediaSummary(title: string, lang: string): Promise<WikipediaContent | null> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 1; attempt += 1) {
    try {
      const summary = await getWikipediaSummary(title, lang);
      if (!summary) return null;
      return {
        title: summary.title,
        extract: summary.extract,
        sections: summary.sections,
        thumbnail: summary.thumbnail?.source,
        hasLatex: summary.hasLatex,
        lang,
      };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    console.warn(`[AccuracySmoke] Wikipedia summary fallback for ${title} (${lang}):`, lastError);
  }
  return null;
}

export async function loadSmokeWikipediaContent(
  smokeCase: AccuracyGoldenTopicSmokeCase,
): Promise<{ content?: WikipediaContent; usedFallback: boolean }> {
  const shouldPreloadAnchor = smokeCase.contentType === "wikipedia" || !!smokeCase.wikipediaTitle;
  if (!shouldPreloadAnchor) {
    return { content: undefined, usedFallback: false };
  }

  const title = smokeCase.wikipediaTitle ?? smokeCase.topic;
  const lang = smokeCase.wikipediaLang ?? (/^[\x00-\x7F]+$/.test(title) ? "en" : "zh");
  const liveContent = await retryWikipediaSummary(title, lang);
  if (liveContent) {
    return { content: liveContent, usedFallback: false };
  }

  const fallbackContent = WIKIPEDIA_FALLBACK_CONTENT[smokeCase.id];
  if (!fallbackContent) {
    throw new Error(`Wikipedia summary not found for ${title} (${lang}) and no smoke fallback exists`);
  }

  return { content: fallbackContent, usedFallback: true };
}

export async function runAccuracyGoldenTopicSmokeCase(input: {
  smokeCase: AccuracyGoldenTopicSmokeCase;
  llmConfig: PartialLLMConfig;
  accuracyConfig: UserAPIConfigV2["accuracyConfig"];
}): Promise<AccuracyGoldenTopicSmokeResult> {
  const { smokeCase, llmConfig, accuracyConfig } = input;
  const qualityPreset = QUALITY_PRESETS[smokeCase.quality];
  const allowGuideCharacter = smokeCase.allowGuideCharacter ?? false;
  const { content: wikipediaContent, usedFallback: wikipediaFallbackUsed } = await loadSmokeWikipediaContent(smokeCase);

  let enhancedTopic = smokeCase.topic;
  let topicResearch: AccuracyGoldenTopicSmokeResult["topicResearch"];

  if (smokeCase.contentType === "science" && smokeCase.quality !== "fast") {
    const research = await generateTopicResearch(smokeCase.topic, llmConfig);
    enhancedTopic = buildEnhancedTopicFromResearch(research);
    topicResearch = {
      expandedDescription: research.expandedDescription,
      keyFactCount: research.keyFacts.length,
    };
  }

  const { factPack, researchBrief } = await runAccuracyResearch({
    topic: smokeCase.topic,
    contentType: smokeCase.contentType,
    accuracyConfig,
    wikipediaContent,
  });

  const outline = smokeCase.quality === "standard" || smokeCase.quality === "fine"
    ? await generateNarrativeOutline(
        enhancedTopic,
        smokeCase.style,
        smokeCase.panelCount,
        llmConfig,
        smokeCase.contentType,
        topicResearch?.expandedDescription,
      )
    : null;

  const finalTopic = qualityPreset.promptHint
    ? `${enhancedTopic}\n\n[Generation quality requirement: ${qualityPreset.promptHint}]`
    : enhancedTopic;

  let script = await generateScript(
    finalTopic,
    smokeCase.style,
    smokeCase.panelCount,
    llmConfig,
    smokeCase.contentType,
    undefined,
    undefined,
    undefined,
    undefined,
    wikipediaContent,
    allowGuideCharacter,
    outline ?? undefined,
    factPack,
  );

  if (!allowGuideCharacter) {
    script = stripDisallowedGuideCharacterFromScript(script);
  }

  const validation = validateScript(script, {
    contentType: smokeCase.contentType,
    narrativeOutline: outline ?? undefined,
  });
  let scriptRepairRounds = 0;
  if (smokeCase.quality !== "fast") {
    let currentWarnings = validation.warnings.filter((item) => item.severity === "critical" || item.severity === "warning");
    while (currentWarnings.length > 0 && scriptRepairRounds < 2) {
      scriptRepairRounds += 1;
      const repaired = await repairScript(script, currentWarnings, llmConfig, {
        contentType: smokeCase.contentType,
        narrativeOutline: outline ?? undefined,
      });
      if (!repaired) break;

      script = repaired;
      const nextValidation = validateScript(script, {
        contentType: smokeCase.contentType,
        narrativeOutline: outline ?? undefined,
      });
      currentWarnings = nextValidation.warnings.filter((item) => item.severity === "critical" || item.severity === "warning");
    }
  }

  applyCanonicalCharacterDesc(script);

  let accuracyReview = reviewPanelClaims(script, factPack);
  let accuracyRepairRounds = 0;
  while (accuracyReview.status === "repair_required" && accuracyRepairRounds < 2) {
    accuracyRepairRounds += 1;
    const repaired = await repairAccuracyIssues(script, accuracyReview, factPack, llmConfig);
    if (!repaired) break;
    script = repaired;
    accuracyReview = reviewPanelClaims(script, factPack);
  }

  return {
    smokeCase,
    topicResearch,
    wikipediaContent,
    wikipediaFallbackUsed,
    safeToGenerate: researchBrief.safeToGenerate,
    verifiedHardFactCount: researchBrief.verifiedHardFactCount,
    hardFactCount: factPack.hardFacts.length,
    hardFactsSummary: factPack.hardFacts.map((fact) => ({
      claimType: fact.claimType,
      object: fact.object,
      normalizedValue: fact.normalizedValue,
    })),
    softFactCount: factPack.softFacts.length,
    sourceTierSummary: accuracyReview.sourceCoverage,
    outlineGenerated: !!outline,
    validationWarningCount: validation.warnings.length,
    scriptRepairRounds,
    accuracyReview: {
      ...accuracyReview,
    },
    finalStatus: accuracyReview.status === "blocked" || !researchBrief.safeToGenerate ? "failed" : "script_ready",
    script,
  };
}

export function buildAccuracyGoldenTopicSmokeReportEntry(
  result: AccuracyGoldenTopicSmokeResult,
): AccuracyGoldenTopicSmokeReportEntry {
  const panelDialogues = result.script.panels.map((panel, index) => ({
    panelIndex: index,
    dialogue: panel.dialogue,
  }));

  const panelDiagnostics = result.accuracyReview.panelClaims.map((panel) => ({
    panelIndex: panel.panelIndex,
    dialogue: result.script.panels[panel.panelIndex]?.dialogue ?? "",
    riskLevel: panel.riskLevel,
    hardClaimCount: panel.hardClaims.length,
    unsupportedClaims: panel.unsupportedClaims.map((claim) => ({ ...claim })),
  }));

  const topUnsupportedClaims = result.accuracyReview.panelClaims.flatMap((panel) =>
    panel.unsupportedClaims.map((claim) => ({
      panelIndex: panel.panelIndex,
      ...claim,
    })),
  );

  return {
    id: result.smokeCase.id,
    topic: result.smokeCase.topic,
    contentType: result.smokeCase.contentType,
    wikipediaFallbackUsed: result.wikipediaFallbackUsed,
    safeToGenerate: result.safeToGenerate,
    verifiedHardFactCount: result.verifiedHardFactCount,
    hardFactCount: result.hardFactCount,
    hardFactsSummary: result.hardFactsSummary,
    softFactCount: result.softFactCount,
    outlineGenerated: result.outlineGenerated,
    validationWarningCount: result.validationWarningCount,
    scriptRepairRounds: result.scriptRepairRounds,
    reviewStatus: result.accuracyReview.status,
    blockingIssueCount: result.accuracyReview.blockingIssueCount,
    repairableIssueCount: result.accuracyReview.repairableIssueCount,
    blockingPanels: result.accuracyReview.panels,
    finalStatus: result.finalStatus,
    sourceTierSummary: result.sourceTierSummary,
    title: result.script.title,
    panelCount: result.script.panels.length,
    extractPreview: result.wikipediaContent?.extract.slice(0, 240),
    panelDialogues,
    panelDiagnostics,
    topUnsupportedClaims,
  };
}
