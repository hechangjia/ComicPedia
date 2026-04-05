// src/lib/directorAgent/suggestionGenerator.ts

import type { ComicScript, GenerateTask, NarrativeOutline } from "../types";
import {
  DirectorAnalysisReport,
  DirectorSuggestion,
  createEmptyCharacterAnalysis,
} from "./types";
import { analyzeNarrative } from "./analyzer/narrativeAnalyzer";
import { analyzeRhythm } from "./analyzer/rhythmAnalyzer";
import { generateShotSuggestions } from "./analyzer/shotAnalyzer";
import { generateRhythmVisualization, calculateOverallScore } from "./visualization";

export async function generateReport(
  script: ComicScript,
  task?: GenerateTask
): Promise<DirectorAnalysisReport> {
  const outline = task?.narrativeOutline;

  // 并行运行各 analyzer
  const [narrativeSuggestions, rhythmAnalysis, shotSuggestions] = await Promise.all([
    Promise.resolve(analyzeNarrative(script, outline)),
    Promise.resolve(analyzeRhythm(script)),
    Promise.resolve(generateShotSuggestions(script, outline)),
  ]);

  // 计算总体评分
  const overallScore = calculateOverallScore(narrativeSuggestions, rhythmAnalysis);

  return {
    analyzedAt: new Date().toISOString(),
    narrativeSuggestions,
    rhythmAnalysis,
    characterAnalysis: createEmptyCharacterAnalysis(), // MVP 占位
    shotSuggestions,
    overallScore,
  };
}

// 导出可视化数据生成，供前端直接使用
export { generateRhythmVisualization };
