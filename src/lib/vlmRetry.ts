/**
 * VLM 反馈闭环：将 VLM 视觉诊断结果转化为 prompt 修正指令。
 *
 * 工作原理：
 *   VLM issues (e.g. "character has 6 fingers")
 *     → 提取问题类别
 *     → 生成针对性的正向/负向 prompt 补丁
 *     → 与原始 prompt 合并
 *
 * 设计原则：
 * - 基于规则映射，零 LLM 调用（与 scriptValidator 同理）
 * - 只做加法（追加修正词），不删除原始 prompt 内容
 * - 退出条件：每面板最多 1 轮自动视觉重试
 */

import type { CharacterVisualScore, PanelReview, PanelVisualScore, ReviewStatus, VisualQualityScore } from "./types";

/** 修正补丁：追加到 prompt 的正向/负向词 */
export interface PromptPatch {
  positive: string[];    // 追加到 prompt 末尾
  negative: string[];    // 追加到 negative prompt
}

// ============================================================
// Issue Pattern → Prompt Patch 映射
// ============================================================

interface IssuePattern {
  keywords: string[];
  patch: PromptPatch;
}

const ISSUE_PATTERNS: IssuePattern[] = [
  // 手部畸变
  {
    keywords: ["finger", "hand", "digit", "thumb", "extra finger", "missing finger", "手指"],
    patch: {
      positive: ["correct human anatomy", "five fingers on each hand", "anatomically correct hands"],
      negative: ["extra fingers", "deformed hands", "fused fingers", "missing fingers"],
    },
  },
  // 面部畸变
  {
    keywords: ["face", "distorted face", "asymmetric", "facial", "eye", "nose", "mouth", "脸"],
    patch: {
      positive: ["symmetrical face", "well-proportioned facial features", "clear sharp face"],
      negative: ["distorted face", "asymmetric eyes", "deformed facial features"],
    },
  },
  // 身体比例
  {
    keywords: ["proportion", "body", "limb", "arm", "leg", "torso", "anatomy", "比例"],
    patch: {
      positive: ["correct body proportions", "anatomically accurate"],
      negative: ["deformed limbs", "wrong proportions", "extra limbs"],
    },
  },
  // 模糊/质量
  {
    keywords: ["blur", "blurry", "low quality", "noise", "artifact", "pixelat", "模糊", "质量"],
    patch: {
      positive: ["sharp focus", "high detail", "crisp lines", "best quality"],
      negative: ["blurry", "low quality", "noise", "jpeg artifacts"],
    },
  },
  // 文字/水印
  {
    keywords: ["text", "watermark", "logo", "signature", "writing", "letter", "文字", "水印"],
    patch: {
      positive: ["text-free image", "clean image", "no watermark"],
      negative: ["text", "watermark", "logo", "signature", "writing", "letters"],
    },
  },
  // 风格不一致
  {
    keywords: ["style", "inconsisten", "different style", "rendering", "风格"],
    patch: {
      positive: ["consistent art style throughout", "unified rendering technique"],
      negative: ["mixed styles", "inconsistent rendering"],
    },
  },
  // 构图问题
  {
    keywords: ["composition", "framing", "crop", "cut off", "centered", "构图"],
    patch: {
      positive: ["well-composed", "balanced composition", "clear focal point"],
      negative: ["bad composition", "cut off", "poorly framed"],
    },
  },
  // 色彩问题
  {
    keywords: ["color", "palette", "saturat", "dark", "bright", "contrast", "颜色", "色彩"],
    patch: {
      positive: ["harmonious color palette", "balanced contrast"],
      negative: ["oversaturated", "color bleeding", "muddy colors"],
    },
  },
];

// ============================================================
// 公共 API
// ============================================================

/**
 * 根据 VLM 诊断结果生成 prompt 修正补丁。
 *
 * @param panelScore - 单面板 VLM 评分
 * @returns 合并后的补丁（positive + negative 去重）
 */
export function generatePromptPatch(panelScore: PanelVisualScore): PromptPatch {
  const allPositive = new Set<string>();
  const allNegative = new Set<string>();

  // 基于 issues 文本匹配
  for (const issue of panelScore.issues) {
    const issueLower = issue.toLowerCase();
    for (const pattern of ISSUE_PATTERNS) {
      if (pattern.keywords.some(kw => issueLower.includes(kw.toLowerCase()))) {
        pattern.patch.positive.forEach(p => allPositive.add(p));
        pattern.patch.negative.forEach(n => allNegative.add(n));
      }
    }
  }

  // 基于维度低分自动补丁
  if (panelScore.artifactScore < 6) {
    allPositive.add("best quality");
    allPositive.add("sharp details");
    allNegative.add("artifacts");
    allNegative.add("distortion");
  }
  if (panelScore.compositionQuality < 6) {
    allPositive.add("well-composed");
    allPositive.add("balanced layout");
  }
  if (panelScore.styleAdherence < 6) {
    allPositive.add("consistent art style");
  }
  if (panelScore.textImageAlignment < 6) {
    // 图文不匹配时不盲加词，保留原 prompt
    allPositive.add("accurate depiction");
  }

  return {
    positive: Array.from(allPositive),
    negative: Array.from(allNegative),
  };
}

/**
 * 将补丁应用到原始 prompt。
 * 正向词追加到末尾，负向词追加到 negative prompt。
 *
 * @returns 修正后的 prompt
 */
export function applyPromptPatch(originalPrompt: string, patch: PromptPatch): string {
  if (patch.positive.length === 0) return originalPrompt;

  // 去重：不追加已存在的词
  const promptLower = originalPrompt.toLowerCase();
  const newTerms = patch.positive.filter(p => !promptLower.includes(p.toLowerCase()));

  if (newTerms.length === 0) return originalPrompt;

  const base = originalPrompt.replace(/,?\s*$/, "");
  if (!base.trim()) {
    return newTerms.join(", ");
  }
  return `${base}, ${newTerms.join(", ")}`;
}

/**
 * 判断面板是否值得自动视觉重试。
 * 阈值：overall < 6 且至少有 1 个可匹配的 issue pattern。
 */
export function shouldAutoRetry(panelScore: PanelVisualScore): boolean {
  if (panelScore.overall >= 6) return false;
  // 确保有可操作的修正（避免无效重试）
  const patch = generatePromptPatch(panelScore);
  return patch.positive.length > 0;
}

/**
 * 从最新完整视觉评分构建面板级 review 投影。
 * retry recommendation 和跨面板问题都会映射为 needs_repair。
 */
export function buildPanelReview(score: VisualQualityScore): PanelReview[] {
  const retryPanels = new Set(score.retryRecommendations.map((item) => item.panelIndex));
  const crossPanelIssuesByIndex = new Map<number, Set<string>>();

  for (const issue of score.crossPanelDetail?.issues ?? []) {
    for (const panelIndex of issue.panelIndices) {
      const issues = crossPanelIssuesByIndex.get(panelIndex) ?? new Set<string>();
      issues.add(issue.description);
      crossPanelIssuesByIndex.set(panelIndex, issues);
    }
  }

  return [...score.panels]
    .sort((a, b) => a.panelIndex - b.panelIndex)
    .map((panelScore) => {
      const issues = new Set(panelScore.issues);
      const crossPanelIssues = crossPanelIssuesByIndex.get(panelScore.panelIndex);
      for (const crossPanelIssue of crossPanelIssues ?? []) {
        issues.add(crossPanelIssue);
      }

      return {
        panelIndex: panelScore.panelIndex,
        status: retryPanels.has(panelScore.panelIndex) || !!crossPanelIssues?.size ? "needs_repair" : "reviewed",
        score: panelScore.overall,
        issues: Array.from(issues),
      };
    });
}

/**
 * 从面板级 review 投影导出任务级终态。
 * 进行中的 panel 状态也投影为 needs_repair，保持任务级状态集合稳定。
 */
export function buildTaskReviewStatus(panelReview?: PanelReview[] | null): ReviewStatus {
  if (!panelReview?.length) return "unreviewed";
  return panelReview.some((panel) => panel.status !== "reviewed") ? "needs_repair" : "reviewed";
}

// ============================================================
// 角色参考图 VLM 反馈闭环
// ============================================================

/** 角色参考图专用 issue patterns */
const CHARACTER_ISSUE_PATTERNS: IssuePattern[] = [
  // 风格/比例不统一（如 chibi vs 写实混搭）
  {
    keywords: ["chibi", "3d", "unified design", "proportion system", "simplified", "style", "inconsisten", "rendering"],
    patch: {
      positive: ["consistent art style", "unified character design", "same proportions in all views"],
      negative: ["chibi", "3D render", "mixed styles", "inconsistent proportions"],
    },
  },
  // 头饰/发型不一致
  {
    keywords: ["headwear", "hairstyle", "hat", "hair", "topknot", "headscarf", "纶巾", "发型"],
    patch: {
      positive: ["consistent hairstyle across all views", "same headwear design"],
      negative: ["inconsistent hairstyle", "different headwear"],
    },
  },
  // 配饰/道具不一致
  {
    keywords: ["prop", "fan", "weapon", "sword", "accessory", "handheld", "羽扇", "道具"],
    patch: {
      positive: ["consistent prop design", "same accessory in every view", "detailed prop reference"],
      negative: ["inconsistent props", "different accessories"],
    },
  },
  // 面部/年龄不一致
  {
    keywords: ["facial structure", "age cue", "face shape", "beard", "expression", "cute mascot", "面部"],
    patch: {
      positive: ["consistent facial features", "same face shape and age across views"],
      negative: ["inconsistent facial features", "varying age appearance"],
    },
  },
  // 服装细节不足
  {
    keywords: ["clothing", "costume", "robe", "sleeve", "collar", "belt", "armor", "服装", "衣"],
    patch: {
      positive: ["detailed clothing design", "clear costume layers", "visible fabric texture and seams"],
      negative: ["vague clothing details", "undefined costume edges"],
    },
  },
  // 角色设定图要求
  {
    keywords: ["character sheet", "front", "side", "full-body", "turnaround", "production reference"],
    patch: {
      positive: ["character reference sheet", "front view, 3/4 view, side view", "full body turnaround", "white background", "clean lineart"],
      negative: ["cropped view", "partial body"],
    },
  },
];

/**
 * 根据角色参考图 VLM 评分生成 prompt 修正补丁。
 * 结合通用 ISSUE_PATTERNS 和角色专用 CHARACTER_ISSUE_PATTERNS。
 */
export function generateCharacterPromptPatch(score: CharacterVisualScore): PromptPatch {
  const allPositive = new Set<string>();
  const allNegative = new Set<string>();

  const allPatterns = [...ISSUE_PATTERNS, ...CHARACTER_ISSUE_PATTERNS];

  // 匹配 issues
  for (const issue of score.issues) {
    const issueLower = issue.toLowerCase();
    for (const pattern of allPatterns) {
      if (pattern.keywords.some(kw => issueLower.includes(kw.toLowerCase()))) {
        pattern.patch.positive.forEach(p => allPositive.add(p));
        pattern.patch.negative.forEach(n => allNegative.add(n));
      }
    }
  }

  // 匹配 suggestions
  for (const suggestion of score.suggestions) {
    const suggLower = suggestion.toLowerCase();
    for (const pattern of allPatterns) {
      if (pattern.keywords.some(kw => suggLower.includes(kw.toLowerCase()))) {
        pattern.patch.positive.forEach(p => allPositive.add(p));
        pattern.patch.negative.forEach(n => allNegative.add(n));
      }
    }
  }

  // 基于维度低分自动补丁
  if (score.featureClarity < 6) {
    allPositive.add("sharp details");
    allPositive.add("clear lineart");
    allPositive.add("high detail character design");
    allNegative.add("blurry details");
    allNegative.add("vague features");
  }
  if (score.consistency < 6) {
    allPositive.add("consistent character design across all views");
    allPositive.add("same face, hair, clothing in every panel");
    allNegative.add("inconsistent design");
    allNegative.add("mixed styles");
  }
  if (score.imageQuality < 6) {
    allPositive.add("best quality");
    allPositive.add("masterpiece");
    allNegative.add("low quality");
    allNegative.add("artifacts");
  }

  return {
    positive: Array.from(allPositive),
    negative: Array.from(allNegative),
  };
}
