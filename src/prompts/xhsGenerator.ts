import { ComicScript, ComicStyle } from "../lib/types";
import { getStyleGuidanceForLLM } from "../lib/config/styles";
import { extractJSON } from "./scriptGenerator";

/** 构建小红书图文分镜脚本 Prompt */
export function buildXhsPrompt(
  topic: string,
  style: ComicStyle,
  panelCount?: number,
): string {
  const panelGuidance = panelCount && panelCount > 0
    ? `规划${panelCount}张图片，如为保证内容完整可在±1张范围内微调。`
    : "自行选择最合适的图片数量（通常4-8张），以把核心内容讲清楚为最高优先。";

  return `你是一位专业的小红书图文创作者。请根据以下内容创作小红书风格的图文分镜脚本。

## 内容
${topic}

## 风格要求
${getStyleGuidanceForLLM(style)}

## 图片数量
${panelGuidance}

## ⚠️ 语言限制（极其重要！必须严格遵守！）

1. **禁止使用日文、韩文、阿拉伯文等任何非中英文字符**
2. **imagePrompt 必须是纯英文**
3. 对话(dialogue)和场景(scene)使用**简体中文**

## 小红书内容创作原则

### 内容分析
自动判断内容类型：种草安利 / 干货分享 / 个人故事 / 测评对比 / 教程步骤 / 避坑指南 / 清单合集

### Hook 设计（封面图极其重要）
- 使用吸引眼球的标题钩子：数字钩子、痛点钩子、好奇钩子、利益钩子
- 封面图必须是最有视觉冲击力的一张

### Swipe Flow 设计（划动流设计）
按以下结构组织内容：
1. **封面（第1张）**：最强视觉冲击 + 核心标题，信息量少但冲击力大
2. **铺垫（第2张）**：痛点共鸣 / 建立好奇心
3. **核心（中间几张）**：每张1-2个要点，是干货价值的主体
4. **收获/结尾（最后1张）**：总结 + CTA + 互动引导（如"你觉得呢？""评论区分享你的经历"）

### 视觉设计要求
- 每张图都是独立的信息图/卡片，手绘卡通风格
- 文字精炼（每张图的核心文字控制在1-6个词/短句）
- 大量留白，视觉层次清晰
- 关键词使用圈圈、下划线、箭头、星星等手绘强调
- 可使用小图标、简笔画角色、表情符号增强表达

## 角色一致性要求

### 步骤 1：视觉主体设计
设计贯穿所有图片的视觉主体（可以是简笔画角色、图标、吉祥物等），确保风格统一。

### 步骤 2：统一描述（characterDescription 字段）
将视觉主体的描述写入 characterDescription 字段。

### 步骤 3：每张图必须包含统一视觉元素
每个 panel 的 imagePrompt 必须包含统一的视觉主体描述。

## 输出格式
请严格按以下 JSON 格式输出，不要添加任何其他内容：
{
  "title": "小红书标题（简短有吸引力，中文，可用emoji）",
  "topic": "${topic}",
  "style": "${style}",
  "characterDescription": "视觉主体的统一描述（英文）",
  "seed": ${Math.floor(Math.random() * 1000000)},
  "panels": [
    {
      "id": 1,
      "scene": "这张图的主题/位置（简短中文，如：封面、要点1、总结等）",
      "dialogue": "图片上的核心文案（中文，口语化，适合小红书阅读习惯）",
      "imagePrompt": "完整视觉主体描述 + 画面内容（纯英文，信息图风格）"
    }
  ]
}

## 创作原则
1. **平台适配**：内容风格符合小红书用户习惯，轻松、实用、有共鸣
2. **信息密度**：每张图信息量适中，不贪多，宁可多分几张
3. **视觉吸引**：封面图决定90%的点击率，必须最用心
4. **互动设计**：结尾引导评论、收藏、分享
5. **语言纯净**：imagePrompt 只能是英文
6. **风格统一**：所有图片保持一致的视觉语言

请开始创作：`;
}

/** 解析小红书脚本响应 */
export function parseXhsResponse(response: string): ComicScript | null {
  try {
    const parsed = extractJSON(response);
    if (!parsed || typeof parsed !== "object") return null;

    const script = parsed as ComicScript & {
      characterDescription?: string;
    };

    if (!script.title || !script.panels || !Array.isArray(script.panels)) {
      return null;
    }

    const characterDesc = script.characterDescription || "";

    script.panels = script.panels.map((panel, index) => {
      let imagePrompt = panel.imagePrompt || "";
      const dialogue = panel.dialogue || panel.scene || "";

      // 角色/视觉主体注入（小红书的 characterDescription 通常是视觉主体如图标/吉祥物）
      if (characterDesc) {
        const hasCharTag = /\[[\w\s\-'\.]+:/.test(imagePrompt);
        if (!hasCharTag && !imagePrompt.includes(characterDesc.slice(0, 20))) {
          imagePrompt = `${characterDesc} ${imagePrompt}`;
        }
      }

      // 确保无文字标记
      if (!imagePrompt.includes("text-free")) {
        imagePrompt = imagePrompt.replace(/,?\s*$/, ", text-free image, no watermark");
      }

      return {
        ...panel,
        id: index + 1,
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
