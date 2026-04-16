import { Character, ComicStyle, PartialLLMConfig } from "../types";
import {
  getLLMConfig,
  callOpenAICompatible,
  callAnthropic,
  callOpenAIWithMessages,
  callAnthropicWithMessages,
} from "./client";

/**
 * 根据 Character 的外观数据生成高质量参考图 prompt。
 * 比直接拼接外观字段更精准，LLM 会补充姿态、光影、构图等细节。
 */
export async function generateCharacterReferencePrompt(
  character: Character,
  style?: ComicStyle,
  llmOverrides?: PartialLLMConfig,
  vlmFeedback?: { issues: string[]; suggestions: string[]; patchPositive: string[] },
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

  const feedbackSection = vlmFeedback
    ? `\n\nPrevious VLM Evaluation Feedback (MUST address these issues):
Issues found: ${vlmFeedback.issues.join("; ")}
Suggestions: ${vlmFeedback.suggestions.join("; ")}
Required corrections: ${vlmFeedback.patchPositive.join(", ")}`
    : "";

  const prompt = `You are an expert character portrait prompt writer for AI image generation. Generate a detailed portrait prompt for this character.

Character: ${character.name}
${appearanceParts.join("\n")}
${style ? `Art Style: ${style}` : ""}${feedbackSection}

Requirements:
- Output ONLY the English image prompt, no other text
- Solo portrait, single character only, facing the viewer
- Include: face details, hair, clothing, expression, pose, background, lighting
- Character reference sheet style: front view, 3/4 view visible, consistent proportions
- White or simple background for clean reference
- Under 150 words, highly detailed
- Suitable for consistent character reference across multiple illustrations${vlmFeedback ? "\n- CRITICAL: Fix ALL issues from previous VLM evaluation" : ""}`;

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

