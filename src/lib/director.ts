/**
 * Director Agent：在脚本生成前生成叙事大纲（蓝图）。
 * 轻量级 LLM 调用，输出结构化 JSON，指导后续脚本生成器。
 *
 * 设计原则：
 * - 不拆分脚本生成（保持整体性），而是用大纲约束创作方向
 * - 输出 token 极少（~300 token JSON），成本远低于额外的 Sub-Agent
 * - 大纲可展示给用户审查，在脚本生成前即可调整方向
 */

import {
  NarrativeOutline,
  NarrativeTemplateType,
  NarrativeBeatRole,
  NarrativeShotIntent,
  PartialLLMConfig,
  ComicStyle,
  ContentType,
} from "./types";
import { callLLM } from "./llm";
import { STYLE_META } from "./config/styles";

const VALID_TEMPLATE_TYPES = new Set<NarrativeTemplateType>(["mechanism", "mythic", "historical", "discovery"]);
const VALID_BEAT_ROLES = new Set<NarrativeBeatRole>(["hook", "conflict", "reveal", "progression", "closure"]);
const VALID_SHOT_INTENTS = new Set<NarrativeShotIntent>(["establish", "hook-closeup", "contrast", "process", "reveal", "aftermath"]);

function inferNarrativeTemplate(
  contentType?: ContentType,
  topic?: string,
  researchContext?: string,
): NarrativeTemplateType {
  const haystack = `${topic ?? ""}\n${researchContext ?? ""}`.toLowerCase();

  if (contentType === "wikipedia" || /盘古|女娲|神话|创世|传说/.test(haystack)) {
    if (/盘古|女娲|神话|创世|传说/.test(haystack)) return "mythic";
  }

  if (/牛顿|达尔文|张衡|爱因斯坦|科学家|发明者|发现|研究者/.test(haystack)) {
    return "discovery";
  }

  if (/战争|发明|登月|印刷术|火药|事件|文明|革命|历史/.test(haystack)) {
    return "historical";
  }

  return "mechanism";
}

/**
 * 构建导演大纲生成 prompt。
 * 输入：研究结果 + 风格 + 面板数。
 * 输出：结构化叙事蓝图。
 */
function buildDirectorPrompt(
  topic: string,
  style: ComicStyle,
  panelCount: number | undefined,
  contentType?: ContentType,
  researchContext?: string,
): string {
  const styleMeta = STYLE_META[style] ?? STYLE_META.anime;
  const targetPanels = panelCount && panelCount > 0 ? panelCount : 8;

  const contentTypeHint = getContentTypeHint(contentType);
  const inferredTemplate = inferNarrativeTemplate(contentType, topic, researchContext);

  return `You are an expert comic director / storyboard planner. Create a narrative outline (blueprint) for a ${targetPanels}-panel comic.

## Topic
${topic}

${researchContext ? `## Research Context\n${researchContext}\n` : ""}
## Content Type
${contentTypeHint}

## Visual Style
${style} — ${styleMeta.description}

## Task
Design a structured narrative outline. This outline will guide a script writer to produce the final comic script. You do NOT write dialogue or imagePrompts — only the structural blueprint.

## Panel Count
Target: ${targetPanels} panels (${panelCount ? "user specified" : "auto, may adjust ±2"})

## Target Narrative Template
Use "${inferredTemplate}" as the default template unless the topic clearly demands a better fit.

Available internal templates:
- mechanism
- mythic
- historical
- discovery

## Rules
1. Each panel must have a clear narrative function (opening/setup/development/climax/resolution/epilogue)
2. Each panel must also define a beatRole: hook / conflict / reveal / progression / closure
3. Each panel must define a shotIntent: establish / hook-closeup / contrast / process / reveal / aftermath
4. Information density should follow a curve: low → medium → high → medium → low (like a well-paced lecture)
5. Camera compositions must vary — never repeat the same type consecutively
6. The comic must contain at least one strong hook-closeup or contrast panel
7. The final panel should usually end on reveal or aftermath rather than another flat explanation shot
8. If characters are needed, list them with their narrative role and first appearance panel
9. narrativeArc: describe the overall story arc in one sentence
10. infoDistribution: describe how knowledge/information is spread across panels
11. For 4 panels, compress middle progression. For 6-8 panels, expand progression and aftermath rather than adding more opening exposition.

## Output
Return ONLY this JSON structure, no other text:
{
  "totalPanels": ${targetPanels},
  "templateType": "${inferredTemplate}",
  "source": "beat-plan",
  "narrativeArc": "one sentence describing the story arc",
  "infoDistribution": "e.g. progressive, front-loaded, spiral, sandwich",
  "characterList": [
    {"name": "Character Name", "role": "protagonist/narrator/expert/mascot", "firstAppearance": 1}
  ],
  "panels": [
    {
      "narrativeFunction": "opening",
      "beatRole": "hook",
      "suggestedComposition": "wide shot / close-up / medium shot / bird's-eye / low angle / over-shoulder / dynamic",
      "shotIntent": "hook-closeup",
      "characters": ["Character Name"],
      "keyInfo": "what knowledge/story point this panel should convey (1 sentence, Chinese)",
      "knowledgeGoal": "what the reader should understand after this panel (Chinese)",
      "infoDensity": "low",
      "intensity": "high",
      "carryForward": "what question or suspense this panel pushes into the next panel (Chinese)"
    }
  ]
}

JSON only. All keyInfo in Simplified Chinese. Character names in English.`;
}

/** 根据内容类型提供叙事方向提示 */
function getContentTypeHint(contentType?: ContentType): string {
  const hints: Record<string, string> = {
    science: "硬核科普：需要将复杂概念拆分为递进步骤，先具象后抽象，每格传递实质性知识点",
    poetry: "诗词意境：画面应捕捉诗词的意象和情感，叙事以诗句为轴展开",
    novel: "小说场景：聚焦戏剧冲突和人物情感，画面呈现关键情节转折",
    xiaohongshu: "小红书图文：Hook → 铺垫 → 核心干货 → CTA，每张独立成卡片",
    wikipedia: "百科知识：基于权威来源，兼顾准确性和趣味性，适合信息图+叙事混合",
  };
  return hints[contentType || "science"] || hints.science;
}

/**
 * 生成叙事大纲。
 * 失败返回 null（非致命，脚本生成可不依赖大纲）。
 */
export async function generateNarrativeOutline(
  topic: string,
  style: ComicStyle,
  panelCount: number | undefined,
  llmConfig?: PartialLLMConfig,
  contentType?: ContentType,
  researchContext?: string,
): Promise<NarrativeOutline | null> {
  const prompt = buildDirectorPrompt(topic, style, panelCount, contentType, researchContext);

  try {
    const response = await callLLM(prompt, llmConfig);
    return parseOutlineResponse(response, panelCount);
  } catch (err) {
    console.error("[Director] Outline generation failed:", err);
    return null;
  }
}

/** 解析导演大纲 JSON */
function parseOutlineResponse(
  response: string,
  fallbackPanelCount?: number,
): NarrativeOutline | null {
  try {
    const cleaned = response.trim().replace(/^```json?\s*/, "").replace(/\s*```$/, "");
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.panels || !Array.isArray(parsed.panels) || parsed.panels.length === 0) {
      return null;
    }

    const validFunctions = new Set(["opening", "setup", "development", "climax", "resolution", "epilogue"]);
    const validDensities = new Set(["low", "medium", "high"]);
    const templateType = VALID_TEMPLATE_TYPES.has(parsed.templateType as NarrativeTemplateType)
      ? parsed.templateType as NarrativeTemplateType
      : inferNarrativeTemplate(undefined, undefined, undefined);

    const panels = parsed.panels.map((p: Record<string, unknown>) => ({
      narrativeFunction: validFunctions.has(p.narrativeFunction as string)
        ? p.narrativeFunction as string
        : "development",
      beatRole: VALID_BEAT_ROLES.has(p.beatRole as NarrativeBeatRole)
        ? p.beatRole as NarrativeBeatRole
        : "progression",
      suggestedComposition: String(p.suggestedComposition || "medium shot"),
      shotIntent: VALID_SHOT_INTENTS.has(p.shotIntent as NarrativeShotIntent)
        ? p.shotIntent as NarrativeShotIntent
        : "process",
      characters: Array.isArray(p.characters) ? p.characters.map(String) : [],
      keyInfo: String(p.keyInfo || ""),
      knowledgeGoal: String(p.knowledgeGoal || p.keyInfo || ""),
      infoDensity: validDensities.has(p.infoDensity as string)
        ? p.infoDensity as string
        : "medium",
      intensity: validDensities.has(p.intensity as string)
        ? p.intensity as "low" | "medium" | "high"
        : "medium",
      carryForward: String(p.carryForward || ""),
    }));

    const characterList = Array.isArray(parsed.characterList)
      ? parsed.characterList.map((c: Record<string, unknown>) => ({
          name: String(c.name || ""),
          role: String(c.role || ""),
          firstAppearance: Number(c.firstAppearance) || 1,
        }))
      : [];

    return {
      totalPanels: Number(parsed.totalPanels) || fallbackPanelCount || panels.length,
      templateType,
      source: parsed.source === "legacy" ? "legacy" : "beat-plan",
      panels,
      characterList,
      infoDistribution: String(parsed.infoDistribution || "progressive"),
      narrativeArc: String(parsed.narrativeArc || ""),
    };
  } catch (err) {
    console.warn("[Director] Failed to parse outline JSON:", err);
    return null;
  }
}

/**
 * 将大纲转换为脚本 prompt 的结构化指导文本。
 * 注入到 topic 文本中，让脚本生成器遵循大纲。
 */
export function buildOutlineGuidance(outline: NarrativeOutline): string {
  const panelGuide = outline.panels.map((p, i) =>
    `Panel ${i + 1} [${p.narrativeFunction} / ${p.beatRole}]: ${p.keyInfo} (knowledgeGoal: ${p.knowledgeGoal}, shotIntent: ${p.shotIntent}, 构图: ${p.suggestedComposition}, 信息密度: ${p.infoDensity}, intensity: ${p.intensity}, carryForward: ${p.carryForward}${p.characters.length > 0 ? `, 角色: ${p.characters.join("+")}` : ""})`
  ).join("\n");

  const charGuide = outline.characterList.length > 0
    ? `\n角色表：\n${outline.characterList.map(c => `- ${c.name} (${c.role}, 首次出场: 第${c.firstAppearance}格)`).join("\n")}`
    : "";

  return `\n\n[Director Outline — 请严格遵循此叙事蓝图]
模板类型: ${outline.templateType}
叙事弧线: ${outline.narrativeArc}
信息分布: ${outline.infoDistribution}
${charGuide}

分镜蓝图：
${panelGuide}

重要：按照上述蓝图的叙事功能、构图建议和信息分配来创作每格的 scene/dialogue/imagePrompt。`;
}
