import { ComicScript, ComicPanel, PartialLLMConfig } from "./types";

interface AISuggestion {
  original: string;
  suggested: string;
  reason: string;
}

interface NarrativeSuggestion {
  type: "modify" | "add" | "remove";
  panelIndex?: number;
  field?: "dialogue" | "scene" | "imagePrompt";
  original?: string;
  suggested?: string;
  reason: string;
}

/** LLM 调用辅助 */
async function callLLM(prompt: string, llmOverrides?: PartialLLMConfig): Promise<string> {
  const apiUrl = llmOverrides?.apiUrl;
  const apiKey = llmOverrides?.apiKey || "";
  if (!apiUrl) throw new Error("未配置 LLM API，请在设置页面配置 API URL");

  const normalizedUrl = apiUrl.includes("/chat/completions")
    ? apiUrl
    : `${apiUrl.replace(/\/+$/, "")}/chat/completions`;

  const isAnthropic = llmOverrides?.provider === "anthropic";
  const payload = isAnthropic
    ? { model: llmOverrides?.model || "claude-sonnet-4-20250514", max_tokens: 2048, messages: [{ role: "user", content: prompt }] }
    : { model: llmOverrides?.model || "gpt-4o-mini", messages: [{ role: "user", content: prompt }] };
  const headers: Record<string, string> = isAnthropic
    ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
    : apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

  const response = await fetch("/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetUrl: normalizedUrl, headers, payload }),
  });

  if (!response.ok) throw new Error(`AI 编辑请求失败: ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || data.content?.[0]?.text || "";
}

/** 优化单面板的对话 */
export async function optimizeDialogue(
  panel: ComicPanel,
  script: ComicScript,
  panelIndex: number,
  llmOverrides?: PartialLLMConfig,
): Promise<AISuggestion> {
  const context = script.panels
    .map((p, i) => `第${i + 1}格: 场景="${p.scene}" 对话="${p.dialogue}"`)
    .join("\n");

  const prompt = `你是一位漫画对话文案专家。请优化第 ${panelIndex + 1} 格的对话文案。

漫画标题：${script.title}
主题：${script.topic}

当前所有面板：
${context}

当前第 ${panelIndex + 1} 格对话：
"${panel.dialogue}"

要求：保持原意，提升表达力和叙事张力，适合漫画气泡中阅读。

返回 JSON：
{"original": "原对话", "suggested": "优化后对话", "reason": "优化原因"}

只返回 JSON，不要其他文字。`;

  const content = await callLLM(prompt, llmOverrides);
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("解析失败");
    return JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("无法解析 AI 建议");
  }
}

/** 优化单面板的 imagePrompt */
export async function optimizeImagePrompt(
  panel: ComicPanel,
  script: ComicScript,
  panelIndex: number,
  llmOverrides?: PartialLLMConfig,
): Promise<AISuggestion> {
  const prompt = `你是一位 AI 绘画提示词专家。请优化第 ${panelIndex + 1} 格的 imagePrompt。

漫画标题：${script.title}
风格：${script.style}
角色描述：${script.characterDescription || "无"}

当前第 ${panelIndex + 1} 格：
场景：${panel.scene}
对话：${panel.dialogue}
当前 imagePrompt：${panel.imagePrompt}

要求：增强构图、光影、细节描述，保持 ${script.style} 风格一致性，纯英文输出。

返回 JSON：
{"original": "原 prompt", "suggested": "优化后 prompt", "reason": "优化原因（中文）"}

只返回 JSON，不要其他文字。`;

  const content = await callLLM(prompt, llmOverrides);
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("解析失败");
    return JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("无法解析 AI 建议");
  }
}

/** 全局叙事优化 */
export async function optimizeNarrative(
  script: ComicScript,
  llmOverrides?: PartialLLMConfig,
): Promise<NarrativeSuggestion[]> {
  const panelSummary = script.panels
    .map((p, i) => `第${i + 1}格: 场景="${p.scene}" 对话="${p.dialogue}" imagePrompt="${p.imagePrompt.slice(0, 80)}"`)
    .join("\n");

  const prompt = `你是一位漫画叙事结构专家。请评估以下 ${script.panels.length} 格漫画的叙事质量并给出优化建议。

漫画标题：${script.title}
主题：${script.topic}
风格：${script.style}

面板内容：
${panelSummary}

请从以下维度评估并给出具体修改建议：
1. 起承转合节奏
2. 对话表达力
3. imagePrompt 视觉一致性
4. 知识传达完整性

返回 JSON 数组，每条建议格式：
[
  {
    "type": "modify",
    "panelIndex": 0,
    "field": "dialogue",
    "original": "原内容",
    "suggested": "建议内容",
    "reason": "优化原因"
  }
]

type 可选值：modify（修改现有面板）。panelIndex 从 0 开始。field 为 dialogue/scene/imagePrompt。
最多返回 8 条建议。只返回 JSON，不要其他文字。`;

  const content = await callLLM(prompt, llmOverrides);
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch {
    return [];
  }
}
