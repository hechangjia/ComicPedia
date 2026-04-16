// src/lib/directorAgent/types.ts

import type { ComicScript, NarrativeOutline, GenerateTask } from "../types";

// 建议类型
export type SuggestionSeverity = "info" | "warning" | "critical";

export interface DirectorSuggestion {
  id: string;
  type: "narrative" | "rhythm" | "character" | "shot";
  severity: SuggestionSeverity;
  panelIndex?: number;
  title: string;
  description: string;
  suggestion?: string;
  confidence: number;
}

// 节奏分析结果
export type CurveType = "progressive" | "front-loaded" | "spiral" | "sandwich" | "unbalanced";

export interface RhythmAnalysis {
  panelIntensities: number[];
  infoDensities: number[];
  curveType: CurveType;
  suggestions: DirectorSuggestion[];
}

// 角色一致性分析（MVP 占位，第 2 期实现）
export interface CharacterConsistencyAnalysis {
  characterAppearances: Map<string, number[]>;
  visualInconsistencies: DirectorSuggestion[];
  dialogueInconsistencies: DirectorSuggestion[];
}

// 分镜建议
export interface ShotSuggestion {
  panelIndex: number;
  suggestedComposition: string;
  suggestedShotIntent: string;
  rationale: string;
}

// 可视化数据
export interface RhythmVisualizationData {
  labels: string[];
  intensityData: number[];
  densityData: number[];
  suggestedCurve: number[];
}

// 完整分析报告
export interface DirectorAnalysisReport {
  analyzedAt: string;
  narrativeSuggestions: DirectorSuggestion[];
  rhythmAnalysis: RhythmAnalysis;
  characterAnalysis: CharacterConsistencyAnalysis;
  shotSuggestions: ShotSuggestion[];
  overallScore: number;
}

// Helper: 生成唯一建议 ID
export function generateSuggestionId(): string {
  return `suggestion_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Helper: 创建占位的角色一致性分析
export function createEmptyCharacterAnalysis(): CharacterConsistencyAnalysis {
  return {
    characterAppearances: new Map(),
    visualInconsistencies: [],
    dialogueInconsistencies: [],
  };
}
