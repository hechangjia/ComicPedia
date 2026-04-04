import { describe, it, expect } from "vitest";
import { updateCharacterArc, getArcSummary } from "@/lib/series";
import { buildCharacterContext } from "@/lib/characterContext";
import type { CharacterPersonality, CharacterArc, Character } from "@/lib/types";

function makePersonality(overrides?: Partial<CharacterPersonality>): CharacterPersonality {
  return {
    traits: [{ dimension: "openness", value: 0.8, label: "curious" }],
    speechStyle: "formal",
    emotionalState: { primary: "calm", intensity: 0.5 },
    ...overrides,
  };
}

function makeCharacter(overrides?: Partial<Character>): Character {
  return {
    id: "char_1",
    name: "Alice",
    description: "A brave explorer",
    appearance: { gender: "female", age: "25", hair: "black", eyes: "brown", clothing: "jacket" },
    style: "anime",
    avatarUrl: null,
    referenceEntries: [],
    tags: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  };
}

describe("updateCharacterArc", () => {
  it("creates a new arc when none exists", () => {
    const p = makePersonality();
    const updated = updateCharacterArc(p, "series_1", 1, "discovered treasure", "excited");

    expect(updated.arc).toBeDefined();
    expect(updated.arc!.seriesId).toBe("series_1");
    expect(updated.arc!.startState).toBe("calm");
    expect(updated.arc!.currentState).toBe("excited");
    expect(updated.arc!.turningPoints).toHaveLength(1);
    expect(updated.arc!.turningPoints[0]).toEqual({
      episodeNumber: 1,
      event: "discovered treasure",
      stateAfter: "excited",
    });
  });

  it("uses 'neutral' as startState when emotionalState is missing", () => {
    const p: CharacterPersonality = {
      traits: [],
      speechStyle: "casual",
      emotionalState: undefined as unknown as CharacterPersonality["emotionalState"],
    };
    const updated = updateCharacterArc(p, "series_1", 1, "woke up", "confused");
    expect(updated.arc!.startState).toBe("neutral");
  });

  it("appends to an existing arc", () => {
    const existingArc: CharacterArc = {
      seriesId: "series_1",
      startState: "calm",
      currentState: "excited",
      turningPoints: [{ episodeNumber: 1, event: "discovered treasure", stateAfter: "excited" }],
    };
    const p = makePersonality({ arc: existingArc });
    const updated = updateCharacterArc(p, "series_1", 2, "lost a friend", "grieving");

    expect(updated.arc!.turningPoints).toHaveLength(2);
    expect(updated.arc!.currentState).toBe("grieving");
    expect(updated.arc!.startState).toBe("calm");
  });

  it("does not mutate the original personality", () => {
    const p = makePersonality();
    const updated = updateCharacterArc(p, "s1", 1, "event", "state");
    expect(p.arc).toBeUndefined();
    expect(updated.arc).toBeDefined();
  });
});

describe("getArcSummary", () => {
  it("returns readable summary with turning points", () => {
    const arc: CharacterArc = {
      seriesId: "s1",
      startState: "calm",
      currentState: "determined",
      turningPoints: [
        { episodeNumber: 1, event: "faced danger", stateAfter: "afraid" },
        { episodeNumber: 3, event: "overcame fear", stateAfter: "determined" },
      ],
    };
    const summary = getArcSummary(arc);
    expect(summary).toContain('Started as "calm"');
    expect(summary).toContain('Episode 1: faced danger → "afraid"');
    expect(summary).toContain('Episode 3: overcame fear → "determined"');
    expect(summary).toContain('Currently: "determined"');
  });

  it("omits currentState line when not set", () => {
    const arc: CharacterArc = {
      seriesId: "s1",
      startState: "happy",
      turningPoints: [],
    };
    const summary = getArcSummary(arc);
    expect(summary).toBe('Started as "happy"');
    expect(summary).not.toContain("Currently");
  });
});

describe("buildCharacterContext with arc", () => {
  it("includes arc summary in character description", () => {
    const arc: CharacterArc = {
      seriesId: "s1",
      startState: "calm",
      currentState: "brave",
      turningPoints: [{ episodeNumber: 1, event: "saved a village", stateAfter: "brave" }],
    };
    const char = makeCharacter({ personality: makePersonality({ arc }) });
    const result = buildCharacterContext([char], []);
    expect(result.text).toContain("Arc:");
    expect(result.text).toContain('Started as "calm"');
  });

  it("includes arc in STORY CONTINUITY section when seriesContext is present", () => {
    const arc: CharacterArc = {
      seriesId: "s1",
      startState: "calm",
      currentState: "brave",
      turningPoints: [{ episodeNumber: 1, event: "saved a village", stateAfter: "brave" }],
    };
    const char = makeCharacter({ personality: makePersonality({ arc }) });
    const result = buildCharacterContext([char], [], {
      episodeNumber: 2,
      seriesTitle: "The Great Adventure",
    });
    expect(result.text).toContain("STORY CONTINUITY");
    expect(result.text).toContain("Alice arc:");
  });

  it("does not include arc line when no arc exists", () => {
    const char = makeCharacter({ personality: makePersonality() });
    const result = buildCharacterContext([char], []);
    expect(result.text).not.toContain("Arc:");
  });
});
