// src/__tests__/directorAgent/suggestionGenerator.test.ts

import { describe, it, expect } from "vitest";
import { generateReport } from "@/lib/directorAgent/suggestionGenerator";
import type { ComicScript, GenerateTask } from "@/lib/types";

describe("suggestionGenerator", () => {
  describe("generateReport", () => {
    it("should generate a complete analysis report", async () => {
      const script: ComicScript = {
        title: "Test Comic",
        topic: "Test Topic",
        style: "anime",
        panels: [
          { id: 0, scene: "开场", dialogue: "让我们开始", imagePrompt: "1", status: "completed" },
          { id: 1, scene: "发展", dialogue: "这是核心内容", imagePrompt: "2", status: "completed" },
          { id: 2, scene: "结尾", dialogue: "总结一下", imagePrompt: "3", status: "completed" },
        ],
      };

      const report = await generateReport(script);

      // 检查报告结构
      expect(report.analyzedAt).toBeDefined();
      expect(report.narrativeSuggestions).toBeDefined();
      expect(report.rhythmAnalysis).toBeDefined();
      expect(report.characterAnalysis).toBeDefined();
      expect(report.shotSuggestions).toBeDefined();
      expect(report.overallScore).toBeDefined();

      // 检查评分范围
      expect(report.overallScore).toBeGreaterThanOrEqual(0);
      expect(report.overallScore).toBeLessThanOrEqual(100);

      // 检查分镜建议数量匹配
      expect(report.shotSuggestions).toHaveLength(3);

      // 检查角色分析是占位状态
      expect(report.characterAnalysis.characterAppearances.size).toBe(0);
    });

    it("should work with task outline", async () => {
      const script: ComicScript = {
        title: "Test",
        topic: "Test",
        style: "anime",
        panels: [
          { id: 0, scene: "1", dialogue: "1", imagePrompt: "1", status: "completed" },
        ],
      };

      const task: GenerateTask = {
        id: "test-task",
        status: "completed",
        createdAt: new Date(),
        updatedAt: new Date(),
        progress: 0,
        script,
        narrativeOutline: {
          totalPanels: 1,
          templateType: "mechanism",
          source: "beat-plan",
          panels: [{
            narrativeFunction: "opening",
            beatRole: "hook",
            suggestedComposition: "close-up",
            shotIntent: "hook-closeup",
            characters: [],
            keyInfo: "test",
            knowledgeGoal: "test",
            infoDensity: "low",
            intensity: "high",
            carryForward: "test",
          }],
          characterList: [],
          infoDistribution: "progressive",
          narrativeArc: "test",
        },
      };

      const report = await generateReport(script, task);
      expect(report).toBeDefined();
      expect(report.shotSuggestions[0].suggestedComposition).toBe("close-up");
    });
  });
});
