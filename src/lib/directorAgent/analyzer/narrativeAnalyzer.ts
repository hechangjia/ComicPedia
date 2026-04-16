// src/lib/directorAgent/analyzer/narrativeAnalyzer.ts

import type { ComicScript, NarrativeOutline } from "../../types";
import {
  DirectorSuggestion,
  generateSuggestionId,
} from "../types";

const VALID_NARRATIVE_FUNCTIONS = new Set([
  "opening", "setup", "development", "climax", "resolution", "epilogue"
]);

const VALID_BEAT_ROLES = new Set([
  "hook", "conflict", "reveal", "progression", "closure"
]);

/**
 * 分析叙事结构完整性
 */
export function analyzeNarrative(
  script: ComicScript,
  outline?: NarrativeOutline
): DirectorSuggestion[] {
  const suggestions: DirectorSuggestion[] = [];
  const panels = script.panels || [];
  const panelCount = panels.length;

  if (panelCount === 0) {
    suggestions.push({
      id: generateSuggestionId(),
      type: "narrative",
      severity: "critical",
      title: "缺少面板",
      description: "脚本没有包含任何面板",
      confidence: 1.0,
    });
    return suggestions;
  }

  // 检查是否有 hook
  const hasHook = checkForHook(panels, outline);
  if (!hasHook) {
    suggestions.push({
      id: generateSuggestionId(),
      type: "narrative",
      severity: "warning",
      panelIndex: 0,
      title: "建议增强开场钩子",
      description: "第 1 格可以设置一个更强的钩子来吸引读者注意力",
      suggestion: "尝试在第 1 格添加一个引人好奇的问题或视觉冲击",
      confidence: 0.7,
    });
  }

  // 检查信息密度分布
  const densitySuggestions = checkInfoDensityDistribution(panels);
  suggestions.push(...densitySuggestions);

  // 检查叙事完整性
  const completenessSuggestions = checkNarrativeCompleteness(panels, outline);
  suggestions.push(...completenessSuggestions);

  // 检查是否有足够的 reveal
  const revealSuggestions = checkRevealCount(panels, outline);
  suggestions.push(...revealSuggestions);

  return suggestions.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.confidence - a.confidence;
  });
}

function checkForHook(
  panels: ComicScript["panels"],
  outline?: NarrativeOutline
): boolean {
  // 检查 outline 的 beatRole
  if (outline?.panels?.[0]?.beatRole === "hook") {
    return true;
  }

  // 检查第一格的内容是否有钩子特征
  const firstPanel = panels[0];
  if (!firstPanel) return false;

  const text = `${firstPanel.scene || ""} ${firstPanel.dialogue || ""}`.toLowerCase();

  // 简单启发式：检查是否有问题、惊讶、或冲突词汇
  const hookIndicators = [
    "?", "为什么", "怎么", "什么", "居然", "竟然", "突然",
    "发现", "秘密", "真相", "危机", "危险", "意外"
  ];

  return hookIndicators.some(indicator => text.includes(indicator));
}

function checkInfoDensityDistribution(
  panels: ComicScript["panels"]
): DirectorSuggestion[] {
  const suggestions: DirectorSuggestion[] = [];
  const densities = panels.map(panel => {
    const textLength = (panel.scene?.length || 0) + (panel.dialogue?.length || 0);
    return Math.min(1, textLength / 200); // 0-1 归一化
  });

  // 检查是否所有面板密度都差不多（太平淡）
  const densityVariance = calculateVariance(densities);
  if (densities.length >= 4 && densityVariance < 0.02) {
    suggestions.push({
      id: generateSuggestionId(),
      type: "narrative",
      severity: "info",
      title: "节奏偏平淡",
      description: "各面板的信息量比较平均，可以考虑增加变化",
      suggestion: "尝试让某些面板更简洁，某些面板更详细，形成节奏变化",
      confidence: 0.6,
    });
  }

  // 检查是否中间密度过高
  if (densities.length >= 6) {
    const middleDensities = densities.slice(2, -2);
    const middleAvg = middleDensities.reduce((a, b) => a + b, 0) / middleDensities.length;
    const overallAvg = densities.reduce((a, b) => a + b, 0) / densities.length;

    if (middleAvg > overallAvg * 1.5) {
      suggestions.push({
        id: generateSuggestionId(),
        type: "narrative",
        severity: "warning",
        title: "中间面板信息过载",
        description: "中间部分的信息量明显偏高，可能造成阅读压力",
        suggestion: "考虑将中间部分的信息分散到更多面板，或简化某些面板的内容",
        confidence: 0.7,
      });
    }
  }

  return suggestions;
}

function checkNarrativeCompleteness(
  panels: ComicScript["panels"],
  outline?: NarrativeOutline
): DirectorSuggestion[] {
  const suggestions: DirectorSuggestion[] = [];
  const panelCount = panels.length;

  if (panelCount < 4) {
    suggestions.push({
      id: generateSuggestionId(),
      type: "narrative",
      severity: "info",
      title: "面板较少",
      description: `${panelCount} 格的漫画可以讲清楚一个简单概念，但更丰富的叙事建议 6-8 格`,
      confidence: 0.5,
    });
  }

  // 检查最后一格是否有收尾感
  const lastPanel = panels[panelCount - 1];
  if (lastPanel) {
    const lastText = `${lastPanel.scene || ""} ${lastPanel.dialogue || ""}`.toLowerCase();
    const closureIndicators = [
      "总之", "最后", "总结", "因此", "所以", "现在", "从此",
      "conclusion", "finally", "in summary", "thus"
    ];
    const hasClosure = closureIndicators.some(indicator => lastText.includes(indicator));

    if (!hasClosure && panelCount >= 4) {
      suggestions.push({
        id: generateSuggestionId(),
        type: "narrative",
        severity: "info",
        panelIndex: panelCount - 1,
        title: "建议增强收尾",
        description: "最后一格可以添加一个明确的总结或收尾感",
        suggestion: "尝试用一句话总结核心要点，或展示一个最终状态",
        confidence: 0.5,
      });
    }
  }

  return suggestions;
}

function checkRevealCount(
  panels: ComicScript["panels"],
  outline?: NarrativeOutline
): DirectorSuggestion[] {
  const suggestions: DirectorSuggestion[] = [];

  // 计算 outline 中的 reveal 数量
  let revealCount = 0;
  if (outline?.panels) {
    revealCount = outline.panels.filter(p => p.beatRole === "reveal").length;
  }

  // 如果没有 outline，启发式检查内容
  if (revealCount === 0 && panels.length >= 4) {
    const hasRevealLikeContent = panels.some(panel => {
      const text = `${panel.scene || ""} ${panel.dialogue || ""}`.toLowerCase();
      return text.includes("原来") || text.includes("发现") ||
             text.includes("其实") || text.includes("reveal");
    });

    if (!hasRevealLikeContent) {
      suggestions.push({
        id: generateSuggestionId(),
        type: "narrative",
        severity: "info",
        title: "可以增加揭示点",
        description: "漫画中可以考虑设置 1-2 个揭示点来增加趣味性",
        suggestion: "在中间某个位置设置一个小转折或知识点揭示",
        confidence: 0.5,
      });
    }
  }

  return suggestions;
}

function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
}
