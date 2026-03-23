import { GenerationQuality } from "@/lib/types";

/** 质量预设配置 — 仅控制生成详细度，不涉及面板数量 */
export interface QualityPreset {
  label: string;
  icon: string;
  desc: string;
  /** 用户友好的时间预估 */
  timeHint: string;
  /** Agent 功能列表（用于 tooltip） */
  agents: string[];
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
    desc: "适合草稿预览",
    timeHint: "约30秒",
    agents: ["脚本生成"],
    maxTokens: 2000,
    inferenceSteps: 20,
    promptHint: "用简洁的语言描述，每个面板的描述控制在 1-2 句话",
  },
  standard: {
    label: "标准",
    icon: "⭐",
    desc: "智能编排，均衡质量",
    timeHint: "约1-2分钟",
    agents: ["主题研究", "Wikipedia", "叙事大纲", "脚本校验", "自动修复"],
    maxTokens: 4000,
    inferenceSteps: 30,
    promptHint: "用适中的细节描述场景和对话，确保叙事完整",
  },
  fine: {
    label: "精细",
    icon: "💎",
    desc: "AI 全流程审核",
    timeHint: "约3-5分钟",
    agents: ["主题研究", "Wikipedia", "叙事大纲", "脚本校验", "自动修复", "VLM 视觉评审", "自动修图"],
    maxTokens: 8000,
    inferenceSteps: 50,
    promptHint: "提供丰富的视觉细节描述，包括光影、构图、色调、人物表情和肢体语言",
  },
};

/** 质量档位中文映射 */
export const QUALITY_LABEL_MAP: Record<string, string> = {
  fast: "快速",
  standard: "标准",
  fine: "精细",
};
