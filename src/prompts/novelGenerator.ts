import { ComicScript, ComicStyle, NovelGenre, NovelMeta } from "../lib/types";
import { getStyleGuidanceForLLM } from "../lib/config/styles";

/** 小说体裁描述 */
const GENRE_DESCRIPTIONS: Record<NovelGenre, string> = {
  wuxia: "武侠小说，江湖恩怨，刀光剑影，侠义精神",
  xianxia: "仙侠修真，仙凡之别，法术飞剑，天道轮回",
  historical: "历史小说，朝代更迭，真实背景，人物命运",
  romance: "言情小说，情感纠葛，人物关系，细腻心理",
  scifi: "科幻小说，未来世界，科技想象，哲学思辨",
  mystery: "悬疑推理，层层迷雾，线索推演，真相大白",
  classic: "经典名著，文学巨作，深刻主题，经典场景",
  fantasy: "奇幻小说，魔法世界，种族设定，史诗冒险",
};

/** 体裁对应的风格推荐 */
export function getNovelRecommendedStyles(genre?: NovelGenre): ComicStyle[] {
  if (!genre) return ["manga", "realistic", "anime"];
  const recommendations: Record<NovelGenre, ComicStyle[]> = {
    wuxia: ["inkwash", "manga", "sketch"],
    xianxia: ["inkwash", "watercolor", "anime"],
    historical: ["inkwash", "realistic", "sketch"],
    romance: ["watercolor", "anime", "sketch"],
    scifi: ["realistic", "anime", "pixel"],
    mystery: ["sketch", "manga", "realistic"],
    classic: ["inkwash", "watercolor", "realistic"],
    fantasy: ["anime", "watercolor", "realistic"],
  };
  return recommendations[genre];
}

/** 构建小说场景漫画 Prompt */
export function buildNovelPrompt(
  content: string,
  style: ComicStyle,
  panelCount?: number,
  meta?: NovelMeta,
): string {
  const genreDesc = meta?.genre ? GENRE_DESCRIPTIONS[meta.genre] : "叙事性小说，人物鲜明，情节紧凑";

  const panelGuidance = panelCount && panelCount > 0
    ? `规划${panelCount}格分镜，每格对应一个关键场景或情节节点。`
    : "根据文本内容自行决定分镜数量（通常4-10格），以完整还原故事关键场景为最高优先。";

  const metaSection = [
    meta?.title ? `## 作品名\n${meta.title}\n` : "",
    meta?.author ? `## 作者\n${meta.author}\n` : "",
    meta?.era ? `## 故事背景时代\n${meta.era}\n` : "",
  ].filter(Boolean).join("\n");

  return `你是一位专业的小说场景漫画编剧，擅长将文学作品的关键场景转化为视觉分镜脚本。

## 原文片段
${content}

${metaSection}
## 体裁
${genreDesc}

## 画面风格
${getStyleGuidanceForLLM(style)}

## 分镜规划
${panelGuidance}

## ⚠️ 语言限制（极其重要！必须严格遵守！）

1. **禁止使用日文、韩文、阿拉伯文等任何非中英文字符**
2. **imagePrompt 必须是纯英文**，不能包含任何日文假名或汉字
3. **即使选择"manga"或"anime"风格，也不能输出日文**
4. 对话(dialogue)和场景(scene)使用**简体中文**
5. 图片中如需文字，指定为英文或中文拼音

## 创作流程

### 步骤 1：场景提取
仔细阅读原文，提取出最具视觉冲击力和叙事价值的关键场景。优先选取：
- 人物首次登场或形象最鲜明的时刻
- 关键冲突/转折点
- 情感高潮（悲喜、震惊、感动）
- 环境/氛围描写最生动的段落
- 对话最精彩的片段

### 步骤 2：角色设计（characterDescription 字段）
从原文中提取所有出现的角色，为每个角色设计固定外观。每个角色描述必须包含：
- **唯一标识名**（英文化，如 "Zhang San", "Lin Daiyu"）
- **外观描述**（英文，40-60词）：年龄/体型、发型发色、面部特征、服饰细节、气质

将所有角色描述合并到 characterDescription 字段，格式：
"[角色名: 完整外观描述] [角色名: 完整外观描述] ..."

### 步骤 3：分镜创作
每格 imagePrompt 必须：
1. **以完整 characterDescription 开头**（一字不差地复制当前画面中出现的角色描述）
2. 使用完全相同的英文词汇，**禁止同义词替换**
3. 描述该格的动作、表情、场景、构图、光影
4. 末尾添加风格标记和无文字标记

### 步骤 4：对话处理
- dialogue 字段直接引用原文中的对话或旁白
- 如原文无对白，提炼该场景的核心叙述文字
- 保持原文语言风格和韵味
- 禁止添加"(独白)"、"(旁白)"等标注

## 角色一致性规则

1. **characterDescription 包含所有角色的完整外观描述**
2. **每格 imagePrompt 开头复制当前画面中出现的角色描述**（一字不差）
3. **服饰和年龄全程一致**，同一场景中角色外观不变
4. 格式：[角色名: 完整描述] + 该格的动作和场景

### 正确示例
characterDescription:
"[Lin Daiyu: young Chinese woman in her late teens, very slender and frail build, pale delicate oval face, thin arched eyebrows, sorrowful expressive eyes often with tears, long straight black hair loosely tied with silk ribbon, wearing Qing Dynasty-style light pink and white flowing robes with floral embroidery, melancholic poetic aura] [Jia Baoyu: young Chinese man in his teens, handsome fair-skinned face, bright lively eyes, wearing Qing Dynasty nobleman red silk robe with jade pendant necklace, playful yet sensitive temperament]"

Panel imagePrompt:
"[Lin Daiyu: young Chinese woman in her late teens, very slender and frail build, pale delicate oval face, thin arched eyebrows, sorrowful expressive eyes often with tears, long straight black hair loosely tied with silk ribbon, wearing Qing Dynasty-style light pink and white flowing robes with floral embroidery, melancholic poetic aura] sitting alone under a blossoming peach tree, burying fallen petals with a small garden hoe, tears streaming down her face, autumn leaves falling around her, traditional Chinese garden with pavilion in background, soft warm sunset light, ${style} style, cinematic composition, NO Japanese text, absolutely no visible text, text-free image"

## 图像规格
所有 imagePrompt 必须在末尾添加：", ${style} style, cinematic composition, NO Japanese text, NO Korean text, absolutely no visible text, no captions, no labels, no watermarks, text-free image"

## 输出格式
请严格按以下 JSON 格式输出，不要添加任何其他内容：
{
  "title": "场景漫画标题（中文，简短有吸引力）",
  "topic": "${content.slice(0, 50)}...",
  "style": "${style}",
  "characterDescription": "[角色1: 40-60词完整外观描述] [角色2: 40-60词完整外观描述]",
  "seed": ${Math.floor(Math.random() * 1000000)},
  "panels": [
    {
      "id": 1,
      "scene": "场景描述（简短中文，如：林中初遇、对决、告别等）",
      "dialogue": "原文对话或叙述精华（中文，保持原文风格）",
      "imagePrompt": "[完整复制该格出现角色的 characterDescription] + 具体动作、场景、构图、光影, ${style} style, cinematic composition, absolutely no visible text, text-free image"
    }
  ]
}

## 创作原则
1. **忠于原著**：场景还原以原文描写为准，不过度演绎
2. **选景精准**：挑选最具视觉表现力的场景，避免平淡过渡
3. **角色统一**：同一角色在所有格中外观描述完全一致
4. **对话精炼**：保留原文最精华的对白或叙述
5. **构图多样**：远景建立环境 → 中景交代关系 → 特写表现情感
6. **氛围营造**：通过光影、天气、色调传达情绪
7. **语言纯净**：imagePrompt 只能是英文

请开始创作：`;
}

/** 解析小说脚本响应 */
export function parseNovelResponse(response: string): ComicScript | null {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const script = JSON.parse(jsonMatch[0]) as ComicScript & {
      characterDescription?: string;
    };

    if (!script.title || !script.panels || !Array.isArray(script.panels)) {
      return null;
    }

    const characterDesc = script.characterDescription || "";

    script.panels = script.panels.map((panel, index) => {
      let imagePrompt = panel.imagePrompt || "";
      let dialogue = panel.dialogue || "";

      // 清理对话中的角色前缀标注（如"旁白："、"(独白)"等）
      dialogue = dialogue.replace(/^(旁白|教授|导师|解说员|讲解员|老师|narrator)[/／]?[^：:]*[：:]\s*/i, "");
      dialogue = dialogue.replace(/^\(?(独白|旁白|内心独白)\)?\s*[：:]?\s*/i, "");

      // 强制注入角色描述到开头（不依赖 LLM 遵守规则）
      if (characterDesc) {
        const cleanPrompt = imagePrompt.replace(/^\[.*?\]\s*/g, "");
        imagePrompt = `${characterDesc} ${cleanPrompt}`;
      }

      // 确保末尾有语言限制和无文字标记
      if (!imagePrompt.includes("no visible text")) {
        imagePrompt = imagePrompt.replace(/,?\s*$/, ", NO Japanese text, NO Korean text, absolutely no visible text, no captions, no labels, no watermarks, text-free image");
      }

      // 清理非英文字符
      imagePrompt = cleanNonEnglishFromPrompt(imagePrompt);

      return {
        ...panel,
        id: panel.id || index + 1,
        dialogue,
        imagePrompt,
        status: "pending" as const,
      };
    });

    return script;
  } catch {
    return null;
  }
}

/** 清理 imagePrompt 中的非英文字符 */
function cleanNonEnglishFromPrompt(prompt: string): string {
  return prompt
    .replace(/[\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
