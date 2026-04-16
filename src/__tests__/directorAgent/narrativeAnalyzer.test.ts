// src/__tests__/directorAgent/narrativeAnalyzer.test.ts

import { describe, it, expect } from "vitest";
import { analyzeNarrative } from "@/lib/directorAgent/analyzer/narrativeAnalyzer";
import type { ComicScript } from "@/lib/types";

describe("narrativeAnalyzer", () => {
  describe("analyzeNarrative", () => {
    it("should return critical suggestion for empty script", () => {
      const script: ComicScript = {
        title: "Test",
        topic: "Test",
        style: "anime",
        panels: [],
      };

      const suggestions = analyzeNarrative(script);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.severity === "critical")).toBe(true);
    });

    it("should analyze a simple script", () => {
      const script: ComicScript = {
        title: "Test Comic",
        topic: "Test Topic",
        style: "anime",
        panels: [
          {
            id: 0,
            scene: "开场场景",
            dialogue: "让我们开始吧！",
            imagePrompt: "image prompt 1",
            status: "completed",
          },
          {
            id: 1,
            scene: "发展场景",
            dialogue: "这是中间部分",
            imagePrompt: "image prompt 2",
            status: "completed",
          },
          {
            id: 2,
            scene: "结束场景",
            dialogue: "总之，这就是全部内容",
            imagePrompt: "image prompt 3",
            status: "completed",
          },
        ],
      };

      const suggestions = analyzeNarrative(script);
      expect(Array.isArray(suggestions)).toBe(true);

      // 每个建议都应有必要字段
      suggestions.forEach(suggestion => {
        expect(suggestion.id).toBeDefined();
        expect(suggestion.type).toBeDefined();
        expect(suggestion.severity).toBeDefined();
        expect(suggestion.title).toBeDefined();
        expect(suggestion.description).toBeDefined();
        expect(suggestion.confidence).toBeGreaterThanOrEqual(0);
        expect(suggestion.confidence).toBeLessThanOrEqual(1);
      });
    });

    it("should sort suggestions by severity and confidence", () => {
      const script: ComicScript = {
        title: "Test",
        topic: "Test",
        style: "anime",
        panels: [
          { id: 0, scene: "1", dialogue: "1", imagePrompt: "1", status: "completed" },
          { id: 1, scene: "2", dialogue: "2", imagePrompt: "2", status: "completed" },
          { id: 2, scene: "3", dialogue: "3", imagePrompt: "3", status: "completed" },
          { id: 3, scene: "4", dialogue: "4", imagePrompt: "4", status: "completed" },
        ],
      };

      const suggestions = analyzeNarrative(script);

      if (suggestions.length >= 2) {
        // 检查排序：critical 应该在 warning 前面，warning 在 info 前面
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        for (let i = 1; i < suggestions.length; i++) {
          const prevSeverity = severityOrder[suggestions[i - 1].severity];
          const currSeverity = severityOrder[suggestions[i].severity];
          expect(prevSeverity).toBeLessThanOrEqual(currSeverity);

          if (prevSeverity === currSeverity) {
            // 同严重度按置信度降序
            expect(suggestions[i - 1].confidence).toBeGreaterThanOrEqual(suggestions[i].confidence);
          }
        }
      }
    });
  });
});
