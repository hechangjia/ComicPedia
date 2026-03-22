/**
 * 统一的 imagePrompt 增强器 + 参考图合并。
 * panelManager（单面板重生）和 taskLifecycle（全量生成）共享此逻辑。
 */

import { ComicStyle, PartialImageGenConfig } from "@/lib/types";
import { STYLE_META } from "@/lib/config/styles";

/** 增强日志：记录每一层做了什么修改 */
export interface EnhancementLog {
  original: string;
  enhanced: string;
  layers: {
    name: string;
    action: string;
  }[];
}

/** 构图关键词列表 */
const COMPOSITION_KEYWORDS = [
  "wide shot", "medium shot", "close-up", "close up", "closeup",
  "bird's eye", "birds eye", "aerial", "overhead",
  "low angle", "high angle", "eye level",
  "over the shoulder", "portrait", "full body",
  "establishing shot", "panoramic", "macro",
];

/** 光影关键词列表 */
const LIGHTING_KEYWORDS = [
  "lighting", "light", "backlight", "rim light", "ambient",
  "dramatic", "soft light", "golden hour", "sunset",
  "neon", "volumetric", "chiaroscuro", "silhouette",
];

/** 风格专属默认光照 */
const STYLE_DEFAULT_LIGHTING: Record<string, string> = {
  watercolor: "soft diffused natural light",
  inkwash: "atmospheric misty light",
  sketch: "directional cross-lighting with clear shadows",
  realistic: "cinematic volumetric lighting with rim light",
  anime: "bright anime-style lighting with soft highlights",
  manga: "high contrast dramatic lighting",
  chibi: "soft even pastel lighting",
  pixel: "flat retro game lighting",
  cartoon: "bright saturated cartoon lighting",
  flat: "clean even studio lighting",
  infographic: "clean bright studio lighting",
  banana: "warm soft crayon-style lighting",
};

/** 从风格 negativePrompt 中提取需要移除的矛盾词 */
function getConflictingTerms(style: ComicStyle): string[] {
  const neg = STYLE_META[style]?.negativePrompt ?? "";
  return neg.split(",").map(s => s.trim().toLowerCase()).filter(s => s.length > 3);
}

/**
 * 根据面板在叙事弧中的位置，返回最佳默认构图。
 */
function getStoryArcComposition(panelIndex: number, totalPanels: number): string {
  if (totalPanels <= 1) return "medium shot";
  const position = panelIndex / (totalPanels - 1);
  if (position < 0.15) return "establishing wide shot";
  if (position < 0.35) return "medium shot";
  if (position < 0.55) return "close-up detail shot";
  if (position < 0.75) return "dynamic low angle shot";
  if (position < 0.90) return "over the shoulder medium shot";
  return "wide shot, pulling back";
}

/**
 * 构建增强 prompt，并返回增强日志。
 *
 * 五层增强：
 * 1. 角色描述锚定（确保一致性）
 * 2. 风格矛盾检测（移除与风格冲突的词）
 * 3. 叙事弧构图（根据面板位置自动编排镜头语言）
 * 4. 缺失要素补充（风格专属光影）
 * 5. CJK 清理
 */
export function buildEnhancedPrompt(
  basePrompt: string,
  panelIndex: number,
  characterDesc?: string,
  style?: ComicStyle,
  totalPanels?: number,
): string {
  const log = buildEnhancedPromptWithLog(basePrompt, panelIndex, characterDesc, style, totalPanels);
  return log.enhanced;
}

/**
 * 带日志版本的增强函数，供需要透明度的调用方使用。
 */
export function buildEnhancedPromptWithLog(
  basePrompt: string,
  panelIndex: number,
  characterDesc?: string,
  style?: ComicStyle,
  totalPanels?: number,
): EnhancementLog {
  let prompt = basePrompt;
  const layers: { name: string; action: string }[] = [];

  // === 层 1：角色描述锚定 ===
  if (characterDesc) {
    const hasPerPanelCharTags = /\[[\w\s\-'\.]+:/.test(prompt);
    if (!hasPerPanelCharTags && !prompt.includes(characterDesc.slice(0, 30))) {
      prompt = `${characterDesc} ${prompt}`;
      layers.push({ name: "角色锚定", action: "注入全局角色描述（未检测到面板级标签）" });
    }
  }

  // === 层 2：风格矛盾检测 ===
  if (style) {
    const conflicts = getConflictingTerms(style);
    const removedTerms: string[] = [];
    const promptLowerCheck = prompt.toLowerCase();
    for (const term of conflicts) {
      if (promptLowerCheck.includes(term)) {
        const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
        prompt = prompt.replace(regex, "").replace(/,\s*,/g, ",").replace(/\s+/g, " ");
        removedTerms.push(term);
      }
    }
    if (removedTerms.length > 0) {
      layers.push({ name: "风格净化", action: `移除矛盾词: ${removedTerms.join(", ")}` });
    }
  }

  // === 层 3：叙事弧构图 ===
  const promptLower = prompt.toLowerCase();
  const hasComposition = COMPOSITION_KEYWORDS.some(k => promptLower.includes(k));
  if (!hasComposition) {
    const composition = getStoryArcComposition(panelIndex, totalPanels || 6);
    prompt = prompt.replace(/,?\s*$/, `, ${composition}`);
    layers.push({ name: "构图补充", action: `添加: ${composition}` });
  }

  // === 层 4：补充光影（风格专属） ===
  const hasLighting = LIGHTING_KEYWORDS.some(k => promptLower.includes(k));
  if (!hasLighting) {
    const defaultLighting = (style && STYLE_DEFAULT_LIGHTING[style]) || "professional lighting";
    prompt = prompt.replace(/,?\s*$/, `, ${defaultLighting}`);
    layers.push({ name: "光影补充", action: `添加: ${defaultLighting}` });
  }

  // === 层 5：清理非英文字符 ===
  const beforeClean = prompt;
  prompt = prompt
    .replace(/[\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/g, "");
  if (prompt !== beforeClean) {
    layers.push({ name: "CJK 清理", action: "移除中日韩文字" });
  }

  // 清理多余空格和逗号
  prompt = prompt.replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim();

  return {
    original: basePrompt,
    enhanced: prompt,
    layers,
  };
}

/**
 * 将参考图（panel 级优先于 script 级）合并到 imageConfig.extraBody 中。
 * 支持多参考图：多张时按面板索引轮换使用。
 */
export function mergeReferenceImage(
  imageConfig: PartialImageGenConfig | undefined,
  script: { referenceImages?: string[]; referenceImage?: string; controlMode?: string },
  panel: { referenceImages?: string[]; referenceImage?: string },
  panelIndex?: number,
): PartialImageGenConfig | undefined {
  const refImages = panel.referenceImages ?? script.referenceImages;
  const refImage = panel.referenceImage ?? script.referenceImage;

  let selectedImage: string | undefined;
  if (refImages && refImages.length > 0) {
    const idx = (panelIndex ?? 0) % refImages.length;
    selectedImage = refImages[idx];
  } else {
    selectedImage = refImage;
  }

  if (!selectedImage) return imageConfig;

  return {
    ...imageConfig,
    extraBody: {
      ...imageConfig?.extraBody,
      control_image: selectedImage,
      control_mode: (script.controlMode ?? "HED") as "HED" | "Canny" | "Depth",
    },
  };
}
