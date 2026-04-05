// src/lib/directorAgent/analyzer/rhythmAnalyzer.ts

import type { ComicScript } from "../../types";
import {
  DirectorSuggestion,
  RhythmAnalysis,
  CurveType,
  generateSuggestionId,
} from "../types";

// 强度关键词（用于启发式评估）
const HIGH_INTENSITY_WORDS = [
  "突然", "惊", "危险", "危机", "爆炸", "冲击", "碰撞",
  "秘密", "真相", "原来", "竟然", "居然", "发现",
  "!", "！", "?"
];

const LOW_INTENSITY_WORDS = [
  "首先", "第一", "开始", "介绍", "简单", "基本",
  "总之", "最后", "总结", "结束", "尾声"
];

export function analyzeRhythm(script: ComicScript): RhythmAnalysis {
  const panels = script.panels || [];
  const panelCount = panels.length;

  // 计算每格的信息密度和强度
  const panelIntensities: number[] = [];
  const infoDensities: number[] = [];

  for (const panel of panels) {
    const sceneText = panel.scene || "";
    const dialogueText = panel.dialogue || "";
    const totalText = sceneText + dialogueText;

    // 信息密度：基于文本长度
    const textLength = totalText.length;
    const density = Math.min(1, textLength / 150); // 150 字为 1.0
    infoDensities.push(density);

    // 强度：基于关键词启发式
    let intensity = 0.3; // 基础强度

    // 检查高强度词
    for (const word of HIGH_INTENSITY_WORDS) {
      if (totalText.includes(word)) {
        intensity += 0.15;
      }
    }

    // 检查低强度词
    for (const word of LOW_INTENSITY_WORDS) {
      if (totalText.includes(word)) {
        intensity -= 0.1;
      }
    }

    // 位置因素：通常中间强度高，首尾较低
    const position = panels.indexOf(panel);
    if (panelCount > 2) {
      const relativePos = position / (panelCount - 1);
      // 钟形曲线：中间最高
      const positionBoost = Math.sin(relativePos * Math.PI) * 0.2;
      intensity += positionBoost;
    }

    intensity = Math.max(0.1, Math.min(0.95, intensity));
    panelIntensities.push(intensity);
  }

  // 确定曲线类型
  const curveType = determineCurveType(panelIntensities, infoDensities);

  // 生成节奏建议
  const suggestions = generateRhythmSuggestions(panelIntensities, infoDensities);

  return {
    panelIntensities,
    infoDensities,
    curveType,
    suggestions,
  };
}

function determineCurveType(
  intensities: number[],
  densities: number[]
): CurveType {
  if (intensities.length < 3) return "progressive";

  // 计算简单的曲线特征
  const firstThird = intensities.slice(0, Math.ceil(intensities.length / 3));
  const lastThird = intensities.slice(Math.floor(intensities.length * 2 / 3));

  const firstAvg = firstThird.reduce((a, b) => a + b, 0) / firstThird.length;
  const lastAvg = lastThird.reduce((a, b) => a + b, 0) / lastThird.length;

  // 检查是否 front-loaded（开头高，结尾低）
  if (firstAvg > lastAvg * 1.3) {
    return "front-loaded";
  }

  // 检查是否 sandwich（头尾高，中间低）
  const middle = intensities.slice(
    Math.ceil(intensities.length / 4),
    Math.floor(intensities.length * 3 / 4)
  );
  if (middle.length > 0) {
    const middleAvg = middle.reduce((a, b) => a + b, 0) / middle.length;
    if (firstAvg > middleAvg * 1.2 && lastAvg > middleAvg * 1.2) {
      return "sandwich";
    }
  }

  // 检查是否 progressive（逐步上升）
  let increasing = true;
  for (let i = 1; i < intensities.length; i++) {
    if (intensities[i] < intensities[i - 1] * 0.8) {
      increasing = false;
      break;
    }
  }
  if (increasing) return "progressive";

  // 检查是否有多个峰值（spiral）
  let peakCount = 0;
  for (let i = 1; i < intensities.length - 1; i++) {
    if (intensities[i] > intensities[i - 1] * 1.1 &&
        intensities[i] > intensities[i + 1] * 1.1) {
      peakCount++;
    }
  }
  if (peakCount >= 2) return "spiral";

  return "unbalanced";
}

function generateRhythmSuggestions(
  intensities: number[],
  densities: number[]
): DirectorSuggestion[] {
  const suggestions: DirectorSuggestion[] = [];

  if (intensities.length < 3) return suggestions;

  // 检查是否过于平淡（方差太小）
  const intensityVariance = calculateVariance(intensities);
  if (intensityVariance < 0.02) {
    suggestions.push({
      id: generateSuggestionId(),
      type: "rhythm",
      severity: "warning",
      title: "节奏偏平淡",
      description: "各面板的情感强度比较平均，缺少起伏",
      suggestion: "尝试让某些面板更有张力，某些面板更平缓，形成节奏变化",
      confidence: 0.7,
    });
  }

  // 检查是否有连续的高/低密度
  for (let i = 1; i < densities.length - 1; i++) {
    const prev = densities[i - 1];
    const curr = densities[i];
    const next = densities[i + 1];

    // 连续高密度
    if (prev > 0.7 && curr > 0.7 && next > 0.7) {
      suggestions.push({
        id: generateSuggestionId(),
        type: "rhythm",
        severity: "warning",
        panelIndex: i,
        title: "信息密度过高",
        description: `第 ${i}-${i + 2} 格的信息量都比较高，可能造成阅读疲劳`,
        suggestion: "考虑将中间某个面板的内容简化，或拆分成多个面板",
        confidence: 0.6,
      });
      break; // 只报告一次
    }
  }

  // 检查结尾强度是否合适
  const lastIntensity = intensities[intensities.length - 1];
  if (lastIntensity > 0.7) {
    suggestions.push({
      id: generateSuggestionId(),
      type: "rhythm",
      severity: "info",
      panelIndex: intensities.length - 1,
      title: "结尾强度较高",
      description: "最后一格的情感强度偏高，可以考虑稍微降低以形成收尾感",
      suggestion: "尝试让最后一格更平和、更有总结感",
      confidence: 0.5,
    });
  }

  return suggestions;
}

function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
}
