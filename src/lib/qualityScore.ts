import { ComicScript, PartialLLMConfig } from "./types";

export interface QualityScore {
  overall: number;
  knowledge: number;
  visualConsistency: number;
  narrativeCoherence: number;
  suggestions: string[];
}

/** Build quality evaluation prompt */
function buildQualityPrompt(script: ComicScript): string {
  const panelSummary = script.panels
    .map((p, i) => `Panel ${i + 1}: Scene="${p.scene}" Dialogue="${p.dialogue}" Prompt="${p.imagePrompt.slice(0, 100)}"`)
    .join("\n");

  return `You are a comic quality evaluator. Evaluate this ${script.panels.length}-panel comic titled "${script.title}" about "${script.topic}" in ${script.style} style.

${panelSummary}

Rate each dimension 1-10 and provide 2-3 specific improvement suggestions. Respond in this exact JSON format:
{
  "knowledge": <1-10 accuracy of facts/content>,
  "visualConsistency": <1-10 consistency of style/characters across panels>,
  "narrativeCoherence": <1-10 story flow and logical progression>,
  "suggestions": ["suggestion 1", "suggestion 2"]
}

JSON only, no other text.`;
}

/** Call LLM to evaluate comic quality */
export async function evaluateQuality(
  script: ComicScript,
  llmOverrides?: PartialLLMConfig,
): Promise<QualityScore> {
  const prompt = buildQualityPrompt(script);

  const apiUrl = llmOverrides?.apiUrl;
  const apiKey = llmOverrides?.apiKey;
  if (!apiUrl || !apiKey) throw new Error("未配置 LLM API");

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
    : { Authorization: `Bearer ${apiKey}` };

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

    const knowledge = Math.max(1, Math.min(10, parsed.knowledge || 5));
    const visualConsistency = Math.max(1, Math.min(10, parsed.visualConsistency || 5));
    const narrativeCoherence = Math.max(1, Math.min(10, parsed.narrativeCoherence || 5));

    return {
      knowledge,
      visualConsistency,
      narrativeCoherence,
      overall: Math.round((knowledge + visualConsistency + narrativeCoherence) / 3 * 10) / 10,
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 5) : [],
    };
  } catch {
    return {
      overall: 5,
      knowledge: 5,
      visualConsistency: 5,
      narrativeCoherence: 5,
      suggestions: ["评分解析失败，请重试"],
    };
  }
}
