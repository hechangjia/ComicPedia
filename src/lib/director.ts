/**
 * Director Agent：在脚本生成前生成叙事大纲（蓝图）。
 * 轻量级 LLM 调用，输出结构化 JSON，指导后续脚本生成器。
 *
 * 设计原则：
 * - 不拆分脚本生成（保持整体性），而是用大纲约束创作方向
 * - 输出 token 极少（~300 token JSON），成本远低于额外的 Sub-Agent
 * - 大纲可展示给用户审查，在脚本生成前即可调整方向
 */

import { NarrativeOutline, PartialLLMConfig, ComicStyle, ContentType } from "./types";
import { callLLM } from "./llm";
import { STYLE_META } from "./config/styles";

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

## Rules
1. Each panel must have a clear narrative function (opening/setup/development/climax/resolution/epilogue)
2. Information density should follow a curve: low → medium → high → medium → low (like a well-paced lecture)
3. Camera compositions must vary — never repeat the same type consecutively
4. If characters are needed, list them with their narrative role and first appearance panel
5. narrativeArc: describe the overall story arc in one sentence
6. infoDistribution: describe how knowledge/information is spread across panels

## Output
Return ONLY this JSON structure, no other text:
{
  "totalPanels": ${targetPanels},
  "narrativeArc": "one sentence describing the story arc",
  "infoDistribution": "e.g. progressive, front-loaded, spiral, sandwich",
  "characterList": [
    {"name": "Character Name", "role": "protagonist/narrator/expert/mascot", "firstAppearance": 1}
  ],
  "panels": [
    {
      "narrativeFunction": "opening",
      "suggestedComposition": "wide shot / close-up / medium shot / bird's-eye / low angle / over-shoulder / dynamic",
      "characters": ["Character Name"],
      "keyInfo": "what knowledge/story point this panel should convey (1 sentence, Chinese)",
      "infoDensity": "low"
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

    const panels = parsed.panels.map((p: Record<string, unknown>) => ({
      narrativeFunction: validFunctions.has(p.narrativeFunction as string)
        ? p.narrativeFunction as string
        : "development",
      suggestedComposition: String(p.suggestedComposition || "medium shot"),
      characters: Array.isArray(p.characters) ? p.characters.map(String) : [],
      keyInfo: String(p.keyInfo || ""),
      infoDensity: validDensities.has(p.infoDensity as string)
        ? p.infoDensity as string
        : "medium",
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
    `Panel ${i + 1} [${p.narrativeFunction}]: ${p.keyInfo} (构图: ${p.suggestedComposition}, 信息密度: ${p.infoDensity}${p.characters.length > 0 ? `, 角色: ${p.characters.join("+")}` : ""})`
  ).join("\n");

  const charGuide = outline.characterList.length > 0
    ? `\n角色表：\n${outline.characterList.map(c => `- ${c.name} (${c.role}, 首次出场: 第${c.firstAppearance}格)`).join("\n")}`
    : "";

  return `\n\n[Director Outline — 请严格遵循此叙事蓝图]
叙事弧线: ${outline.narrativeArc}
信息分布: ${outline.infoDistribution}
${charGuide}

分镜蓝图：
${panelGuide}

重要：按照上述蓝图的叙事功能、构图建议和信息分配来创作每格的 scene/dialogue/imagePrompt。`;
}
