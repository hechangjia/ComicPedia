import type { AccuracyReviewResult, ComicScript, FactPack, PartialLLMConfig } from "@/lib/types";
import { callLLM } from "@/lib/llm";

function buildRepairPrompt(script: ComicScript, review: AccuracyReviewResult, factPack: FactPack): string {
  const issues = review.panelClaims
    .flatMap((panel) => panel.hardClaims
      .filter((claim) => claim.matchStatus !== "matched")
      .map((claim) => `Panel ${panel.panelIndex + 1}: ${claim.claimType} "${claim.rawText}" -> ${claim.matchStatus} (matchedFactId=${claim.matchedFactId || "none"})`))
    .join("\n");

  const facts = factPack.hardFacts
    .map((fact) => `- [${fact.id}] ${fact.claimType}: ${fact.object}`)
    .join("\n");

  return `You are a factual repair editor for an educational comic script.

## Canonical Facts
${facts}

## Issues
${issues}

## Script
${JSON.stringify(script.panels.map((panel) => ({
  id: panel.id,
  scene: panel.scene,
  dialogue: panel.dialogue,
  imagePrompt: panel.imagePrompt,
})), null, 2)}

## Rules
1. Keep exactly ${script.panels.length} panels with the same IDs.
2. Only repair the factual issues listed above.
3. Replace wrong hard facts with canonical fact values.
4. Leave unaffected panels unchanged.
5. Output ONLY JSON: { "panels": [...] }`;
}

export async function repairAccuracyIssues(
  script: ComicScript,
  review: AccuracyReviewResult,
  factPack: FactPack,
  llmConfig?: PartialLLMConfig,
): Promise<ComicScript | null> {
  if (review.status !== "repair_required") return null;

  try {
    const response = await callLLM(buildRepairPrompt(script, review, factPack), llmConfig);
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]) as { panels?: Array<Record<string, unknown>> };
    if (!Array.isArray(parsed.panels) || parsed.panels.length !== script.panels.length) {
      return null;
    }

    return {
      ...script,
      panels: parsed.panels.map((panel, index) => ({
        ...script.panels[index],
        scene: String(panel.scene ?? script.panels[index].scene),
        dialogue: String(panel.dialogue ?? script.panels[index].dialogue),
        imagePrompt: String(panel.imagePrompt ?? script.panels[index].imagePrompt),
      })),
    };
  } catch {
    return null;
  }
}
