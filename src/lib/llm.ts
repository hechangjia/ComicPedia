import { Character, ComicScript, ComicStyle, ContentType, NovelMeta, PartialLLMConfig, PoetryGenre, PoetryMeta, WikipediaContent } from "./types";
import { getContentHandler } from "./contentRegistry";
import { withRetry } from "./retryQueue";

/** SSE 流式 chunk 回调：每次收到新文本时触发 */
export type StreamChunkCallback = (chunk: string, accumulated: string) => void;

/** 通用 LLM 调用（自动路由 OpenAI/Anthropic，通过 /api/llm 代理） */
export async function callLLM(prompt: string, overrides?: PartialLLMConfig): Promise<string> {
  const config = getLLMConfig(overrides);
  if (config.provider === "anthropic") {
    return callAnthropic(prompt, config);
  }
  return callOpenAICompatible(prompt, config);
}

/** LLM 配置 */
interface LLMConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  provider: "openai-compatible" | "anthropic";
}

/** 获取 LLM 配置 */
function getLLMConfig(overrides?: PartialLLMConfig): LLMConfig {
  const apiUrl = overrides?.apiUrl;
  const apiKey = overrides?.apiKey || "";
  const model = overrides?.model || "gpt-4o-mini";
  const provider = (overrides?.provider || "openai-compatible") as LLMConfig["provider"];

  if (!apiUrl) {
    throw new Error("未配置 LLM API，请在设置页面配置 API URL");
  }

  return { apiUrl, apiKey, model, provider };
}

/** 调用 OpenAI 兼容 API (支持 OpenAI, DeepSeek, Groq, Together, 本地 Ollama 等) */
async function callOpenAICompatible(prompt: string, config: LLMConfig): Promise<string> {
  const requestBody = {
    model: config.model,
    messages: [{ role: "user", content: prompt }],
  };

  // 兼容只填根路径的情况（如 deepseek 仅填 https://api.deepseek.com/v1）
  const normalizedUrl =
    config.apiUrl.includes("/chat/completions") || config.apiUrl.includes("/completions")
      ? config.apiUrl
      : `${config.apiUrl.replace(/\/+$/, "")}/chat/completions`;

  const doRequest = async () => {
    console.log("[LLM] 请求 URL:", normalizedUrl);
    console.log("[LLM] 请求 Model:", config.model);

    // 所有请求通过 Next.js 代理，避免浏览器 CORS 限制
    const response = await fetch("/api/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: normalizedUrl,
        headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
        payload: requestBody,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("[LLM] 错误响应:", response.status, errorText);

      // 对 429/5xx 进行重试
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`LLM 暂时不可用: ${response.status} ${errorText}`);
      }

      // 4xx 属于配置/请求错误，直接返回具体信息以便用户修正
      throw new Error(
        `LLM API 错误 (${response.status})，请检查 api_url/model/key 是否正确。` +
          (errorText ? ` 详情: ${errorText}` : "")
      );
    }

    const data = await response.json();
    console.log("[LLM] 响应成功");
    return data.choices[0].message.content;
  };

  try {
    return await withRetry(doRequest, { maxRetries: 3, baseDelay: 1200, maxDelay: 15000 });
  } catch (err) {
    // 提供更友好的提示
    throw new Error(
      err instanceof Error
        ? err.message
        : "LLM 服务繁忙或暂时不可用，请稍后重试。"
    );
  }
}

/** 调用 Anthropic API */
async function callAnthropic(prompt: string, config: LLMConfig): Promise<string> {
  const doRequest = async () => {
    const anthropicPayload = {
      model: config.model,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    };

    // 所有请求通过 Next.js 代理，避免浏览器 CORS 限制
    const response = await fetch("/api/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: config.apiUrl,
        headers: {
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        payload: anthropicPayload,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("[LLM] 错误响应:", response.status, errorText);

      if (response.status === 429 || response.status >= 500) {
        throw new Error(`LLM 暂时不可用: ${response.status} ${errorText}`);
      }

      throw new Error(`Anthropic API 错误: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.content[0].text;
  };

  try {
    return await withRetry(doRequest, { maxRetries: 3, baseDelay: 1200, maxDelay: 15000 });
  } catch (err) {
    throw new Error(
      err instanceof Error
        ? `LLM 服务繁忙或暂时不可用，请稍后重试。${err.message}`
        : "LLM 服务繁忙或暂时不可用，请稍后重试。"
    );
  }
}

// ============================================================
// SSE 流式调用
// ============================================================

/**
 * 解析 SSE 流并提取文本增量。
 * 同时支持 OpenAI (delta.content) 和 Anthropic (content_block_delta) 格式。
 */
async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  provider: "openai-compatible" | "anthropic",
  onChunk: StreamChunkCallback,
): Promise<string> {
  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // 保留不完整行

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue;
      if (!trimmed.startsWith("data: ")) continue;

      const data = trimmed.slice(6);
      if (data === "[DONE]") return accumulated;

      try {
        const parsed = JSON.parse(data);
        let text = "";

        if (provider === "anthropic") {
          if (parsed.type === "content_block_delta" && parsed.delta?.text) {
            text = parsed.delta.text;
          }
        } else {
          text = parsed.choices?.[0]?.delta?.content || "";
        }

        if (text) {
          accumulated += text;
          onChunk(text, accumulated);
        }
      } catch {
        // 非 JSON data 行，跳过
      }
    }
  }

  return accumulated;
}

/** 流式调用 OpenAI 兼容 API */
async function callOpenAICompatibleStream(
  prompt: string,
  config: LLMConfig,
  onChunk: StreamChunkCallback,
  signal?: AbortSignal,
): Promise<string> {
  const requestBody = {
    model: config.model,
    messages: [{ role: "user", content: prompt }],
  };

  const normalizedUrl =
    config.apiUrl.includes("/chat/completions") || config.apiUrl.includes("/completions")
      ? config.apiUrl
      : `${config.apiUrl.replace(/\/+$/, "")}/chat/completions`;

  console.log("[LLM Stream] 请求 URL:", normalizedUrl);

  // 所有请求通过 Next.js 代理，避免浏览器 CORS 限制
  const response = await fetch("/api/llm-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      targetUrl: normalizedUrl,
      headers: { Authorization: `Bearer ${config.apiKey}` },
      payload: requestBody,
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`LLM 流式响应错误 (${response.status}): ${errorText}`);
  }

  if (!response.body) {
    throw new Error("响应不包含可读流");
  }

  return parseSSEStream(response.body.getReader(), "openai-compatible", onChunk);
}

/** 流式调用 Anthropic API */
async function callAnthropicStream(
  prompt: string,
  config: LLMConfig,
  onChunk: StreamChunkCallback,
  signal?: AbortSignal,
): Promise<string> {
  const payload = {
    model: config.model,
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  };

  // 所有请求通过 Next.js 代理，避免浏览器 CORS 限制
  const response = await fetch("/api/llm-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      targetUrl: config.apiUrl,
      headers: {
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      payload,
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Anthropic 流式响应错误 (${response.status}): ${errorText}`);
  }

  if (!response.body) {
    throw new Error("响应不包含可读流");
  }

  return parseSSEStream(response.body.getReader(), "anthropic", onChunk);
}

/**
 * 流式生成分镜脚本。
 * 当 onChunk 提供时使用 SSE 流式传输，否则回退到非流式调用。
 * 流式失败时自动回退到非流式，保证可靠性。
 */
export async function generateScriptStream(
  topic: string,
  style: ComicStyle,
  panelCount?: number,
  llmOverrides?: PartialLLMConfig,
  contentType?: ContentType,
  poetryGenre?: PoetryGenre,
  poetryMeta?: PoetryMeta,
  character?: Character,
  onChunk?: StreamChunkCallback,
  signal?: AbortSignal,
  novelMeta?: NovelMeta,
  wikipediaContent?: WikipediaContent,
): Promise<ComicScript> {
  const config = getLLMConfig(llmOverrides);

  // Use contentRegistry for prompt building
  const handler = getContentHandler(contentType);
  const prompt = handler.buildPrompt({
    topic, style, panelCount, poetryGenre, poetryMeta, character, novelMeta, wikipediaContent,
  });

  let response: string;

  if (onChunk) {
    if (config.provider === "anthropic") {
      response = await callAnthropicStream(prompt, config, onChunk, signal);
    } else {
      response = await callOpenAICompatibleStream(prompt, config, onChunk, signal);
    }
  } else {
    if (config.provider === "anthropic") {
      response = await callAnthropic(prompt, config);
    } else {
      response = await callOpenAICompatible(prompt, config);
    }
  }

  // Use contentRegistry for response parsing
  const script = handler.parseResponse(response);

  if (!script) {
    console.error("[LLM] 无法解析脚本，原始响应前500字符:", response.substring(0, 500));
    throw new Error("无法解析 LLM 返回的脚本");
  }

  return script;
}

/** 生成分镜脚本 */
export async function generateScript(
  topic: string,
  style: ComicStyle,
  panelCount?: number,
  llmOverrides?: PartialLLMConfig,
  contentType?: ContentType,
  poetryGenre?: PoetryGenre,
  poetryMeta?: PoetryMeta,
  character?: Character,
  novelMeta?: NovelMeta,
  wikipediaContent?: WikipediaContent,
): Promise<ComicScript> {
  const config = getLLMConfig(llmOverrides);

  // Use contentRegistry for prompt building
  const handler = getContentHandler(contentType);
  const prompt = handler.buildPrompt({
    topic, style, panelCount, poetryGenre, poetryMeta, character, novelMeta, wikipediaContent,
  });

  let response: string;
  if (config.provider === "anthropic") {
    response = await callAnthropic(prompt, config);
  } else {
    response = await callOpenAICompatible(prompt, config);
  }

  // Use contentRegistry for response parsing
  const script = handler.parseResponse(response);

  if (!script) {
    console.error("[LLM] 无法解析脚本，原始响应前500字符:", response.substring(0, 500));
    throw new Error("无法解析 LLM 返回的脚本");
  }

  return script;
}

// ============================================================
// Topic Research — Pre-scripting knowledge expansion
// ============================================================

/** Topic research result */
export interface TopicResearchResult {
  /** Original user input */
  originalTopic: string;
  /** Expanded description generated by LLM */
  expandedDescription: string;
  /** Key facts and concepts identified */
  keyFacts: string[];
  /** Suggested narrative angle */
  narrativeAngle: string;
}

/**
 * Call LLM to research and expand a topic before script generation.
 * Uses system prompt + few-shot + low temperature for accuracy.
 * Similar to generateCharacterProfile() but for topics.
 */
export async function generateTopicResearch(
  topic: string,
  llmOverrides?: PartialLLMConfig,
): Promise<TopicResearchResult> {
  const config = getLLMConfig(llmOverrides);

  const systemPrompt = `You are a rigorous knowledge researcher. Your task is to analyze a user-provided topic and output a structured JSON description that will be used to generate an accurate educational comic.

Core rules:
1. For well-known concepts/technologies/people: provide factually accurate descriptions based on established knowledge
2. For obscure or niche topics: describe what it is based on available context, or honestly state that information is limited
3. For ambiguous terms: prioritize the most common/notable interpretation, but note alternatives
4. NEVER hallucinate or fabricate facts — if you're unsure, say so explicitly
5. Output ONLY valid JSON, no other text, no markdown code blocks
6. All text output must be in Simplified Chinese (简体中文)

JSON format:
{
  "expandedDescription": "2-4 sentences: what this topic IS, its significance, and core mechanism/concept",
  "keyFacts": ["fact1", "fact2", ...],  // 3-6 key facts/concepts that must be covered
  "narrativeAngle": "Suggested angle for comic storytelling (e.g., historical origin, mechanism explanation, real-world analogy)"
}`;

  const fewShotUser1 = `主题: Transformer 注意力机制`;
  const fewShotAssistant1 = JSON.stringify({
    expandedDescription: "Transformer是2017年由Google Brain团队（Ashish Vaswani等人）提出的神经网络架构，其核心创新是自注意力机制（Self-Attention）。它通过Query、Key、Value三组向量的点积运算来计算序列中各元素之间的关联权重，彻底取代了RNN的循环结构，实现了并行计算和长距离依赖建模。",
    keyFacts: [
      "2017年论文\"Attention Is All You Need\"提出",
      "核心公式：Attention(Q,K,V) = softmax(QK^T/√d_k)V",
      "Multi-Head Attention：多组Q/K/V并行捕获不同维度的关联",
      "位置编码（Positional Encoding）补充序列顺序信息",
      "GPT、BERT、ChatGPT等模型的基础架构"
    ],
    narrativeAngle: "历史人物引入：从Vaswani团队面临RNN瓶颈的困境讲起，逐步拆解Q/K/V机制"
  }, null, 2);

  const fewShotUser2 = `主题: OpenClaw`;
  const fewShotAssistant2 = JSON.stringify({
    expandedDescription: "OpenClaw是一个开源的机器人灵巧手（Dexterous Hand）项目，旨在降低机器人抓取研究的硬件门槛。它提供了低成本、可3D打印的机械手设计方案，配合开源的控制软件和仿真环境，让研究者和爱好者能以较低成本搭建具备多自由度抓取能力的机器人手。",
    keyFacts: [
      "开源机器人灵巧手项目，可3D打印制造",
      "目标是降低灵巧操作研究的硬件成本门槛",
      "包含机械设计、电子控制、软件仿真的完整方案",
      "支持强化学习等AI方法进行抓取策略训练",
      "属于具身智能（Embodied AI）领域的重要工具"
    ],
    narrativeAngle: "从\"机器人为什么笨手笨脚\"的生活观察引入，展示OpenClaw如何让机器人学会灵巧抓取"
  }, null, 2);

  const userPrompt = `主题: ${topic}`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: fewShotUser1 },
    { role: "assistant", content: fewShotAssistant1 },
    { role: "user", content: fewShotUser2 },
    { role: "assistant", content: fewShotAssistant2 },
    { role: "user", content: userPrompt },
  ];

  let response: string;
  if (config.provider === "anthropic") {
    response = await callAnthropicWithMessages(
      systemPrompt,
      messages.filter((m) => m.role !== "system"),
      config
    );
  } else {
    response = await callOpenAIWithMessages(messages, config);
  }

  const cleaned = response.trim().replace(/^```json?\s*/, "").replace(/\s*```$/, "");

  try {
    const parsed = JSON.parse(cleaned);
    return {
      originalTopic: topic,
      expandedDescription: String(parsed.expandedDescription || ""),
      keyFacts: Array.isArray(parsed.keyFacts) ? parsed.keyFacts.map(String) : [],
      narrativeAngle: String(parsed.narrativeAngle || ""),
    };
  } catch (e) {
    console.error("[LLM] Failed to parse topic research JSON:", cleaned.substring(0, 300));
    // Graceful fallback: return the raw topic without expansion
    return {
      originalTopic: topic,
      expandedDescription: topic,
      keyFacts: [],
      narrativeAngle: "",
    };
  }
}

/**
 * Build an enhanced topic string from research result.
 * Used as input for script generation prompt.
 */
export function buildEnhancedTopicFromResearch(research: TopicResearchResult): string {
  const parts = [research.expandedDescription];

  if (research.keyFacts.length > 0) {
    parts.push(`\n必须覆盖的关键知识点：\n${research.keyFacts.map((f, i) => `${i + 1}. ${f}`).join("\n")}`);
  }

  if (research.narrativeAngle) {
    parts.push(`\n建议叙事角度：${research.narrativeAngle}`);
  }

  return parts.join("\n");
}

// ============================================================
// Wikipedia Content Summarization
// ============================================================

/**
 * AI 概括 Wikipedia 长文，提取适合漫画创作的精华内容。
 * 将冗长的百科全文压缩为结构化的知识摘要（3000-5000字）。
 */
export async function summarizeWikipediaContent(
  title: string,
  content: string,
  llmOverrides?: PartialLLMConfig,
): Promise<string> {
  const config = getLLMConfig(llmOverrides);

  const prompt = `你是一位专业的科普编辑。请将以下 Wikipedia 百科内容进行概括和润色，提取最适合制作科普漫画的精华内容。

## 百科词条：${title}

## 原始内容
${content}

## 要求
1. **保留核心知识**：定义、原理、关键数据、重要人物、发展历程、应用场景
2. **去除冗余**：删除过于学术的引用注释、重复表述、参见链接、编辑备注
3. **结构化输出**：按逻辑分段（概述、核心原理、发展历程、应用与影响），每段有小标题
4. **语言统一**：全部使用简体中文，通俗易懂，适合大众科普
5. **长度控制**：3000-5000字，信息密度高但不遗漏关键知识点
6. **事实准确**：不添加原文没有的信息，不编造数据

请直接输出概括后的内容，不要添加额外说明：`;

  let response: string;
  if (config.provider === "anthropic") {
    response = await callAnthropic(prompt, config);
  } else {
    response = await callOpenAICompatible(prompt, config);
  }

  return response.trim();
}

/**
 * 调用 LLM 生成参考图的文生图 prompt。
 * 轻量调用：仅返回一段英文图片描述，用于后续文生图模型生成参考图。
 */
export async function generateReferenceImagePrompt(
  topic: string,
  style: ComicStyle,
  llmOverrides?: PartialLLMConfig,
): Promise<string> {
  const config = getLLMConfig(llmOverrides);

  const prompt = `You are an expert at writing image generation prompts. Based on the following comic topic and style, generate a single reference image prompt that captures the main character(s) and visual tone of the comic.

Topic: ${topic}
Style: ${style}

Requirements:
- Output ONLY the image prompt in English, nothing else
- Focus on character appearance, pose, and art style
- Keep it under 200 words
- Make it detailed enough for consistent character generation`;

  let response: string;
  if (config.provider === "anthropic") {
    response = await callAnthropic(prompt, config);
  } else {
    response = await callOpenAICompatible(prompt, config);
  }

  return response.trim();
}

/**
 * 根据 Character 的外观数据生成高质量参考图 prompt。
 * 比直接拼接外观字段更精准，LLM 会补充姿态、光影、构图等细节。
 */
export async function generateCharacterReferencePrompt(
  character: Character,
  style?: ComicStyle,
  llmOverrides?: PartialLLMConfig,
): Promise<string> {
  const config = getLLMConfig(llmOverrides);
  const isNonHuman = !!character.appearance.species;

  const appearanceParts: string[] = [];
  if (isNonHuman && character.appearance.species) appearanceParts.push(`Species: ${character.appearance.species}`);
  if (character.appearance.gender) appearanceParts.push(`Gender: ${character.appearance.gender}`);
  if (character.appearance.age) appearanceParts.push(`Age: ${character.appearance.age}`);
  if (character.appearance.hair) appearanceParts.push(`Hair: ${character.appearance.hair}`);
  if (character.appearance.eyes) appearanceParts.push(`Eyes: ${character.appearance.eyes}`);
  if (character.appearance.clothing) appearanceParts.push(`Clothing: ${character.appearance.clothing}`);
  if (character.description) appearanceParts.push(`Description: ${character.description}`);

  const prompt = `You are an expert character portrait prompt writer for AI image generation. Generate a detailed portrait prompt for this character.

Character: ${character.name}
${appearanceParts.join("\n")}
${style ? `Art Style: ${style}` : ""}

Requirements:
- Output ONLY the English image prompt, no other text
- Solo portrait, single character only, facing the viewer
- Include: face details, hair, clothing, expression, pose, background, lighting
- Under 150 words, highly detailed
- Suitable for consistent character reference across multiple illustrations`;

  let response: string;
  if (config.provider === "anthropic") {
    response = await callAnthropic(prompt, config);
  } else {
    response = await callOpenAICompatible(prompt, config);
  }

  return response.trim();
}

/** 角色 prompt 结果 */
export interface CharacterPromptResult {
  name: string;
  prompt: string;
}

/**
 * 调用 LLM 为多个角色分别生成独立的文生图 prompt。
 *
 * 流程：
 * 1. 将角色名列表 + 作品主题/风格发送给 LLM
 * 2. LLM 为每个角色生成一段独立的英文肖像描述
 * 3. 返回 [{name, prompt}] 数组
 */
export async function generateCharacterPrompts(
  characterNames: string[],
  topic: string,
  style: ComicStyle,
  llmOverrides?: PartialLLMConfig,
): Promise<CharacterPromptResult[]> {
  const config = getLLMConfig(llmOverrides);

  const namesList = characterNames.map((n, i) => `${i + 1}. ${n}`).join("\n");

  const prompt = `You are an expert at writing image generation prompts for individual character portraits. Based on the following literary work / topic, art style, and character list, generate a SEPARATE portrait prompt for each character.

Topic / Work: ${topic}
Art Style: ${style}
Characters:
${namesList}

Requirements:
- Output a JSON array with objects: [{"name": "角色名", "prompt": "English portrait prompt"}]
- Each prompt should describe ONE character ALONE (solo portrait, no other characters)
- Include: gender, age, facial features, hairstyle, clothing, expression, pose
- The clothing and appearance MUST match the historical/fictional setting of the work
- Keep each prompt under 150 words
- Output ONLY the JSON array, no other text, no markdown code blocks`;

  let response: string;
  if (config.provider === "anthropic") {
    response = await callAnthropic(prompt, config);
  } else {
    response = await callOpenAICompatible(prompt, config);
  }

  // 解析 JSON 响应
  const cleaned = response.trim().replace(/^```json?\s*/, "").replace(/\s*```$/, "");

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item: Record<string, unknown>) => item.name && item.prompt)
        .map((item: Record<string, unknown>) => ({
          name: String(item.name),
          prompt: String(item.prompt),
        }));
    }
  } catch (e) {
    console.error("[LLM] 无法解析角色 prompt JSON:", cleaned.substring(0, 300));
  }

  // 解析失败时降级：为每个角色生成通用 prompt
  return characterNames.map(name => ({
    name,
    prompt: `A solo portrait of ${name} from "${topic}", in ${style} art style, detailed character design, full upper body, facing the viewer`,
  }));
}

/** 角色档案生成结果 */
export interface CharacterProfileResult {
  description: string;
  appearance: {
    gender: string;
    age: string;
    hair: string;
    eyes: string;
    clothing: string;
    species?: string;
  };
  tags: string[];
}

/**
 * 调用 LLM 根据角色名和上下文自动生成角色档案（描述、外观属性、标签）。
 * 使用 system prompt + few-shot 示例 + 低 temperature 确保事实准确性。
 */
export async function generateCharacterProfile(
  name: string,
  context?: string,
  llmOverrides?: PartialLLMConfig,
): Promise<CharacterProfileResult> {
  const config = getLLMConfig(llmOverrides);

  const contextHint = context ? `\n角色来源/背景: ${context}` : "";

  const systemPrompt = `你是一位严谨的角色资料库编辑。你的职责是根据角色名输出准确的角色档案 JSON。

核心规则：
1. 真实人物（企业家、科学家、政治家、运动员等）：必须基于此人的公开真实信息，外貌必须符合本人真实特征，绝对不可编造或与同名虚构角色混淆
2. 虚构角色（文学、影视、动漫、游戏）：必须严格符合原作设定
3. 吉祥物/非人类角色（动物、拟人化形象）：appearance.species 必须填写物种类型，hair/eyes/clothing 字段用于描述该物种的特征（如毛发→羽毛/鳞片，clothing→体表特征/装饰）
4. 原创/未知角色名：根据名字的语感和文化暗示合理创作
5. 仅输出 JSON，不要任何其他文字、解释或 markdown 代码块

消歧规则（极其重要）：
- 当一个名字既对应真实人物也对应虚构角色时，优先识别为真实人物，除非用户通过"角色来源/背景"明确指定了虚构作品
- 例如："Linus"或"林纳斯"默认指 Linux 创始人 Linus Torvalds，而非《花生漫画》的 Linus van Pelt
- 例如："马斯克"默认指 Elon Musk，而非任何虚构角色
- 如果用户提供了"角色来源/背景"（如"花生漫画"、"红楼梦"），则按该来源匹配角色

吉祥物识别规则：
- 当名字包含动物名或已知品牌吉祥物时，自动识别为非人类角色
- 例如："Tux"→Linux企鹅、"Docker鲸鱼"→Docker Moby whale、"小龙虾"→对应吉祥物
- appearance.species 必须填写（如 "penguin"、"whale"、"lobster"）
- gender 可填 "N/A"，其余字段描述该物种的实际特征`;

  const fewShotUser1 = `角色名: 埃隆\u00B7马斯克`;
  const fewShotAssistant1 = JSON.stringify({
    description: "SpaceX与特斯拉创始人，硅谷传奇科技企业家",
    appearance: {
      gender: "男",
      age: "中年",
      hair: "深棕色短发，发际线略高",
      eyes: "蓝绿色深邃眼睛，目光锐利",
      clothing: "黑色T恤搭配深色休闲外套，科技极简风格"
    },
    tags: ["科技", "企业家", "真实人物", "写实"]
  }, null, 2);

  const fewShotUser2 = `角色名: 林纳斯\u00B7托瓦尔兹`;
  const fewShotAssistant2 = JSON.stringify({
    description: "Linux内核创始人，开源运动的精神领袖",
    appearance: {
      gender: "男",
      age: "中年",
      hair: "金棕色短发，自然随意的北欧风格",
      eyes: "浅蓝灰色眼睛，戴圆框眼镜，温和而坚定",
      clothing: "灰色polo衫或素色T恤，北欧程序员休闲风"
    },
    tags: ["科技", "程序员", "真实人物", "开源", "写实"]
  }, null, 2);

  const fewShotUser3 = `角色名: Tux
角色来源/背景: Linux mascot`;
  const fewShotAssistant3 = JSON.stringify({
    description: "Linux official mascot, a friendly and chubby penguin sitting contentedly",
    appearance: {
      species: "penguin",
      gender: "N/A",
      age: "adult",
      hair: "smooth black and white feathers",
      eyes: "small round black eyes with a cheerful expression",
      clothing: "white belly, black back and flippers, orange webbed feet and beak"
    },
    tags: ["mascot", "Linux", "open source", "penguin", "cartoon"]
  }, null, 2);

  const userPrompt = `角色名: ${name}${contextHint}`;

  // 构建带 system + few-shot 的完整消息序列
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: fewShotUser1 },
    { role: "assistant", content: fewShotAssistant1 },
    { role: "user", content: fewShotUser2 },
    { role: "assistant", content: fewShotAssistant2 },
    { role: "user", content: fewShotUser3 },
    { role: "assistant", content: fewShotAssistant3 },
    { role: "user", content: userPrompt },
  ];

  let response: string;
  if (config.provider === "anthropic") {
    // Anthropic: system 放在顶层，messages 只含 user/assistant
    response = await callAnthropicWithMessages(
      systemPrompt,
      messages.filter((m) => m.role !== "system"),
      config
    );
  } else {
    response = await callOpenAIWithMessages(messages, config);
  }

  const cleaned = response.trim().replace(/^```json?\s*/, "").replace(/\s*```$/, "");

  try {
    const parsed = JSON.parse(cleaned);
    return {
      description: String(parsed.description || ""),
      appearance: {
        gender: String(parsed.appearance?.gender || ""),
        age: String(parsed.appearance?.age || ""),
        hair: String(parsed.appearance?.hair || ""),
        eyes: String(parsed.appearance?.eyes || ""),
        clothing: String(parsed.appearance?.clothing || ""),
        species: String(parsed.appearance?.species || ""),
      },
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
    };
  } catch (e) {
    console.error("[LLM] 无法解析角色档案 JSON:", cleaned.substring(0, 300));
    throw new Error("AI 返回格式异常，请重试");
  }
}

// ============================================================
// 带完整 messages 的 LLM 调用（角色档案专用）
// ============================================================

/** OpenAI 兼容 API — 支持完整 messages 数组 + 低 temperature */
async function callOpenAIWithMessages(
  messages: Array<{ role: string; content: string }>,
  config: LLMConfig
): Promise<string> {
  const requestBody = {
    model: config.model,
    messages,
    temperature: 0.3,
  };

  const normalizedUrl =
    config.apiUrl.includes("/chat/completions") || config.apiUrl.includes("/completions")
      ? config.apiUrl
      : `${config.apiUrl.replace(/\/+$/, "")}/chat/completions`;

  const doRequest = async () => {
    const response = await fetch("/api/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: normalizedUrl,
        headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
        payload: requestBody,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`LLM 暂时不可用: ${response.status} ${errorText}`);
      }
      throw new Error(`LLM API 错误 (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  };

  return await withRetry(doRequest, { maxRetries: 3, baseDelay: 1200, maxDelay: 15000 });
}

/** Anthropic API — 支持 system prompt + 完整 messages 数组 + 低 temperature */
async function callAnthropicWithMessages(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  config: LLMConfig
): Promise<string> {
  const doRequest = async () => {
    const anthropicPayload = {
      model: config.model,
      max_tokens: 2048,
      system: systemPrompt,
      messages,
      temperature: 0.3,
    };

    const response = await fetch("/api/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: config.apiUrl,
        headers: {
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        payload: anthropicPayload,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`LLM 暂时不可用: ${response.status} ${errorText}`);
      }
      throw new Error(`Anthropic API 错误: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.content[0].text;
  };

  return await withRetry(doRequest, { maxRetries: 3, baseDelay: 1200, maxDelay: 15000 });
}
