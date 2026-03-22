import { ComicStyle, BuiltinContentType, ContentType } from "../types";

// ============================================================
// 画面风格配置（单一数据源）
// StyleSelector / 历史页 / 角色页 / prompt 生成器均从此处派生。
//
// modifier 优化参考：
//   - ZeroLu/awesome-nanobanana-pro (9.4k stars)
//   - Jermic/awesome-aiart-pics-prompts (280 stars)
// ============================================================

/** 风格分组 */
export type StyleGroup = "cartoon" | "realistic" | "traditional" | "special";

/** 风格完整定义 */
export interface StyleMeta {
  /** UI 显示名称 */
  label: string;
  /** 简短描述（选择器卡片） */
  desc: string;
  /** emoji 图标 */
  icon: string;
  /** 分组 */
  group: StyleGroup;
  /** 中文详细描述（供 LLM prompt 使用） */
  description: string;
  /** 英文风格修饰词（供文生图 positive prompt 使用） */
  modifier: string;
  /** 英文负面提示词（供 SD 系模型 negative prompt 使用，可选） */
  negativePrompt?: string;
}

/** 分组中文名称 */
export const STYLE_GROUP_LABELS: Record<StyleGroup, string> = {
  cartoon: "卡通漫画",
  realistic: "写实质感",
  traditional: "传统艺术",
  special: "特殊风格",
};

/**
 * 所有画面风格的完整元数据（单一数据源）。
 * 有序排列，决定 UI 中的默认展示顺序。
 */
export const STYLE_META: Record<ComicStyle, StyleMeta> = {
  flat: {
    label: "扁平插画",
    desc: "矢量几何，现代科技感",
    icon: "📐",
    group: "cartoon",
    description: "扁平矢量插画风格，几何形状，简洁配色，现代科技感，适合科技概念图解和信息展示",
    modifier: "flat design vector illustration, geometric shapes, clean minimal 4-color palette, modern tech aesthetic, simple bold shapes, no texture, no gradient shadows, isometric perspective, UI illustration style, vibrant accent colors on light neutral background, clear visual hierarchy, separated content blocks, icon-driven design",
    negativePrompt: "photorealistic, 3D render, gradient shadows, complex textures, hand-drawn, sketch lines, dark background, watercolor, ink wash, pencil strokes",
  },
  anime: {
    label: "日系动漫",
    desc: "大眼睛，赛璐璐着色",
    icon: "🎌",
    group: "cartoon",
    description: "日系动漫风格，大眼睛，赛璐璐着色，表情丰富，色彩鲜艳，适合生动叙事",
    modifier: "masterpiece, best quality, anime style illustration, cel shading with hard shadows, vibrant saturated colors, clean precise lineart, dynamic composition, anime key visual, expressive large eyes, detailed hair highlights and reflections, soft gradient sky background, light bloom effects, studio ghibli color palette",
    negativePrompt: "photorealistic, western cartoon, 3D render, blurry, low quality, deformed, dull colors, watercolor, ink wash, sketch",
  },
  cartoon: {
    label: "欧美卡通",
    desc: "粗线条，夸张表情",
    icon: "🎨",
    group: "cartoon",
    description: "欧美卡通风格，粗黑线条，色块鲜明，夸张比例和表情，适合幽默表达",
    modifier: "best quality, western cartoon style, thick bold black outlines, flat cel shading, bright saturated primary colors, exaggerated proportions and expressions, rubberhose style limbs, clean vector-like look, dynamic action poses, Cartoon Network aesthetic, pop art color blocks",
    negativePrompt: "anime, photorealistic, 3D render, sketch, watercolor, blurry, muted colors, ink wash, pixel art",
  },
  chibi: {
    label: "Q版可爱",
    desc: "头大身小，盲盒质感",
    icon: "🧸",
    group: "cartoon",
    description: "Q版可爱风格，2头身比例，萌系大眼，圆润造型，盲盒手办质感，适合轻松科普",
    modifier: "best quality, chibi style, super deformed 2-head-tall proportions, big head small body, kawaii aesthetic, rounded soft features, pastel candy colors, adorable character design, pop mart blind box figure, soft matte plastic texture, simple gradient background, sparkle effects, blush cheek marks",
    negativePrompt: "realistic proportions, scary, horror, dark colors, sharp edges, photorealistic, complex background, ink wash, sketch, manga",
  },
  manga: {
    label: "日漫线稿",
    desc: "黑白分明，速度线",
    icon: "📖",
    group: "cartoon",
    description: "日漫黑白线稿风格，网点阴影，粗细变化的墨线，速度线效果，适合戏剧性表达",
    modifier: "best quality, manga style, pure black and white ink illustration, screentone halftone dots for shading, dramatic thick-to-thin brush inking, high contrast, dynamic speed lines and motion lines, bold ink strokes, splash ink effects, shounen manga action composition, dramatic foreshortening, no color",
    negativePrompt: "color, watercolor, photorealistic, 3D, gradient, soft shading, pastel, digital painting, flat design",
  },
  realistic: {
    label: "写实风格",
    desc: "概念艺术，电影质感",
    icon: "📷",
    group: "realistic",
    description: "写实数字绘画风格，概念艺术级细节，电影级光影，适合历史人物和严肃主题",
    modifier: "masterpiece, best quality, realistic digital concept art painting, highly detailed face and hands, accurate anatomy, natural volumetric lighting with rim light, professional illustration, cinematic widescreen composition, dramatic chiaroscuro lighting, matte painting background, detailed fabric and material textures, color grading",
    negativePrompt: "cartoon, anime, chibi, flat colors, low quality, blurry, deformed hands, extra fingers, oversaturated, pixel art, sketch, watercolor",
  },
  watercolor: {
    label: "水彩风格",
    desc: "湿画法，颜料晕染",
    icon: "💧",
    group: "realistic",
    description: "传统水彩风格，湿画法晕染，颜料自然流淌，纸张纹理可见，适合抒情和自然主题",
    modifier: "best quality, traditional watercolor painting, wet-on-wet technique, soft color bleeding and blooming, visible cold-pressed paper texture, artistic washes with pigment pooling, transparent layered glazes, granulating earth pigments, soft feathered edges, light pencil underdrawing visible, natural palette with muted tones",
    negativePrompt: "digital art, sharp hard lines, flat solid colors, 3D render, photorealistic, hard edges, neon colors, anime, pixel art, vector",
  },
  sketch: {
    label: "黑白素描",
    desc: "铅笔交叉线，纸张质感",
    icon: "✏️",
    group: "traditional",
    description: "黑白素描风格，铅笔交叉阴影线，纸张纹理，学术插图感，适合解剖图和结构说明",
    modifier: "best quality, pencil sketch on cream paper, graphite crosshatching shading, monochrome grayscale, hand-drawn linework with varying pressure, rough sketch strokes, traditional academic drawing, visible paper grain texture, conte crayon accents, architectural rendering style, no color",
    negativePrompt: "color, digital art, 3D render, photorealistic, clean vector lines, gradients, anime, watercolor",
  },
  inkwash: {
    label: "水墨风格",
    desc: "写意笔触，留白意境",
    icon: "🖌️",
    group: "traditional",
    description: "中国传统水墨风格，写意笔触，浓淡五色，留白空灵，适合古典文化和禅意主题",
    modifier: "best quality, Chinese traditional ink wash painting, sumi-e masterful brushwork, five-tone ink gradients from deep black to pale gray, xuan rice paper texture, elegant calligraphic brush strokes, atmospheric ink mist perspective, wet ink splatter and dry brush texture contrast, zen minimalism, generous negative space composition, mountain-water shanshui landscape elements",
    negativePrompt: "western art style, digital art, 3D render, bright saturated colors, photorealistic, hard mechanical edges, neon, anime, pixel art, flat design",
  },
  pixel: {
    label: "像素风格",
    desc: "复古游戏，16色限制",
    icon: "👾",
    group: "special",
    description: "像素风格，8/16位复古游戏风，有限调色板，方块拼图美学，适合科技和游戏主题",
    modifier: "best quality, pixel art illustration, 16-bit retro game aesthetic, limited 16-color palette, clean crisp pixel edges, no anti-aliasing, deliberate dithering patterns for shading, NES SNES era sprite art, chunky pixel characters, tiled background pattern, nostalgic retro gaming vibe",
    negativePrompt: "smooth gradients, photorealistic, high resolution detail, anti-aliasing, 3D render, blurry, modern art, watercolor, ink wash, anime",
  },
  infographic: {
    label: "手绘信息图",
    desc: "涂鸦图标，知识可视化",
    icon: "📊",
    group: "special",
    description: "手绘信息图风格，涂鸦线条配图标，知识可视化布局，大量留白，适合概念图解和流程说明",
    modifier: "best quality, hand-drawn sketch note infographic on pure white background, black ink doodle lines, simple iconic illustrations, clean whitespace layout, educational diagram with numbered steps, labeled annotations with hand-drawn arrows, visual hierarchy with size contrast, red and green and blue color accents on white, marker pen texture, stick figure characters, data visualization elements",
    negativePrompt: "photorealistic, 3D render, complex shading, dark background, dense composition, no whitespace, gradients",
  },
  banana: {
    label: "香蕉漫画",
    desc: "蜡笔粉彩，童趣涂鸦",
    icon: "🍌",
    group: "special",
    description: "香蕉漫画风格，蜡笔粉彩质感，童趣手绘涂鸦，粗犷线条配柔和色彩，适合轻松有趣的科普表达",
    modifier: "best quality, childlike crayon and pastel illustration, thick wobbly hand-drawn outlines, soft wax crayon coloring with visible strokes, pastel chalk texture, naive art style with charming imperfections, rounded cartoon characters with dot eyes, warm muted color palette on off-white background, kindergarten drawing aesthetic, playful and whimsical, scattered decorative doodles (stars hearts swirls)",
    negativePrompt: "photorealistic, 3D render, sharp clean lines, digital art, smooth gradients, dark background, realistic proportions, professional illustration",
  },
};

/** 有序的风格列表（UI 默认展示顺序） */
export const STYLE_ORDER: ComicStyle[] = Object.keys(STYLE_META) as ComicStyle[];

// ============================================================
// 内容类型 → 推荐风格映射
// ============================================================

/** 各内容类型的推荐风格（有序，靠前优先级高） */
export const CONTENT_STYLE_RECOMMENDATIONS: Record<BuiltinContentType, ComicStyle[]> = {
  wikipedia: ["flat", "infographic", "cartoon", "chibi"],
  science: ["flat", "infographic", "cartoon", "chibi"],
  poetry: ["inkwash", "watercolor", "sketch", "anime"],
  novel: ["manga", "realistic", "inkwash", "watercolor"],
  xiaohongshu: ["infographic", "banana", "flat", "chibi"],
};

/**
 * 获取给定内容类型下，某风格是否被推荐。
 */
export function isStyleRecommended(style: ComicStyle, contentType?: ContentType): boolean {
  if (!contentType) return false;
  const recs = CONTENT_STYLE_RECOMMENDATIONS[contentType as BuiltinContentType];
  return recs?.includes(style) ?? false;
}

// ============================================================
// 向后兼容：旧 API
// ============================================================

/** 画面风格中文描述（向后兼容） */
export const STYLE_DESCRIPTIONS: Record<ComicStyle, string> = Object.fromEntries(
  STYLE_ORDER.map((key) => [key, STYLE_META[key].description])
) as Record<ComicStyle, string>;

/** 英文风格修饰词（向后兼容） */
export const STYLE_MODIFIERS: Record<ComicStyle, string> = Object.fromEntries(
  STYLE_ORDER.map((key) => [key, STYLE_META[key].modifier])
) as Record<ComicStyle, string>;

/** 英文负面提示词（可选，仅 SD 系模型使用） */
export const STYLE_NEGATIVE_PROMPTS: Record<ComicStyle, string> = Object.fromEntries(
  STYLE_ORDER.map((key) => [key, STYLE_META[key].negativePrompt ?? ""])
) as Record<ComicStyle, string>;

/** 获取指定风格的中文描述 */
export function getStyleDescription(style: ComicStyle): string {
  return STYLE_META[style]?.description ?? STYLE_META.anime.description;
}

/** 获取指定风格的英文修饰词 */
export function getStyleModifier(style: ComicStyle): string {
  return STYLE_META[style]?.modifier ?? STYLE_META.anime.modifier;
}

/** 获取指定风格的负面提示词 */
export function getStyleNegativePrompt(style: ComicStyle): string {
  return STYLE_META[style]?.negativePrompt ?? "";
}

/**
 * 获取供 LLM prompt 使用的完整风格指导。
 * 包含中文描述（让 LLM 理解意图）+ 英文 modifier 关键词（让 LLM 写出兼容的 imagePrompt）。
 *
 * 这是第一性原理修复：LLM 写 imagePrompt 时必须知道图片模型的风格词汇，
 * 否则 LLM 输出可能与后续注入的 modifier 矛盾（如水墨风却写出 "vibrant colors"）。
 */
export function getStyleGuidanceForLLM(style: ComicStyle): string {
  const meta = STYLE_META[style] ?? STYLE_META.anime;
  return `${meta.description}

画面风格关键词（imagePrompt 中必须与这些关键词兼容，不要产生矛盾）：
${meta.modifier}
${meta.negativePrompt ? `\n禁止出现的元素：${meta.negativePrompt}` : ""}`
;
}
