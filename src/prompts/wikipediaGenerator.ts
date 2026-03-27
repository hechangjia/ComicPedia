import { ComicScript, ComicStyle, FactPack, NarrativeOutline, WikipediaContent } from "../lib/types";
import { getStyleGuidanceForLLM } from "../lib/config/styles";
import { parseScriptResponse } from "./scriptGenerator";
import { buildOutlineGuidance } from "../lib/director";

/** 信息图类风格（适合图示化、布局化表达） */
const INFOGRAPHIC_STYLES = new Set<ComicStyle>(["flat", "infographic", "banana"]);

/**
 * 根据风格类型生成差异化的 imagePrompt 指导。
 * 信息图类风格强调布局、图标、连接线、颜色语义；
 * 叙事类风格强调场景、角色、构图、光影。
 */
function getImagePromptGuidance(style: ComicStyle): string {
  if (INFOGRAPHIC_STYLES.has(style)) {
    return `### imagePrompt 写作规范（信息图风格）

每格 imagePrompt 必须采用**空间布局式描述**，明确指定每个元素的位置和视觉层级：

1. **整体布局**：指定画面结构（如 split layout, radial diagram, linear flow, grid cards）
2. **区域分配**：明确 TOP / LEFT / CENTER / RIGHT / BOTTOM 各区域内容
3. **图标系统**：使用简单图标承载概念（如 lightbulb for ideas, gear for mechanism, arrow for flow, magnifying glass for detail）
4. **连接与导引**：用箭头、编号、连线引导阅读顺序
5. **颜色语义**：红色=问题/警告，绿色=解决/成果，蓝色=技术/概念，黄色=提示/补充
6. **留白控制**：保持大量留白，不要塞满画面，视觉层级清晰

示例 imagePrompt：
"hand-drawn infographic layout on white background, TOP: large title icon with brain symbol, LEFT AREA: three problem icons in red (question marks, warning triangles), CENTER: large right-pointing arrow connecting problems to solutions, RIGHT AREA: three solution icons in green (checkmarks, gears), BOTTOM: key result summary in yellow highlight box, simple doodle style icons, extensive whitespace, ${style} style, text-free image, no watermark"`;
  }

  return `### imagePrompt 写作规范（叙事风格）

每格 imagePrompt 必须采用**标签式格式**，包含以下要素：

1. **角色描述**：完整的 characterDescription（如有，放开头）
2. **动作/姿态**：具体描述（如 pointing at holographic display, examining specimen, presenting to audience）
3. **场景环境**：具体背景（如 modern laboratory, ancient library, cosmic nebula background）
4. **视觉化概念**：用视觉元素表达知识点（如 glowing diagram, floating particles, translucent overlay showing internal structure）
5. **镜头构图**：交替使用 wide shot / medium shot / close-up / bird's eye view
6. **光照氛围**：warm golden light / cool blue ambient / dramatic rim lighting / soft diffused light

示例 imagePrompt：
"[Professor Chen: middle-aged Chinese scientist in his 40s, wearing white lab coat with glasses, friendly expression] standing in modern AI research lab, pointing at holographic neural network visualization floating in air, glowing blue nodes connected by light beams, multiple computer screens in background showing data, medium shot, warm overhead laboratory lighting, ${style} style, text-free image, no watermark"`;
}

function buildFactPackSection(factPack?: FactPack): string {
  if (!factPack) return "";

  return `
## Fact Pack（必须遵守）
- Hard facts:
${factPack.hardFacts.map((fact) => `- [${fact.claimType}] ${fact.subject} / ${fact.predicate} / ${fact.object}`).join("\n") || "- none"}
- Soft facts:
${factPack.softFacts.map((fact) => `- ${fact.summary}`).join("\n") || "- none"}
- Coverage gaps:
${factPack.coverageGaps.map((gap) => `- ${gap.reason}`).join("\n") || "- none"}

规则：
- hard facts 是必须保真的事实锚点
- soft facts 可以用于解释，但不能偏离 hard facts
- coverage gaps 标记了 unsupported hard detail 的边界，不要越界补写
`;
}

/**
 * Wikipedia 百科漫画 Prompt 生成器
 * 基于 Wikipedia 结构化内容，生成信息准确、教育性强的科普漫画分镜脚本。
 */
export function buildWikipediaPrompt(
  content: WikipediaContent,
  style: ComicStyle,
  panelCount?: number,
  allowGuideCharacter: boolean = true,
  narrativeOutline?: NarrativeOutline,
  factPack?: FactPack,
): string {
  const panelGuidance = panelCount && panelCount > 0
    ? `规划${panelCount}格分镜，如需微调可在±2格范围内调整。`
    : "自行选择最合适的分镜数量（通常6-10格），以把关键知识逐步讲清楚为最高优先。";

  const sectionsHint = content.sections?.length
    ? `\n### 文章章节结构\n${content.sections.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
    : "";

  const imageGuidance = getImagePromptGuidance(style);
  const isInfoStyle = INFOGRAPHIC_STYLES.has(style);
  const factPackSection = buildFactPackSection(factPack);
  const narrativeBeatPlanSection = narrativeOutline
    ? `
## Narrative Beat Plan（必须遵守）
${buildOutlineGuidance(narrativeOutline)}

额外要求：
- 必须遵守 templateType、beatRole、knowledgeGoal、shotIntent、intensity、carryForward
- 开场应体现钩子，而不是直接退回词条式定义
- 至少保留一次 hook-closeup 或 contrast 作为强镜头变化
- 最后一格优先做 reveal 或 aftermath，避免平铺式收尾
`
    : "";

  return `你是一位专业的百科科普漫画编剧，擅长将 Wikipedia 百科知识转化为生动有趣的漫画分镜。

## 百科词条
标题：${content.title}
语言：${content.lang === "zh" ? "中文" : content.lang === "en" ? "英文" : content.lang}

### 百科内容（权威知识源，必须基于此内容创作）
${content.extract}
${sectionsHint}

## 风格要求
${getStyleGuidanceForLLM(style)}

## 分镜数量
${panelGuidance}
${narrativeBeatPlanSection}
${factPackSection}

## ⚠️ 语言限制（必须严格遵守）

1. **imagePrompt 必须是纯英文**，禁止任何非 ASCII 字符
2. **即使选择"manga"或"inkwash"风格，也不能输出日文/韩文**
3. 对话(dialogue)和场景(scene)使用**简体中文**

## ⚠️ imagePrompt 禁止包含任何文字相关元素

以下词汇**绝对禁止**出现在 imagePrompt 中：
- speech bubble, dialogue bubble, text bubble, caption, label, subtitle
- writing, handwriting, calligraphy, narration, text overlay
- "saying...", "text reading...", "words..."

正确做法：用**纯视觉元素**表达概念：
- glowing arrows, floating diagram, holographic display, color-coded pathways
- split-screen comparison, magnifying glass revealing structure
- particle effects, energy beams, translucent overlay

## 创作原则

### 1. 信息准确性（最高优先级）
- 所有知识点必须忠实于上述百科内容，不得编造或夸大
- 数据、年份、人名等事实性信息必须准确引用
- 如果百科内容不够详细，只展示已确认的信息，不要补充推测

### 2. 教育性叙事
- 第 1-2 格：用生活化场景或历史事件引入话题，激发读者兴趣
- 中间格：逐步深入核心知识，每格一个子概念
- 最后 1-2 格：总结要点或展示实际应用/影响
- 每格对白必须传递**实质性知识点**，禁止空泛表述（如"这很神奇"、"让我们看看"）

### 3. 可视化转化
- 将抽象概念转化为具象的视觉场景
- 善用类比、拟人、图示等手段
- 复杂流程用多格拆解，每格一步
${isInfoStyle ? "- 信息图风格：多用图标、箭头、分区布局表达知识结构" : "- 叙事风格：通过角色动作和场景变化推进知识讲解"}

### 4. 角色设计
${isInfoStyle
    ? `- 信息图风格可以不使用角色，characterDescription 设为空字符串 ""
- 画面聚焦于图标、图示、流程图等可视化元素
- 也可以使用简笔画小人(stick figure)作为引导元素`
    : allowGuideCharacter
      ? `- 可以使用"百科讲解员"或"知识探索者"作为引导角色
- 也可以用相关的历史人物、科学家作为叙事主角
- characterDescription 使用英文描述外观特征（40-60词）
- 每格 imagePrompt 以完整 characterDescription 开头`
      : `- 禁止额外添加百科讲解员、知识探索者、旁白角色等泛化引导人物
- 优先使用词条相关的真实人物、历史角色或题材原生人物
- 如果词条更适合纯知识图解，则 characterDescription 设为空字符串 ""
- 每格 imagePrompt 只允许出现题材相关角色，不能凭空新增 explorer / narrator / guide` }

${imageGuidance}

## 输出格式
严格返回以下 JSON 格式（不要包含其他文字）：

\`\`\`json
{
  "title": "漫画标题（中文，简洁有趣）",
  "topic": "${content.title}",
  "style": "${style}",
  "characterDescription": "${isInfoStyle ? '可为空字符串，或简笔画角色描述' : '[角色名: 40-60词英文外观描述]'}",
  "seed": ${Math.floor(Math.random() * 1000000)},
  "panels": [
    {
      "id": 1,
      "scene": "中文场景描述（供读者理解画面内容）",
      "dialogue": "中文对白/旁白（传递具体知识点，口语化）",
      "imagePrompt": "详细英文画面描述，包含角色+场景+视觉概念+构图+光照, ${style} style, text-free image, no watermark"
    }
  ]
}
\`\`\`

## 关键约束
- dialogue 使用简体中文，imagePrompt 使用纯英文
- 每格 imagePrompt 必须包含完整的角色外观描述（如有角色）
- imagePrompt 末尾加 "${style} style, text-free image, no watermark"
- JSON 必须合法，不要有尾逗号
- 构图须多样：交替使用远景、中景、特写等不同镜头`;
}

/**
 * 解析 Wikipedia 漫画脚本响应
 * 复用 scriptGenerator 的解析逻辑
 */
export function parseWikipediaResponse(response: string): ComicScript | null {
  return parseScriptResponse(response);
}
