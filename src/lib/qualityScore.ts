import { ComicScript, PartialLLMConfig } from "./types";
import { STYLE_META } from "./config/styles";

export interface QualityScore {
  overall: number;
  knowledge: number;
  visualConsistency: number;
  narrativeCoherence: number;
  compositionDiversity: number;
  suggestions: string[];
}

/** Build quality evaluation prompt */
function buildQualityPrompt(script: ComicScript): string {
  const panelSummary = script.panels
    .map((p, i) => `Panel ${i + 1}:\n  Scene: ${p.scene}\n  Dialogue: ${p.dialogue}\n  ImagePrompt: ${p.imagePrompt}`)
    .join("\n\n");

  const styleMeta = STYLE_META[script.style] ?? STYLE_META.anime;

  const charSection = script.characterDescription
    ? `\n## Character Description (anchor for visual consistency)\n${script.characterDescription}\n`
    : "";

  return `You are an expert comic quality evaluator. Evaluate this ${script.panels.length}-panel comic with full context.

## Basic Info
- Title: "${script.title}"
- Topic: "${script.topic}"
- Style: ${script.style} — ${styleMeta.description}
- Style keywords: ${styleMeta.modifier}
${charSection}
## Panels
${panelSummary}

## Evaluation Dimensions

1. **knowledge** (1-10): Accuracy of facts, depth of content, whether key concepts are adequately conveyed. Consider source material fidelity and contextual clues.

2. **visualConsistency** (1-10): Whether character appearance anchors (face, hair, body proportions, clothing, accessories) remain consistent across all panels. Whether lighting, color palette, and art style maintain coherence. For ${script.style} style specifically: ${getStyleConsistencyHint(script.style)}.

3. **narrativeCoherence** (1-10): Story flow, logical progression, whether dialogue and scenes build upon each other without unnecessary repetition.

4. **compositionDiversity** (1-10): Variety of camera angles (close-up, medium, wide, bird's-eye), shot framing, and visual rhythm across panels. Penalize if consecutive panels use the same composition. Good comics alternate between establishing shots, character close-ups, detail shots, and environmental wide shots.

## Output Format
Respond in this exact JSON format. Suggestions MUST reference specific panel numbers and give actionable fixes.
{
  "knowledge": <1-10>,
  "visualConsistency": <1-10>,
  "narrativeCoherence": <1-10>,
  "compositionDiversity": <1-10>,
  "suggestions": ["Panel X: specific actionable suggestion", "..."]
}

JSON only, no other text.`;
}

function getStyleConsistencyHint(style: string): string {
  const hints: Record<string, string> = {
    watercolor: "水彩风格下人物辨识度容易波动，需特别关注面部特征和轮廓线的一致性，以及色调冷暖过渡是否连贯",
    inkwash: "水墨风格需关注笔触浓淡是否统一，留白比例是否协调，人物墨线粗细是否一致",
    sketch: "素描风格需关注线条粗细、阴影方向和明暗对比是否统一",
    realistic: "写实风格需关注人物五官比例、光影方向和肤色一致性",
    anime: "动漫风格需关注人物眼睛大小、头身比和线条流畅度的一致性",
    chibi: "Q版风格需关注头身比（通常2-3头身）、表情夸张度和配色的一致性",
    pixel: "像素风格需关注分辨率/像素密度、调色板和角色像素轮廓的一致性",
  };
  return hints[style] || "关注角色外貌锚点和整体色调的一致性";
}

/** Call LLM to evaluate comic quality */
export async function evaluateQuality(
  script: ComicScript,
  llmOverrides?: PartialLLMConfig,
): Promise<QualityScore> {
  const prompt = buildQualityPrompt(script);

  const apiUrl = llmOverrides?.apiUrl;
  const apiKey = llmOverrides?.apiKey || "";
  if (!apiUrl) throw new Error("未配置 LLM API，请在设置页面配置 API URL");

  const normalizedUrl = apiUrl.includes("/chat/completions")
    ? apiUrl
    : `${apiUrl.replace(/\/+$/, "")}/chat/completions`;

  const isAnthropic = llmOverrides?.provider === "anthropic";

  // 构建请求体（区分 OpenAI 和 Anthropic 格式）
  const payload = isAnthropic
    ? {
        model: llmOverrides?.model || "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }
    : {
        model: llmOverrides?.model || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      };

  // 构建认证头（区分 Bearer token 和 x-api-key）
  const headers: Record<string, string> = isAnthropic
    ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
    : apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

  const response = await fetch("/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      targetUrl: normalizedUrl,
      headers,
      payload,
    }),
  });

  if (!response.ok) {
    throw new Error(`Quality evaluation failed: ${response.status}`);
  }

  const data = await response.json();
  // 兼容 OpenAI 和 Anthropic 响应格式
  const content = data.choices?.[0]?.message?.content
    || data.content?.[0]?.text
    || "";

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    const parsed = JSON.parse(jsonMatch[0]);

    const clamp = (v: number) => Math.max(1, Math.min(10, v || 5));
    const knowledge = clamp(parsed.knowledge);
    const visualConsistency = clamp(parsed.visualConsistency);
    const narrativeCoherence = clamp(parsed.narrativeCoherence);
    const compositionDiversity = clamp(parsed.compositionDiversity);

    return {
      knowledge,
      visualConsistency,
      narrativeCoherence,
      compositionDiversity,
      overall: Math.round((knowledge + visualConsistency + narrativeCoherence + compositionDiversity) / 4 * 10) / 10,
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 5) : [],
    };
  } catch {
    return {
      overall: 5,
      knowledge: 5,
      visualConsistency: 5,
      narrativeCoherence: 5,
      compositionDiversity: 5,
      suggestions: ["评分解析失败，请重试"],
    };
  }
}
