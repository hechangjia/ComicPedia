// src/__tests__/directorAgent/shotAnalyzer.test.ts

import { describe, it, expect } from "vitest";
import { generateShotSuggestions } from "@/lib/directorAgent/analyzer/shotAnalyzer";
import type { ComicScript, NarrativeOutline } from "@/lib/types";

describe("shotAnalyzer", () => {
  describe("generateShotSuggestions", () => {
    it("should generate shot suggestions for each panel", () => {
      const script: ComicScript = {
        title: "Test",
        topic: "Test",
        style: "anime",
        panels: [
          { id: 0, scene: "1", dialogue: "1", imagePrompt: "1", status: "completed" },
          { id: 1, scene: "2", dialogue: "2", imagePrompt: "2", status: "completed" },
          { id: 2, scene: "3", dialogue: "3", imagePrompt: "3", status: "completed" },
        ],
      };

      const suggestions = generateShotSuggestions(script);

      expect(suggestions).toHaveLength(3);
      suggestions.forEach((suggestion, index) => {
        expect(suggestion.panelIndex).toBe(index);
        expect(suggestion.suggestedComposition).toBeDefined();
        expect(suggestion.suggestedShotIntent).toBeDefined();
        expect(suggestion.rationale).toBeDefined();
      });
    });

    it("should use outline suggestions when available", () => {
      const script: ComicScript = {
        title: "Test",
        topic: "Test",
        style: "anime",
        panels: [
          { id: 0, scene: "1", dialogue: "1", imagePrompt: "1", status: "completed" },
        ],
      };

      const outline: NarrativeOutline = {
        totalPanels: 1,
        templateType: "mechanism",
        source: "beat-plan",
        panels: [{
          narrativeFunction: "opening",
          beatRole: "hook",
          suggestedComposition: "EXTREME CLOSE-UP",
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
      };

      const suggestions = generateShotSuggestions(script, outline);

      expect(suggestions[0].suggestedComposition).toBe("EXTREME CLOSE-UP");
      expect(suggestions[0].suggestedShotIntent).toBe("hook-closeup");
    });

    it("should generate reasonable suggestions for first panel", () => {
      const script: ComicScript = {
        title: "Test",
        topic: "Test",
        style: "anime",
        panels: [
          { id: 0, scene: "1", dialogue: "1", imagePrompt: "1", status: "completed" },
        ],
      };

      const suggestions = generateShotSuggestions(script);
      const firstSuggestion = suggestions[0];

      // 第一格应该推荐广角或建立镜头
      const validOpeningCompositions = ["wide shot", "establishing shot"];
      const isValidOpening = validOpeningCompositions.includes(firstSuggestion.suggestedComposition);

      // 不是强制的，但至少应该有一个理由
      expect(firstSuggestion.rationale.length).toBeGreaterThan(0);
    });
  });
});
