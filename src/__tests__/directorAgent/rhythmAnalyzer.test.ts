// src/__tests__/directorAgent/rhythmAnalyzer.test.ts

import { describe, it, expect } from "vitest";
import { analyzeRhythm } from "@/lib/directorAgent/analyzer/rhythmAnalyzer";
import {
  generateRhythmVisualization,
  calculateOverallScore,
} from "@/lib/directorAgent/visualization";
import type { ComicScript } from "@/lib/types";

describe("rhythmAnalyzer", () => {
  describe("analyzeRhythm", () => {
    it("should return rhythm analysis for a script", () => {
      const script: ComicScript = {
        title: "Test",
        topic: "Test",
        style: "anime",
        panels: [
          { id: 0, scene: "开场", dialogue: "让我们开始介绍这个概念", imagePrompt: "1", status: "completed" },
          { id: 1, scene: "发展", dialogue: "这是核心内容，非常重要！", imagePrompt: "2", status: "completed" },
          { id: 2, scene: "高潮", dialogue: "原来如此！这才是真相！", imagePrompt: "3", status: "completed" },
          { id: 3, scene: "结尾", dialogue: "总之，这就是全部内容", imagePrompt: "4", status: "completed" },
        ],
      };

      const analysis = analyzeRhythm(script);

      expect(analysis.panelIntensities).toHaveLength(4);
      expect(analysis.infoDensities).toHaveLength(4);
      expect(analysis.curveType).toBeDefined();
      expect(Array.isArray(analysis.suggestions)).toBe(true);

      // 所有强度和密度都应在 0-1 之间
      analysis.panelIntensities.forEach(intensity => {
        expect(intensity).toBeGreaterThanOrEqual(0);
        expect(intensity).toBeLessThanOrEqual(1);
      });
      analysis.infoDensities.forEach(density => {
        expect(density).toBeGreaterThanOrEqual(0);
        expect(density).toBeLessThanOrEqual(1);
      });
    });

    it("should handle empty panels", () => {
      const script: ComicScript = {
        title: "Test",
        topic: "Test",
        style: "anime",
        panels: [],
      };

      const analysis = analyzeRhythm(script);
      expect(analysis.panelIntensities).toEqual([]);
      expect(analysis.infoDensities).toEqual([]);
    });
  });

  describe("generateRhythmVisualization", () => {
    it("should generate visualization data", () => {
      const analysis = {
        panelIntensities: [0.3, 0.5, 0.7, 0.5],
        infoDensities: [0.4, 0.6, 0.8, 0.5],
        curveType: "progressive" as const,
        suggestions: [],
      };

      const visualization = generateRhythmVisualization(analysis);

      expect(visualization.labels).toHaveLength(4);
      expect(visualization.intensityData).toEqual(analysis.panelIntensities);
      expect(visualization.densityData).toEqual(analysis.infoDensities);
      expect(visualization.suggestedCurve).toHaveLength(4);

      visualization.labels.forEach((label, i) => {
        expect(label).toBe(`第${i + 1}格`);
      });
    });
  });

  describe("calculateOverallScore", () => {
    it("should calculate score based on suggestions", () => {
      // 没有建议时应该高分
      const score1 = calculateOverallScore([], { suggestions: [] });
      expect(score1).toBe(80);

      // 有警告时应该扣分
      const score2 = calculateOverallScore(
        [{ severity: "warning" }],
        { suggestions: [] }
      );
      expect(score2).toBeLessThan(80);

      // 有严重问题时应该扣更多
      const score3 = calculateOverallScore(
        [{ severity: "critical" }],
        { suggestions: [] }
      );
      expect(score3).toBeLessThan(score2);

      // 分数不应该低于 0 或高于 100
      const score4 = calculateOverallScore(
        Array(20).fill({ severity: "critical" }),
        { suggestions: Array(20).fill({ severity: "critical" }) }
      );
      expect(score4).toBeGreaterThanOrEqual(0);
    });
  });
});
