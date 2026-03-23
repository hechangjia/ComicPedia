/**
 * VLM 视觉评分 Agent：使用视觉语言模型评估实际生成的图片质量。
 * 与 qualityScore.ts (文本评分) 互补 — 本模块基于图片像素，而非 prompt 文本。
 *
 * 支持: OpenAI-compatible (GPT-4o, Qwen-VL, etc.) 和 Anthropic (Claude Vision)
 * 通过 /api/llm 代理，无需额外的 API 路由。
 */

import { ComicScript, ComicStyle, PartialLLMConfig, PanelVisualScore, VisualQualityScore } from "./types";
import { STYLE_META } from "./config/styles";
import { clampScore, extractJsonObject } from "./utils";

// ============================================================
// 图片 URL → base64 解析
// ============================================================

/** 将任意图片 URL（data:、/api/images/、file://）解析为 base64 data URI */
async function resolveImageToBase64(imageUrl: string): Promise<string | null> {
  if (imageUrl.startsWith("data:image")) return imageUrl;

  // file://{key} → /api/images/{key}
  let fetchUrl = imageUrl;
  const fileMatch = imageUrl.match(/^file:\/\/(.+)$/);
  if (fileMatch) {
    fetchUrl = `/api/images/${encodeURIComponent(fileMatch[1])}`;
  }

  // /api/images/{key} or other relative URL → fetch and convert
  try {
    const response = await fetch(fetchUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ============================================================
// Prompt 构建
// ============================================================

/** 构建单面板视觉评估 prompt */
function buildPanelEvalPrompt(
  panelIndex: number,
  imagePrompt: string,
  style: string,
  totalPanels: number,
): string {
  const styleMeta = STYLE_META[style as ComicStyle] ?? STYLE_META.anime;

  return `You are an expert visual quality evaluator for AI-generated comic panels.

Evaluate this image (panel ${panelIndex + 1} of ${totalPanels}) against its generation prompt and target style.

## Generation Prompt (what the image SHOULD depict)
${imagePrompt}

## Target Style
${style} — ${styleMeta.description}
Expected visual characteristics: ${styleMeta.modifier}

## Evaluation Dimensions (score 1-10)

1. **textImageAlignment**: Does the image accurately depict what the generation prompt describes? Check: characters present, scene elements, actions, objects, spatial arrangement.

2. **styleAdherence**: Does the image match the "${style}" style? For ${style}: look for ${getStyleCheckpoints(style)}.

3. **artifactScore**: Rate visual quality. 10 = flawless. Deduct for: extra/missing fingers, distorted faces, broken limbs, floating objects, text/watermarks in image, blurry regions, color bleeding, unnatural body proportions.

4. **compositionQuality**: Is the framing effective? Good use of space, clear focal point, balanced layout, appropriate level of detail.

## Output
Respond in this exact JSON format, nothing else:
{
  "textImageAlignment": <1-10>,
  "styleAdherence": <1-10>,
  "artifactScore": <1-10>,
  "compositionQuality": <1-10>,
  "issues": ["specific issue 1", "specific issue 2"]
}

Be strict but fair. Issues should be specific and actionable (e.g., "character has 6 fingers on left hand", "background is blurry while foreground is sharp — inconsistent focus").
JSON only, no other text.`;
}

/** 每种风格的视觉检查点 */
function getStyleCheckpoints(style: string): string {
  const checks: Record<string, string> = {
    flat: "clean vector shapes, minimal gradients, bold outlines, flat color fills, geometric simplicity",
    anime: "large expressive eyes, clean line art, cel-shading, vibrant colors, manga-influenced proportions",
    cartoon: "exaggerated features, bold outlines, bright colors, playful proportions",
    chibi: "2-head-tall proportions, oversized head, tiny body, kawaii aesthetic, rounded features",
    manga: "black and white or limited palette, screentones, dynamic speed lines, sharp ink lines",
    realistic: "photorealistic proportions, natural lighting, detailed textures, proper anatomy",
    watercolor: "soft edges, color bleeding, paper texture, transparent washes, wet-on-wet effects",
    sketch: "visible pencil/pen strokes, hatching, rough edges, monochrome or limited color",
    inkwash: "ink gradients, wet brush strokes, white space (留白), East Asian aesthetic",
    pixel: "visible pixel grid, limited color palette, retro game aesthetic, no anti-aliasing",
    infographic: "data visualization elements, icons, layout structure, whitespace, information hierarchy",
    banana: "Nano Banana's distinct style, warm tones, stylized illustration",
  };
  return checks[style] || "consistent art style, coherent visual language";
}

// ============================================================
// VLM 调用
// ============================================================

/** 提取 base64 图片的 data 部分和 MIME 类型 */
function parseBase64Image(dataUri: string): { data: string; mimeType: string } | null {
  const match = dataUri.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

/** 构建多模态消息体 (兼容 OpenAI/Anthropic) */
function buildMultimodalPayload(
  prompt: string,
  imageBase64: string,
  config: { model: string; provider?: string },
) {
  const parsed = parseBase64Image(imageBase64);
  const isAnthropic = config.provider === "anthropic";

  if (isAnthropic) {
    return {
      model: config.model,
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...(parsed ? [{
            type: "image",
            source: {
              type: "base64",
              media_type: parsed.mimeType,
              data: parsed.data,
            },
          }] : []),
        ],
      }],
    };
  }

  // OpenAI-compatible (GPT-4o, Qwen-VL, etc.)
  return {
    model: config.model,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        ...(parsed ? [{
          type: "image_url",
          image_url: { url: imageBase64 },
        }] : []),
      ],
    }],
    max_tokens: 1024,
  };
}

/** 调用 VLM 评估单个面板 */
async function evaluatePanel(
  panelIndex: number,
  imageBase64: string,
  imagePrompt: string,
  style: string,
  totalPanels: number,
  vlmConfig: PartialLLMConfig,
): Promise<PanelVisualScore> {
  const apiUrl = vlmConfig.apiUrl;
  const apiKey = vlmConfig.apiKey || "";
  if (!apiUrl) throw new Error("未配置 VLM API");

  const normalizedUrl = apiUrl.includes("/chat/completions")
    ? apiUrl
    : `${apiUrl.replace(/\/+$/, "")}/chat/completions`;

  const isAnthropic = vlmConfig.provider === "anthropic";

  const prompt = buildPanelEvalPrompt(panelIndex, imagePrompt, style, totalPanels);
  const payload = buildMultimodalPayload(prompt, imageBase64, {
    model: vlmConfig.model || "gpt-4o",
    provider: vlmConfig.provider,
  });

  const headers: Record<string, string> = isAnthropic
    ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
    : apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

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
    throw new Error(`VLM evaluation failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content
    || data.content?.[0]?.text
    || "";

  return parsePanelScore(panelIndex, content);
}

/** 解析 VLM 返回的面板评分 JSON */
function parsePanelScore(panelIndex: number, content: string): PanelVisualScore {
  const fallback: PanelVisualScore = {
    panelIndex,
    textImageAlignment: 5,
    styleAdherence: 5,
    artifactScore: 5,
    compositionQuality: 5,
    overall: 5,
    issues: ["VLM 评分解析失败"],
  };

  try {
    const parsed = extractJsonObject(content);
    if (!parsed) return fallback;

    const textImageAlignment = clampScore(parsed.textImageAlignment as number);
    const styleAdherence = clampScore(parsed.styleAdherence as number);
    const artifactScore = clampScore(parsed.artifactScore as number);
    const compositionQuality = clampScore(parsed.compositionQuality as number);

    return {
      panelIndex,
      textImageAlignment,
      styleAdherence,
      artifactScore,
      compositionQuality,
      overall: Math.round((textImageAlignment + styleAdherence + artifactScore + compositionQuality) / 4 * 10) / 10,
      issues: Array.isArray(parsed.issues) ? (parsed.issues as string[]).slice(0, 5).map(String) : [],
    };
  } catch {
    return fallback;
  }
}

// ============================================================
// 公共 API
// ============================================================

/**
 * VLM 视觉评分：对每个已完成面板的实际图片进行视觉质量评估。
 * 逐面板串行调用 VLM（避免图片并发导致 OOM/限频）。
 *
 * @param script - 包含已生成图片的脚本
 * @param vlmConfig - VLM 配置（复用 LLM 配置格式）
 * @returns 完整的视觉质量评分
 */
export async function evaluateVisualQuality(
  script: ComicScript,
  vlmConfig: PartialLLMConfig,
): Promise<VisualQualityScore> {
  const completedPanels = script.panels
    .map((p, i) => ({ panel: p, index: i }))
    .filter(({ panel }) =>
      panel.status === "completed" && !!panel.imageUrl
    );

  if (completedPanels.length === 0) {
    throw new Error("没有可评估的已完成面板");
  }

  const panelScores: PanelVisualScore[] = [];

  // 串行评估，避免大量 base64 并发
  for (const { panel, index } of completedPanels) {
    try {
      // 解析图片为 base64（兼容 file://、/api/images/、data:image）
      const imageBase64 = await resolveImageToBase64(panel.imageUrl!);
      if (!imageBase64) {
        console.warn(`[VLM] Panel ${index + 1}: failed to resolve image to base64, skipping`);
        continue;
      }

      console.log(`[VLM] Evaluating panel ${index + 1}/${script.panels.length}...`);
      const score = await evaluatePanel(
        index,
        imageBase64,
        panel.imagePrompt,
        panel.styleOverride ?? script.style,
        script.panels.length,
        vlmConfig,
      );
      panelScores.push(score);
    } catch (err) {
      console.warn(`[VLM] Panel ${index + 1} evaluation failed:`, err);
      panelScores.push({
        panelIndex: index,
        textImageAlignment: 5,
        styleAdherence: 5,
        artifactScore: 5,
        compositionQuality: 5,
        overall: 5,
        issues: [`评估失败: ${err instanceof Error ? err.message : "未知错误"}`],
      });
    }
  }

  // 计算总分
  const overall = panelScores.length > 0
    ? Math.round(panelScores.reduce((sum, p) => sum + p.overall, 0) / panelScores.length * 10) / 10
    : 5;

  // 生成重试建议：评分 < 6 的面板
  const retryRecommendations = panelScores
    .filter(p => p.overall < 6)
    .map(p => ({
      panelIndex: p.panelIndex,
      reason: p.issues[0] || `综合评分偏低 (${p.overall}/10)`,
      suggestedFix: buildRetryHint(p),
    }));

  // P3: 跨面板一致性评估（至少 2 个完成面板才触发）
  let crossPanelConsistency: number | undefined;
  let crossPanelResult: CrossPanelConsistencyResult | undefined;
  if (completedPanels.length >= 2) {
    try {
      crossPanelResult = await evaluateCrossPanelConsistency(script, vlmConfig);
      crossPanelConsistency = crossPanelResult.overall;

      // 将跨面板问题也纳入重试建议
      for (const issue of crossPanelResult.issues) {
        for (const idx of issue.panelIndices) {
          if (!retryRecommendations.some(r => r.panelIndex === idx)) {
            retryRecommendations.push({
              panelIndex: idx,
              reason: issue.description,
              suggestedFix: "参考其他面板的风格/角色外貌进行重新生成",
            });
          }
        }
      }
    } catch (err) {
      console.warn("[VLM] Cross-panel consistency evaluation failed (non-fatal):", err);
    }
  }

  // 综合总分（加权：单面板 70% + 跨面板一致性 30%）
  const adjustedOverall = crossPanelConsistency !== undefined
    ? Math.round((overall * 0.7 + crossPanelConsistency * 0.3) * 10) / 10
    : overall;

  return {
    overall: adjustedOverall,
    panels: panelScores,
    crossPanelConsistency,
    crossPanelDetail: crossPanelResult,
    retryRecommendations,
    evaluatedAt: new Date().toISOString(),
  };
}

/** 根据评分短板生成重试建议 */
function buildRetryHint(score: PanelVisualScore): string {
  const weakest = [
    { dim: "textImageAlignment", val: score.textImageAlignment, hint: "简化 prompt 或拆分复杂场景" },
    { dim: "styleAdherence", val: score.styleAdherence, hint: "加强风格关键词或更换图片模型" },
    { dim: "artifactScore", val: score.artifactScore, hint: "降低图片复杂度或使用更高质量模型" },
    { dim: "compositionQuality", val: score.compositionQuality, hint: "明确指定构图类型（如 close-up, wide shot）" },
  ].sort((a, b) => a.val - b.val);

  return weakest[0].hint;
}

// ============================================================
// P3: Cross-Panel Consistency Evaluation
// ============================================================

/** 跨面板一致性评估结果 */
export interface CrossPanelConsistencyResult {
  /** 总一致性评分 1-10 */
  overall: number;
  /** 角色外貌一致性 */
  characterConsistency: number;
  /** 风格漂移程度（10=无漂移） */
  styleDrift: number;
  /** 色调统一性 */
  colorPaletteCoherence: number;
  /** 具体的不一致问题 */
  issues: Array<{
    panelIndices: number[];
    description: string;
  }>;
}

/** 构建跨面板一致性评估 prompt */
function buildCrossPanelPrompt(
  style: string,
  panelCount: number,
  characterDescription?: string,
): string {
  const styleMeta = STYLE_META[style as ComicStyle] ?? STYLE_META.anime;

  return `You are a comic visual consistency expert. You are given ${panelCount} panels from the same comic. Evaluate cross-panel visual consistency.

## Comic Style
${style} — ${styleMeta.description}

${characterDescription ? `## Character Anchor\n${characterDescription}\n` : ""}

## Evaluation Dimensions (score 1-10)

1. **characterConsistency**: Do recurring characters maintain the same face, hair, body proportions, and clothing across panels? Look for: face shape changes, hair color/style drift, clothing inconsistencies, height/proportion shifts.

2. **styleDrift**: Does the art style remain consistent? Look for: rendering technique changes (e.g., some panels look painterly while others look flat), line weight variations, detail level inconsistencies between panels.

3. **colorPaletteCoherence**: Is the color palette unified? Look for: dramatic color temperature shifts, inconsistent lighting direction, one panel being significantly darker/lighter than others without narrative reason.

## Output
JSON only, no other text:
{
  "characterConsistency": <1-10>,
  "styleDrift": <1-10>,
  "colorPaletteCoherence": <1-10>,
  "issues": [
    {"panelIndices": [0, 3], "description": "Character's hair color changes from black to brown"},
    {"panelIndices": [2], "description": "Panel 3 uses a distinctly different rendering style"}
  ]
}

Be specific about which panels have issues. Panel numbering starts at 0.`;
}

/** 构建多图片消息体 */
function buildMultiImagePayload(
  prompt: string,
  images: Array<{ index: number; base64: string }>,
  config: { model: string; provider?: string },
) {
  const isAnthropic = config.provider === "anthropic";

  // 构建标注每张图片的 content 数组
  const contentParts: Array<Record<string, unknown>> = [];
  contentParts.push({ type: "text", text: prompt });

  for (const img of images) {
    contentParts.push({ type: "text", text: `\n--- Panel ${img.index + 1} ---` });

    const parsed = parseBase64Image(img.base64);
    if (!parsed) continue;

    if (isAnthropic) {
      contentParts.push({
        type: "image",
        source: { type: "base64", media_type: parsed.mimeType, data: parsed.data },
      });
    } else {
      contentParts.push({
        type: "image_url",
        image_url: { url: img.base64 },
      });
    }
  }

  if (isAnthropic) {
    return {
      model: config.model,
      max_tokens: 1024,
      messages: [{ role: "user", content: contentParts }],
    };
  }

  return {
    model: config.model,
    messages: [{ role: "user", content: contentParts }],
    max_tokens: 1024,
  };
}

/**
 * P3: 跨面板一致性评估。
 * 将所有面板图片打包发送给 VLM，评估视觉一致性。
 * 限制：最多选取 6 张图片（避免上下文溢出），均匀采样。
 */
export async function evaluateCrossPanelConsistency(
  script: ComicScript,
  vlmConfig: PartialLLMConfig,
): Promise<CrossPanelConsistencyResult> {
  const completedPanels = script.panels
    .map((p, i) => ({ panel: p, index: i }))
    .filter(({ panel }) =>
      panel.status === "completed" && !!panel.imageUrl
    );

  if (completedPanels.length < 2) {
    throw new Error("至少需要 2 个已完成面板进行跨面板对比");
  }

  // 均匀采样最多 6 张（避免 VLM 上下文/token 溢出）
  const MAX_IMAGES = 6;
  let sampled = completedPanels;
  if (completedPanels.length > MAX_IMAGES) {
    const step = completedPanels.length / MAX_IMAGES;
    sampled = Array.from({ length: MAX_IMAGES }, (_, i) =>
      completedPanels[Math.min(Math.floor(i * step), completedPanels.length - 1)]
    );
  }

  // 解析所有采样图片为 base64
  const resolvedImages: Array<{ index: number; base64: string }> = [];
  for (const { panel, index } of sampled) {
    const base64 = await resolveImageToBase64(panel.imageUrl!);
    if (base64) {
      resolvedImages.push({ index, base64 });
    }
  }
  if (resolvedImages.length < 2) {
    throw new Error("至少需要 2 张可解析的图片进行跨面板对比");
  }

  const apiUrl = vlmConfig.apiUrl;
  const apiKey = vlmConfig.apiKey || "";
  if (!apiUrl) throw new Error("未配置 VLM API");

  const normalizedUrl = apiUrl.includes("/chat/completions")
    ? apiUrl
    : `${apiUrl.replace(/\/+$/, "")}/chat/completions`;

  const isAnthropic = vlmConfig.provider === "anthropic";

  const prompt = buildCrossPanelPrompt(
    script.style,
    resolvedImages.length,
    script.characterDescription,
  );

  const payload = buildMultiImagePayload(prompt, resolvedImages, {
    model: vlmConfig.model || "gpt-4o",
    provider: vlmConfig.provider,
  });

  const headers: Record<string, string> = isAnthropic
    ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
    : apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

  console.log(`[VLM] Cross-panel consistency: evaluating ${resolvedImages.length} panels...`);

  const response = await fetch("/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetUrl: normalizedUrl, headers, payload }),
  });

  if (!response.ok) {
    throw new Error(`VLM cross-panel evaluation failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content
    || data.content?.[0]?.text
    || "";

  return parseCrossPanelScore(content);
}

/** 解析跨面板一致性评分 */
function parseCrossPanelScore(content: string): CrossPanelConsistencyResult {
  const fallback: CrossPanelConsistencyResult = {
    overall: 5,
    characterConsistency: 5,
    styleDrift: 5,
    colorPaletteCoherence: 5,
    issues: [],
  };

  try {
    const parsed = extractJsonObject(content);
    if (!parsed) return fallback;

    const characterConsistency = clampScore(parsed.characterConsistency as number);
    const styleDrift = clampScore(parsed.styleDrift as number);
    const colorPaletteCoherence = clampScore(parsed.colorPaletteCoherence as number);

    const issues = Array.isArray(parsed.issues)
      ? (parsed.issues as Record<string, unknown>[]).slice(0, 8).map((iss) => ({
          panelIndices: Array.isArray(iss.panelIndices) ? (iss.panelIndices as number[]).map(Number) : [],
          description: String(iss.description || ""),
        }))
      : [];

    return {
      characterConsistency,
      styleDrift,
      colorPaletteCoherence,
      overall: Math.round((characterConsistency + styleDrift + colorPaletteCoherence) / 3 * 10) / 10,
      issues,
    };
  } catch {
    return fallback;
  }
}

// ============================================================
// Character Reference Image Evaluation
// ============================================================

/** 角色参考图视觉评分结果 */
export interface CharacterVisualScore {
  overall: number;
  /** 角色特征清晰度（面部、服装、体型是否清楚呈现） */
  featureClarity: number;
  /** 跨图一致性（多张参考图间角色外貌是否统一） */
  consistency: number;
  /** 画面质量（瑕疵、分辨率、构图） */
  imageQuality: number;
  /** 具体问题 */
  issues: string[];
  /** 改进建议 */
  suggestions: string[];
  evaluatedAt: string;
}

/** 构建角色参考图评估 prompt */
function buildCharacterEvalPrompt(
  characterName: string,
  characterDescription: string,
  imageCount: number,
): string {
  return `You are an expert evaluating AI-generated character reference images for a comic production pipeline.

## Character
Name: ${characterName}
Description: ${characterDescription}

## Task
Evaluate ${imageCount} reference image(s) of this character. Score each dimension 1-10.

## Evaluation Dimensions

1. **featureClarity**: Are the character's defining features (face, hair, clothing, body type) clearly depicted and distinguishable? Can an artist reproduce this character from these references?

2. **consistency**: ${imageCount > 1 ? "Do all reference images depict the SAME character? Check: face shape, hair color/style, eye color, clothing, body proportions across all images." : "Does the single image clearly establish the character's visual identity without ambiguity?"}

3. **imageQuality**: Rate visual quality: anatomy accuracy, no artifacts, clear lines, good composition, appropriate detail level.

## Output
JSON only:
{
  "featureClarity": <1-10>,
  "consistency": <1-10>,
  "imageQuality": <1-10>,
  "issues": ["specific issue 1", "specific issue 2"],
  "suggestions": ["actionable suggestion 1", "actionable suggestion 2"]
}

Be strict but constructive. Issues should be specific. Suggestions should be actionable for improving the reference images.`;
}

/**
 * 评估角色参考图的视觉质量。
 * 将角色的所有参考图发送给 VLM 进行评估。
 */
export async function evaluateCharacterVisual(
  characterName: string,
  characterDescription: string,
  imageUrls: string[],
  vlmConfig: PartialLLMConfig,
): Promise<CharacterVisualScore> {
  if (imageUrls.length === 0) {
    throw new Error("没有可评估的参考图");
  }

  // Resolve all images to base64
  const resolvedImages: Array<{ index: number; base64: string }> = [];
  for (let i = 0; i < imageUrls.length && i < 6; i++) {
    const base64 = await resolveImageToBase64(imageUrls[i]);
    if (base64) {
      resolvedImages.push({ index: i, base64 });
    }
  }

  if (resolvedImages.length === 0) {
    throw new Error("无法解析参考图");
  }

  const apiUrl = vlmConfig.apiUrl;
  const apiKey = vlmConfig.apiKey || "";
  if (!apiUrl) throw new Error("未配置 VLM API");

  const normalizedUrl = apiUrl.includes("/chat/completions")
    ? apiUrl
    : `${apiUrl.replace(/\/+$/, "")}/chat/completions`;

  const isAnthropic = vlmConfig.provider === "anthropic";

  const prompt = buildCharacterEvalPrompt(characterName, characterDescription, resolvedImages.length);

  const payload = resolvedImages.length === 1
    ? buildMultimodalPayload(prompt, resolvedImages[0].base64, {
        model: vlmConfig.model || "gpt-4o",
        provider: vlmConfig.provider,
      })
    : buildMultiImagePayload(prompt, resolvedImages, {
        model: vlmConfig.model || "gpt-4o",
        provider: vlmConfig.provider,
      });

  const headers: Record<string, string> = isAnthropic
    ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
    : apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

  const response = await fetch("/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetUrl: normalizedUrl, headers, payload }),
  });

  if (!response.ok) {
    throw new Error(`VLM character evaluation failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content
    || data.content?.[0]?.text
    || "";

  return parseCharacterScore(content);
}

/** 解析角色评分 */
function parseCharacterScore(content: string): CharacterVisualScore {
  const fallback: CharacterVisualScore = {
    overall: 5,
    featureClarity: 5,
    consistency: 5,
    imageQuality: 5,
    issues: ["VLM 评分解析失败"],
    suggestions: [],
    evaluatedAt: new Date().toISOString(),
  };

  try {
    const parsed = extractJsonObject(content);
    if (!parsed) return fallback;

    const featureClarity = clampScore(parsed.featureClarity as number);
    const consistency = clampScore(parsed.consistency as number);
    const imageQuality = clampScore(parsed.imageQuality as number);

    return {
      featureClarity,
      consistency,
      imageQuality,
      overall: Math.round((featureClarity + consistency + imageQuality) / 3 * 10) / 10,
      issues: Array.isArray(parsed.issues) ? (parsed.issues as string[]).slice(0, 5).map(String) : [],
      suggestions: Array.isArray(parsed.suggestions) ? (parsed.suggestions as string[]).slice(0, 5).map(String) : [],
      evaluatedAt: new Date().toISOString(),
    };
  } catch {
    return fallback;
  }
}
