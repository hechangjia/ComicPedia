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

import { PanelVisualScore } from "./types";

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

  return `${originalPrompt.replace(/,?\s*$/, "")}, ${newTerms.join(", ")}`;
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
