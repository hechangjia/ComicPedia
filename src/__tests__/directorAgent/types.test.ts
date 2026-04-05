// src/__tests__/directorAgent/types.test.ts

import { describe, it, expect } from "vitest";
import {
  generateSuggestionId,
  createEmptyCharacterAnalysis,
  type DirectorSuggestion,
  type RhythmAnalysis,
  type ShotSuggestion,
  type DirectorAnalysisReport,
} from "@/lib/directorAgent/types";

describe("directorAgent types", () => {
  describe("generateSuggestionId", () => {
    it("should generate unique IDs", () => {
      const id1 = generateSuggestionId();
      const id2 = generateSuggestionId();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^suggestion_\d+_[a-z0-9]+$/);
    });
  });

  describe("createEmptyCharacterAnalysis", () => {
    it("should create empty character analysis", () => {
      const analysis = createEmptyCharacterAnalysis();
      expect(analysis.characterAppearances.size).toBe(0);
      expect(analysis.visualInconsistencies).toEqual([]);
      expect(analysis.dialogueInconsistencies).toEqual([]);
    });
  });

  describe("type interfaces", () => {
    it("should allow valid DirectorSuggestion", () => {
      const suggestion: DirectorSuggestion = {
        id: "test-1",
        type: "narrative",
        severity: "info",
        title: "Test Suggestion",
        description: "Test description",
        confidence: 0.8,
      };
      expect(suggestion).toBeDefined();
    });

    it("should allow valid RhythmAnalysis", () => {
      const analysis: RhythmAnalysis = {
        panelIntensities: [0.5, 0.7, 0.9],
        infoDensities: [0.6, 0.8, 0.5],
        curveType: "progressive",
        suggestions: [],
      };
      expect(analysis).toBeDefined();
    });

    it("should allow valid ShotSuggestion", () => {
      const suggestion: ShotSuggestion = {
        panelIndex: 0,
        suggestedComposition: "close-up",
        suggestedShotIntent: "hook-closeup",
        rationale: "To emphasize the key point",
      };
      expect(suggestion).toBeDefined();
    });

    it("should allow valid DirectorAnalysisReport", () => {
      const report: DirectorAnalysisReport = {
        analyzedAt: new Date().toISOString(),
        narrativeSuggestions: [],
        rhythmAnalysis: {
          panelIntensities: [],
          infoDensities: [],
          curveType: "progressive",
          suggestions: [],
        },
        characterAnalysis: createEmptyCharacterAnalysis(),
        shotSuggestions: [],
        overallScore: 75,
      };
      expect(report).toBeDefined();
    });
  });
});
