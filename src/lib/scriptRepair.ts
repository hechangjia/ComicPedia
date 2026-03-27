/**
 * 脚本自修复 Agent：将 validateScript() 的结构化 warnings 反馈给 LLM，
 * 要求修正脚本中的质量问题。由 taskLifecycle 在脚本生成后自动调用。
 */

import { ComicScript, PartialLLMConfig } from "./types";
import { ScriptValidationContext, ScriptWarning } from "./scriptValidator";
import { callLLM } from "./llm";

/**
 * 构建修复提示词：将脚本 + 结构化 warnings 翻译为 LLM 可理解的修复指令。
 */
function buildRepairPrompt(
  script: ComicScript,
  warnings: ScriptWarning[],
  context?: ScriptValidationContext,
): string {
  const panelsJSON = script.panels.map((p) => ({
    id: p.id,
    scene: p.scene,
    dialogue: p.dialogue,
    imagePrompt: p.imagePrompt,
  }));

  const issueList = warnings.map((w, i) => {
    const panelRefs = w.panelIndices.length > 0
      ? ` (panels: ${w.panelIndices.map(idx => idx + 1).join(", ")})`
      : "";
    return `${i + 1}. [${w.severity}] ${w.dimension}${panelRefs}: ${w.message}\n   Fix: ${w.suggestion}`;
  }).join("\n");

  const hasLocalizedWarnings = warnings.every((warning) => warning.panelIndices.length > 0);
  const narrativeContext = context?.narrativeOutline
    ? `
## Narrative Beat Plan Context
contentType: ${context.contentType ?? "unknown"}
templateType: ${context.narrativeOutline.templateType}
source: ${context.narrativeOutline.source ?? "unknown"}
${context.narrativeOutline.panels.map((panel, index) =>
  `Panel ${index + 1}: beatRole=${panel.beatRole}, shotIntent=${panel.shotIntent}, knowledgeGoal=${panel.knowledgeGoal}, carryForward=${panel.carryForward}`
).join("\n")}
`
    : "";

  return `You are a comic script quality editor. Fix the issues in the following script.

## Script
Title: ${script.title}
Topic: ${script.topic}
Style: ${script.style}${script.characterDescription ? `\nCharacter: ${script.characterDescription}` : ""}

## Panels
${JSON.stringify(panelsJSON, null, 2)}

## Issues to Fix
${issueList}
${narrativeContext}

## Rules
1. Fix ALL listed issues
2. Keep exactly ${script.panels.length} panels with the same IDs
3. Preserve the original story, topic, and style
4. Only modify fields needed to fix the issues (scene, dialogue, imagePrompt)
5. imagePrompt MUST be in English only (no Chinese/Japanese/Korean characters)
6. Each panel's imagePrompt should use different camera angles/compositions
7. Character descriptions in imagePrompt must use consistent [Name: description] tags across all panels
8. Validator findings take precedence over the original beat plan for the affected repair pass, but preserve the higher-level rhythm intent where possible
9. Only rewrite the affected panels when warnings are localized${hasLocalizedWarnings ? "" : " and limit collateral changes as much as possible"}
10. Preserve unaffected panels unless a listed issue clearly requires a broader rewrite

Output ONLY a JSON object with this exact format, no other text:
{
  "title": "${script.title}",
  "topic": "${script.topic}",
  "style": "${script.style}",
  "panels": [
    {"id": 1, "scene": "...", "dialogue": "...", "imagePrompt": "..."},
    ...
  ]
}`;
}

/**
 * 调用 LLM 修复脚本质量问题。
 * 返回修复后的 ComicScript，失败返回 null（非致命）。
 */
export async function repairScript(
  script: ComicScript,
  warnings: ScriptWarning[],
  llmConfig?: PartialLLMConfig,
  context?: ScriptValidationContext,
): Promise<ComicScript | null> {
  if (warnings.length === 0) return null;

  const prompt = buildRepairPrompt(script, warnings, context);

  try {
    const response = await callLLM(prompt, llmConfig);

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[ScriptRepair] No JSON found in LLM response");
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.panels || !Array.isArray(parsed.panels)) {
      console.warn("[ScriptRepair] Invalid panels in response");
      return null;
    }

    // Panel count must match — reject otherwise to avoid data loss
    if (parsed.panels.length !== script.panels.length) {
      console.warn(`[ScriptRepair] Panel count mismatch: ${parsed.panels.length} vs ${script.panels.length}`);
      return null;
    }

    // Merge repaired panels back into original script (preserving imageUrl, status, versions etc)
    const repairedScript: ComicScript = {
      ...script,
      panels: parsed.panels.map((p: Record<string, unknown>, i: number) => ({
        ...script.panels[i],
        scene: String(p.scene ?? script.panels[i].scene),
        dialogue: String(p.dialogue ?? script.panels[i].dialogue),
        imagePrompt: String(p.imagePrompt ?? script.panels[i].imagePrompt),
        status: "pending" as const,
      })),
    };

    return repairedScript;
  } catch (err) {
    console.error("[ScriptRepair] Repair failed:", err);
    return null;
  }
}
