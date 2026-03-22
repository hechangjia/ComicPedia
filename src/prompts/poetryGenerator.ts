import { ComicScript, ComicStyle } from "../lib/types";
import { getStyleGuidanceForLLM } from "../lib/config/styles";
import { extractJSON } from "./scriptGenerator";

/** 诗词体裁 */
export type PoetryGenre =
  | "shi"      // 诗（唐诗、古诗）
  | "ci"       // 词（宋词）
  | "qu"       // 曲（元曲）
  | "modern"   // 现代诗
  | "novel";   // 经典小说片段

/** 诗词元信息 */
export interface PoetryMeta {
  author?: string;      // 作者名
  era?: string;         // 时代（如：唐代、宋代、近现代、当代）
  title?: string;       // 作品名
}

/** 著名诗人/历史人物的标准形象描述 */
const FAMOUS_POETS: Record<string, string> = {
  // ─── 唐代 ───
  "李白": "Li Bai: middle-aged Chinese poet in his 40s, tall and slender build, handsome face with free-spirited expression, long flowing black hair partially tied up with a simple cloth, wearing Tang Dynasty white scholar robe with wide flowing sleeves, often depicted with a wine flask at his side, romantic and carefree aura",
  "杜甫": "Du Fu: elderly Chinese poet in his 50s-60s, thin and weathered appearance, gaunt face showing years of hardship, sparse gray beard, wearing worn Tang Dynasty scholar robe in muted brown or gray, melancholic yet dignified expression, leaning on a walking stick",
  "白居易": "Bai Juyi: middle-aged Chinese official-poet, round friendly face, neat black beard, wearing Tang Dynasty official robe in purple or crimson, black official hat, scholarly and warm demeanor",
  "王维": "Wang Wei: middle-aged Chinese poet-painter, refined elegant appearance, peaceful serene expression, neat black hair in traditional topknot, wearing Tang Dynasty scholar robe in natural earth tones, often depicted in mountain landscape setting, contemplative Buddhist aura",
  "李商隐": "Li Shangyin: young Chinese poet in his 30s, handsome refined features, slightly melancholic expression, neat black hair in Tang Dynasty topknot, wearing dark-colored Tang Dynasty scholar robe, literary and romantic temperament",
  "王昌龄": "Wang Changling: middle-aged Chinese frontier poet, weathered yet noble face, determined gaze, wearing Tang Dynasty military-style robe or border garrison clothing, heroic and patriotic bearing",

  // ─── 宋代 ───
  "苏轼": "Su Shi (Su Dongpo): middle-aged Chinese scholar in his 40s-50s, slightly plump build, full rounded face with gentle expression, long black beard, wearing Song Dynasty scholar robe in dark blue or gray with round collar, black official hat, dignified yet approachable demeanor",
  "辛弃疾": "Xin Qiji: middle-aged Chinese warrior-poet, strong muscular build, fierce determined expression, short black beard, wearing Song Dynasty military-style robe or armor elements, heroic and passionate demeanor",
  "李清照": "Li Qingzhao: elegant Chinese woman in her 30s-40s, delicate beautiful features, melancholic gentle expression, traditional Song Dynasty women hairstyle with hair ornaments, wearing flowing Song Dynasty women dress in soft pastel colors, refined scholarly lady",
  "陆游": "Lu You: elderly Chinese poet in his 60s-70s, thin scholarly build, long white beard, sorrowful patriotic expression, wearing Southern Song Dynasty scholar robe, often depicted with a sword symbolizing his military aspirations",
  "柳永": "Liu Yong: young-to-middle-aged Chinese poet, handsome romantic appearance, slightly melancholic expression, wearing Song Dynasty scholar robe, often associated with lantern-lit scenes and courtyard settings",
  "岳飞": "Yue Fei: young Chinese general in his 30s, strong heroic build, determined fierce expression, wearing Song Dynasty military armor with red cape, holding weapon, patriotic warrior image",
  "范仲淹": "Fan Zhongyan: middle-aged Chinese statesman-scholar in his 50s, dignified stern face, long black beard, wearing Song Dynasty dark official robe with round collar, black official hat, solemn patriotic bearing",

  // ─── 元代 ───
  "马致远": "Ma Zhiyuan: middle-aged Chinese playwright-poet in his 40s-50s, thin scholarly build, weathered melancholic face, sparse beard, wearing Yuan Dynasty plain scholar robe in muted earth tones, simple cloth headwrap, lonely wanderer appearance with contemplative expression",

  // ─── 明清 ───
  "纳兰性德": "Nalan Xingde: young Manchu nobleman in his 20s, handsome refined features, melancholic gentle expression, wearing Qing Dynasty nobleman robe with Manchu-style collar, elegant and sorrowful temperament",
  "曹雪芹": "Cao Xueqin: middle-aged Chinese writer in his 40s, thin build showing poverty, intelligent melancholic eyes, sparse beard, wearing worn Qing Dynasty scholar robe, artistic and melancholic aura",

  // ─── 近现代 ───
  "毛泽东": "Mao Zedong: middle-aged Chinese leader in his 50s, tall and sturdy build, broad round face with prominent mole on left chin, thick black hair combed back, wearing gray-green Zhongshan suit (Mao suit) with stand-up collar and four front pockets, dignified commanding presence with calm confident expression",
  "鲁迅": "Lu Xun: middle-aged Chinese writer in his 40s-50s, thin wiry build, distinctive short bristly black hair standing upright (crew cut), thick dark mustache, sharp penetrating eyes, wearing dark Chinese-style long gown (changpao) or dark Western suit, stern serious expression with intellectual intensity",
  "毛主席": "Mao Zedong: middle-aged Chinese leader in his 50s, tall and sturdy build, broad round face with prominent mole on left chin, thick black hair combed back, wearing gray-green Zhongshan suit (Mao suit) with stand-up collar and four front pockets, dignified commanding presence with calm confident expression",

  // ─── 当代 ───
  "顾城": "Gu Cheng: young Chinese poet in his 20s-30s, thin pale build, childlike innocent face, distinctive tall cylindrical denim hat on head, wearing simple casual clothing like a plain dark jacket, dreamy introspective expression with large gentle eyes",
  "海子": "Hai Zi: young Chinese poet in his 20s, thin build, round face with honest peasant features, short black hair, wearing simple 1980s-style Chinese casual clothing like a plain jacket, pure earnest expression with a hint of melancholy",
  "余光中": "Yu Guangzhong: elderly Chinese poet in his 60s-70s, thin scholarly build, receding gray hair, wearing modern Western suit or Chinese-style jacket, gentle nostalgic expression, refined intellectual demeanor",
  "北岛": "Bei Dao: middle-aged Chinese poet in his 40s-50s, medium build, angular intellectual face, short black hair, wearing simple dark clothing or casual Western attire, serious contemplative expression with rebellious spirit",
};

/** 朝代服饰指南 */
const ERA_COSTUME_GUIDE: Record<string, string> = {
  "先秦": "Pre-Qin costume: deep robe (shenyi) with wide sleeves, cross-collar wrapping to the right, knee-length garments tied with sash, jade pendants, simple natural colors",
  "汉代": "Han Dynasty costume: flowing shenyi deep robe or cross-collar ruqun, wide sleeves, sash belt, men wear guan (cap), women wear elaborate hair buns, rich red and black colors",
  "魏晋南北朝": "Wei-Jin costume: loose flowing wide-sleeved robes, open chest informal style for scholars, tall pointed caps, emphasis on elegance and freedom, natural earth tones",
  "唐代": "Tang Dynasty costume: wide-sleeved robes, cross-collar design, men wear futou headwear, women wear high-waisted ruqun, vibrant colors like red, purple, green",
  "宋代": "Song Dynasty costume: more restrained elegant style, men wear lanshan scholar robe with round collar, futou official hat, women wear beizi jacket over long skirt, muted refined colors",
  "元代": "Yuan Dynasty costume: Mongol influence, men may wear zhisunfu or traditional Chinese robes, distinctive headwear, mix of nomadic and Chinese elements",
  "明代": "Ming Dynasty costume: zhiduo or daopao for scholars, wusha mao black gauze cap for officials, women wear aoqun, more structured formal styles",
  "清代": "Qing Dynasty costume: changpao magua for men, qizhuang for women, distinctive Manchu-style collars and cuts, queue hairstyle for men",
  "近现代": "Modern era (1840s-1949): Zhongshan suit (Mao suit) with stand-up collar and four pockets, changpao long gown, Western suits, student uniforms, mix of Chinese and Western styles",
  "当代": "Contemporary (1949-present): modern casual or formal clothing, suits, casual wear, no traditional costume unless specifically themed",
};

/** 模糊匹配时代名称（处理 "近现代（1840-1949）" 等带括号的 key） */
function matchEraCostume(era: string): string {
  // 先精确匹配
  if (ERA_COSTUME_GUIDE[era]) return ERA_COSTUME_GUIDE[era];
  // 再用前缀匹配（去括号）
  const prefix = era.replace(/[（(].*$/, "").trim();
  if (ERA_COSTUME_GUIDE[prefix]) return ERA_COSTUME_GUIDE[prefix];
  // 遍历 key 做包含匹配
  for (const [key, val] of Object.entries(ERA_COSTUME_GUIDE)) {
    if (era.includes(key) || key.includes(prefix)) return val;
  }
  return "";
}

/** 诗词分镜脚本生成 Prompt 模板 */
export function buildPoetryPrompt(
  content: string,
  genre: PoetryGenre,
  style: ComicStyle,
  panelCount?: number,
  meta?: PoetryMeta
): string {
  const genreDescriptions: Record<PoetryGenre, string> = {
    shi: "古诗/唐诗，意境深远，讲究起承转合",
    ci: "词，婉约豪放并存，情感细腻",
    qu: "元曲，生动活泼，戏剧性强",
    modern: "现代诗歌，意象自由，情感直接",
    novel: "经典小说片段，叙事性强，人物鲜明",
  };

  const panelGuidance = panelCount && panelCount > 0
    ? `规划${panelCount}格分镜，每格对应诗词的一个意象或情节转折。`
    : "根据诗词内容自行决定分镜数量（通常4-8格），每格捕捉一个关键意象或情感节点。";

  // 获取著名诗人的标准形象描述
  const authorName = meta?.author || "";
  const knownPoetDescription = FAMOUS_POETS[authorName] || "";

  // 获取时代服饰指南（使用模糊匹配）
  const eraName = meta?.era || "";
  const eraCostumeGuide = matchEraCostume(eraName);

  // 时代背景描述
  const eraDescription = meta?.era
    ? `作者所处时代：${meta.era}。人物服饰、发型、环境必须严格符合该时代特征。`
    : "";

  const authorDescription = meta?.author
    ? `作者：${meta.author}。如作品中出现作者本人形象，必须符合其真实历史形象和时代背景。`
    : "";

  return `你是一位精通中国文学与历史的漫画编剧。请将以下诗词/文学作品转化为视觉分镜脚本。

## 原文
${content}

${meta?.title ? `## 作品名\n${meta.title}\n` : ""}
${authorDescription ? `## 作者信息\n${authorDescription}\n` : ""}
${eraDescription ? `## 时代背景\n${eraDescription}\n` : ""}

## 体裁
${genreDescriptions[genre]}

## 画面风格
${getStyleGuidanceForLLM(style)}

## 分镜规划
${panelGuidance}

## ⚠️ 语言限制（极其重要！必须严格遵守！）

本项目仅面向**中文和英文**用户。所有输出必须遵守：

1. **禁止使用日文、韩文、阿拉伯文等任何非中英文字符**
2. **imagePrompt 必须是纯英文**，不能包含任何日文假名
3. **即使选择"manga"或"inkwash"风格，也不能输出日文**
4. 对话(dialogue)和场景(scene)使用**简体中文**
5. 图片中如需文字，指定为英文或中文拼音

## ⚠️ 历史人物形象一致性（极其重要！）

${knownPoetDescription ? `### 主角标准形象（必须严格遵循）
**${authorName}的历史形象**：
${knownPoetDescription}

你必须在 characterDescription 中使用上述描述，并且**每一格**的 imagePrompt 都必须**完整复制**这段描述。
` : ""}

${eraCostumeGuide ? `### 时代服饰参考
${eraCostumeGuide}
` : ""}

### 角色一致性规则（所有格必须遵守）

1. **characterDescription 字段必须包含完整的主角外观描述**（40-60词）：
   - 准确的年龄段（如 in his 40s-50s）
   - 体型特征（如 slightly plump build, tall slender）
   - 面部特征（如 full rounded face, long black beard）
   - 服饰细节（必须符合时代！如 Song Dynasty scholar robe in dark blue）
   - 配饰（如 black official hat, jade pendant）
   - 气质神态（如 dignified yet melancholic expression）

2. **每格 imagePrompt 必须以完整的 characterDescription 开头**
   - 一字不差地复制，禁止省略或同义词替换
   - 格式：[角色名: 完整描述] + 该格的动作和场景

3. **服饰和年龄必须全程一致**
   - 第一格到最后一格，角色的服装颜色、款式、年龄外貌必须完全相同
   - 不能出现"年轻版"或"老年版"的变化（除非诗词明确描述时间跨度）

### 示例（以苏轼《念奴娇·赤壁怀古》为例）

characterDescription:
"[Su Shi: middle-aged Chinese scholar in his 40s, slightly plump build, full rounded face with gentle melancholic expression, long black beard, wearing Song Dynasty dark blue scholar robe with round collar, black official hat, dignified contemplative demeanor]"

Panel 1 imagePrompt:
"[Su Shi: middle-aged Chinese scholar in his 40s, slightly plump build, full rounded face with gentle melancholic expression, long black beard, wearing Song Dynasty dark blue scholar robe with round collar, black official hat, dignified contemplative demeanor] standing on cliff overlooking Yangtze River at Red Cliff, dramatic sunset sky, ancient Chinese landscape, wide shot, ${style} style, cinematic composition"

Panel 2 imagePrompt:
"[Su Shi: middle-aged Chinese scholar in his 40s, slightly plump build, full rounded face with gentle melancholic expression, long black beard, wearing Song Dynasty dark blue scholar robe with round collar, black official hat, dignified contemplative demeanor] gazing at turbulent waves crashing against rocks, windswept robes, thoughtful expression, medium shot, ${style} style, dramatic lighting"

## 图像规格
所有 imagePrompt 必须在末尾添加：", ${style} style, cinematic composition, NO Japanese text, NO Korean text, NO Arabic text, absolutely no visible text, no captions, no labels, no titles, no watermarks, no subtitles, text-free image"

## 语言与输出要求
- title、scene、dialogue 使用简体中文
- dialogue 直接引用原文诗句或简短场景描述，禁止添加"(独白)"、"(旁白)"等标注
- imagePrompt 必须使用**纯英文**（禁止日文、韩文）
- 请严格按以下 JSON 格式输出：

{
  "title": "作品名（中文）",
  "topic": "${content.slice(0, 50)}...",
  "style": "${style}",
  "originalText": "完整原文",
  "author": "${meta?.author || "作者"}",
  "era": "${meta?.era || "时代"}",
  "characterDescription": "[主角名: 40-60词的完整外观描述，必须包含年龄、体型、面部、服饰、气质]",
  "panels": [
    {
      "id": 1,
      "scene": "场景描述（简短中文）",
      "dialogue": "对话/旁白/诗句引用（中文）",
      "imagePrompt": "[完整复制 characterDescription], [具体动作], [场景环境], [光影氛围], ${style} style, cinematic composition, absolutely no visible text, text-free image"
    }
  ]
}

请开始创作：`;
}

/** 解析诗词脚本响应 */
export function parsePoetryResponse(response: string): ComicScript | null {
  try {
    const parsed = extractJSON(response);
    if (!parsed || typeof parsed !== "object") return null;

    const script = parsed as ComicScript & {
      originalText?: string;
      author?: string;
      characterDescription?: string;
    };

    if (!script.title || !script.panels || !Array.isArray(script.panels)) {
      return null;
    }

    const characterDesc = script.characterDescription || "";

    script.panels = script.panels.map((panel, index) => {
      let imagePrompt = panel.imagePrompt || "";

      // 角色描述处理：保留 LLM 写的 per-panel 角色标签
      if (characterDesc) {
        const hasPerPanelCharTags = /\[[\w\s\-'\.]+:/.test(imagePrompt);
        if (!hasPerPanelCharTags) {
          const cleanPrompt = imagePrompt.replace(/^\[.*?\]\s*/g, "");
          imagePrompt = `${characterDesc} ${cleanPrompt}`;
        }
      }

      // 确保末尾有无文字标记（精简版，详细反文字交给 negative_prompt）
      if (!imagePrompt.includes("text-free")) {
        imagePrompt = imagePrompt.replace(/,?\s*$/, ", text-free image, no watermark");
      }

      // 注：CJK 字符清理已移至 promptEnhancer（生图前处理）

      return {
        ...panel,
        id: panel.id || index + 1,
        imagePrompt,
        status: "pending" as const,
      };
    });

    return script;
  } catch {
    return null;
  }
}

/** 清理 imagePrompt 中的非英文字符（保留 ASCII + Latin Extended，移除 CJK/日文/韩文） */
function cleanNonEnglishFromPrompt(prompt: string): string {
  // 移除日文假名（\u3040-\u309F \u30A0-\u30FF）、韩文（\uAC00-\uD7AF）
  // 移除 CJK 统一汉字（\u4E00-\u9FFF）——imagePrompt 应为纯英文
  // 保留 ASCII（\x00-\x7F）和 Latin Extended（\u00C0-\u024F）用于拼音等
  return prompt
    .replace(/[\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 诗词风格推荐 */
export function getRecommendedStyles(genre: PoetryGenre): ComicStyle[] {
  const recommendations: Record<PoetryGenre, ComicStyle[]> = {
    shi: ["inkwash", "watercolor", "sketch"],
    ci: ["inkwash", "watercolor", "anime"],
    qu: ["inkwash", "cartoon", "chibi"],
    modern: ["watercolor", "sketch", "anime"],
    novel: ["inkwash", "manga", "realistic"],
  };
  return recommendations[genre];
}
