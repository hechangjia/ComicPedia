import { GenerationQuality } from "@/lib/types";

/** 质量预设配置 — 仅控制生成详细度，不涉及面板数量 */
export interface QualityPreset {
  label: string;
  icon: string;
  desc: string;
  /** LLM 最大 token 预算 */
  maxTokens: number;
  /** 图片生成推理步数 */
  inferenceSteps: number;
  /** prompt 详细度提示语（注入 LLM system prompt） */
  promptHint: string;
}

export const QUALITY_PRESETS: Record<GenerationQuality, QualityPreset> = {
  fast: {
    label: "快速",
    icon: "⚡",
    desc: "简短脚本，快速出图",
    maxTokens: 2000,
    inferenceSteps: 20,
    promptHint: "用简洁的语言描述，每个面板的描述控制在 1-2 句话",
  },
  standard: {
    label: "标准",
    icon: "⭐",
    desc: "均衡质量与速度",
    maxTokens: 4000,
    inferenceSteps: 30,
    promptHint: "用适中的细节描述场景和对话，确保叙事完整",
  },
  fine: {
    label: "精细",
    icon: "💎",
    desc: "详细脚本，高质量出图",
    maxTokens: 8000,
    inferenceSteps: 50,
    promptHint: "提供丰富的视觉细节描述，包括光影、构图、色调、人物表情和肢体语言",
  },
};
