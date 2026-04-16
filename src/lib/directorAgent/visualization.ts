// src/lib/directorAgent/visualization.ts

import type { RhythmAnalysis, RhythmVisualizationData } from "./types";

export function generateRhythmVisualization(
  analysis: RhythmAnalysis
): RhythmVisualizationData {
  const { panelIntensities, infoDensities, curveType } = analysis;
  const panelCount = panelIntensities.length;

  // 生成标签
  const labels = Array.from({ length: panelCount }, (_, i) => `第${i + 1}格`);

  // 生成建议曲线（基于曲线类型的理想曲线）
  const suggestedCurve = generateSuggestedCurve(panelCount, curveType);

  return {
    labels,
    intensityData: panelIntensities,
    densityData: infoDensities,
    suggestedCurve,
  };
}

function generateSuggestedCurve(panelCount: number, curveType: string): number[] {
  const curve: number[] = [];

  for (let i = 0; i < panelCount; i++) {
    const relativePos = panelCount > 1 ? i / (panelCount - 1) : 0.5;

    switch (curveType) {
      case "progressive":
        // 渐进式：逐渐上升
        curve.push(0.3 + relativePos * 0.5);
        break;

      case "front-loaded":
        // 前重式：开头高，然后下降
        curve.push(0.7 - relativePos * 0.3);
        break;

      case "sandwich":
        // 三明治式：头尾高，中间低
        curve.push(0.6 - Math.sin(relativePos * Math.PI) * 0.2);
        break;

      case "spiral":
        // 螺旋式：多个峰值
        curve.push(0.4 + Math.sin(relativePos * Math.PI * 2) * 0.2);
        break;

      case "unbalanced":
      default:
        // 默认：经典叙事弧线（钟形曲线）
        curve.push(0.3 + Math.sin(relativePos * Math.PI) * 0.4);
        break;
    }
  }

  return curve;
}

// Helper: 计算总体导演评分（0-100）
export function calculateOverallScore(
  narrativeSuggestions: { severity: string }[],
  rhythmAnalysis: { suggestions: { severity: string }[] }
): number {
  let score = 80; // 基础分

  // 叙事建议扣分
  for (const suggestion of narrativeSuggestions) {
    switch (suggestion.severity) {
      case "critical":
        score -= 10;
        break;
      case "warning":
        score -= 5;
        break;
      case "info":
        score -= 2;
        break;
    }
  }

  // 节奏建议扣分
  for (const suggestion of rhythmAnalysis.suggestions) {
    switch (suggestion.severity) {
      case "critical":
        score -= 8;
        break;
      case "warning":
        score -= 4;
        break;
      case "info":
        score -= 1;
        break;
    }
  }

  return Math.max(0, Math.min(100, score));
}
