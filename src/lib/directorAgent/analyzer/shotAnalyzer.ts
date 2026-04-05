// src/lib/directorAgent/analyzer/shotAnalyzer.ts

import type { ComicScript, NarrativeOutline } from "../../types";
import { ShotSuggestion } from "../types";

// 推荐的构图选项
const COMPOSITIONS = [
  "wide shot", "close-up", "medium shot", "bird's-eye view",
  "low angle", "over-the-shoulder", "dynamic angle", "establishing shot"
];

// 基于 beat role 的推荐 shot intent
const BEAT_ROLE_TO_SHOT: Record<string, string[]> = {
  "hook": ["hook-closeup", "contrast"],
  "conflict": ["contrast", "process"],
  "reveal": ["reveal"],
  "progression": ["process"],
  "closure": ["aftermath", "reveal"],
};

// 基于叙事功能的推荐构图
const NARRATIVE_FUNCTION_TO_COMPOSITION: Record<string, string[]> = {
  "opening": ["establishing shot", "wide shot"],
  "setup": ["medium shot", "wide shot"],
  "development": ["medium shot", "over-the-shoulder"],
  "climax": ["close-up", "low angle", "dynamic angle"],
  "resolution": ["medium shot", "wide shot"],
  "epilogue": ["wide shot", "bird's-eye view"],
};

export function generateShotSuggestions(
  script: ComicScript,
  outline?: NarrativeOutline
): ShotSuggestion[] {
  const suggestions: ShotSuggestion[] = [];
  const panels = script.panels || [];

  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i];
    const outlinePanel = outline?.panels?.[i];

    // 获取基础推荐
    let suggestedComposition = getRecommendedComposition(i, panels.length, outlinePanel);
    let suggestedShotIntent = getRecommendedShotIntent(outlinePanel);
    let rationale = buildRationale(i, panels.length, outlinePanel);

    // 如果 outline 已有建议，优先使用
    if (outlinePanel?.suggestedComposition) {
      suggestedComposition = outlinePanel.suggestedComposition;
    }
    if (outlinePanel?.shotIntent) {
      suggestedShotIntent = outlinePanel.shotIntent;
    }

    suggestions.push({
      panelIndex: i,
      suggestedComposition,
      suggestedShotIntent,
      rationale,
    });
  }

  // 检查镜头多样性
  addDiversitySuggestions(suggestions);

  return suggestions;
}

function getRecommendedComposition(
  panelIndex: number,
  totalPanels: number,
  outlinePanel?: NarrativeOutline["panels"][0]
): string {
  // 优先使用 outline 的叙事功能
  if (outlinePanel?.narrativeFunction) {
    const options = NARRATIVE_FUNCTION_TO_COMPOSITION[outlinePanel.narrativeFunction];
    if (options) {
      return options[Math.floor(Math.random() * options.length)];
    }
  }

  // 基于位置的启发式推荐
  const relativePos = totalPanels > 1 ? panelIndex / (totalPanels - 1) : 0.5;

  if (panelIndex === 0) {
    // 第一格：常用广角或建立镜头
    return Math.random() > 0.5 ? "wide shot" : "establishing shot";
  }

  if (panelIndex === totalPanels - 1) {
    // 最后一格：常用广角
    return "wide shot";
  }

  if (relativePos > 0.4 && relativePos < 0.6) {
    // 中间：可能是高潮，推荐特写或低角度
    const climaxOptions = ["close-up", "low angle", "dynamic angle", "medium shot"];
    return climaxOptions[Math.floor(Math.random() * climaxOptions.length)];
  }

  // 默认：中景
  return "medium shot";
}

function getRecommendedShotIntent(
  outlinePanel?: NarrativeOutline["panels"][0]
): string {
  if (outlinePanel?.beatRole) {
    const options = BEAT_ROLE_TO_SHOT[outlinePanel.beatRole];
    if (options) {
      return options[Math.floor(Math.random() * options.length)];
    }
  }
  return "process"; // 默认
}

function buildRationale(
  panelIndex: number,
  totalPanels: number,
  outlinePanel?: NarrativeOutline["panels"][0]
): string {
  const parts: string[] = [];

  if (panelIndex === 0) {
    parts.push("开场使用广角镜头，建立场景环境");
  } else if (panelIndex === totalPanels - 1) {
    parts.push("结尾使用广角镜头，提供收尾感");
  }

  if (outlinePanel?.narrativeFunction) {
    parts.push(`适配 ${outlinePanel.narrativeFunction} 叙事功能`);
  }

  if (outlinePanel?.beatRole) {
    parts.push(`强化 ${outlinePanel.beatRole} 节奏点`);
  }

  if (parts.length === 0) {
    parts.push("平衡的镜头选择，保证视觉多样性");
  }

  return parts.join("；");
}

function addDiversitySuggestions(suggestions: ShotSuggestion[]): void {
  if (suggestions.length < 3) return;

  // 检查是否有连续重复的构图
  for (let i = 1; i < suggestions.length; i++) {
    const prev = suggestions[i - 1];
    const curr = suggestions[i];

    if (prev.suggestedComposition === curr.suggestedComposition) {
      // 找到一个不同的构图
      const alternatives = COMPOSITIONS.filter(c => c !== curr.suggestedComposition);
      if (alternatives.length > 0) {
        // 修改当前建议，增加多样性
        // 注意：这里我们不直接修改，而是让 suggestionGenerator 来处理
        // 这里仅用于识别问题
      }
    }
  }
}
