import { describe, it, expect } from "vitest";
import type {
  CharacterRelation,
  RelationType,
  RelationEvent,
  PersonalityTrait,
  EmotionalState,
  CharacterArc,
  CharacterPersonality,
} from "@/lib/types";

describe("Character Relations types", () => {
  it("should accept valid RelationType values", () => {
    const validTypes: RelationType[] = [
      "friend", "rival", "mentor", "lover", "family", "ally", "enemy",
    ];
    expect(validTypes).toHaveLength(7);
  });

  it("should construct a valid CharacterRelation", () => {
    const relation: CharacterRelation = {
      id: "rel_1",
      fromId: "char_a",
      toId: "char_b",
      type: "friend",
      label: "childhood friends",
      strength: 0.8,
      bidirectional: true,
      evolution: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    expect(relation.id).toBe("rel_1");
    expect(relation.strength).toBeGreaterThanOrEqual(0);
    expect(relation.strength).toBeLessThanOrEqual(1);
    expect(relation.bidirectional).toBe(true);
  });

  it("should construct a valid RelationEvent", () => {
    const event: RelationEvent = {
      episodeNumber: 3,
      change: "betrayal",
      newStrength: 0.2,
      newType: "enemy",
    };
    expect(event.episodeNumber).toBe(3);
    expect(event.newType).toBe("enemy");
  });

  it("should construct a valid relation with evolution history", () => {
    const relation: CharacterRelation = {
      id: "rel_2",
      fromId: "char_a",
      toId: "char_c",
      type: "rival",
      label: "",
      strength: 0.6,
      bidirectional: false,
      evolution: [
        { episodeNumber: 1, change: "first meeting", newStrength: 0.3 },
        { episodeNumber: 5, change: "competition", newStrength: 0.7, newType: "rival" },
      ],
      createdAt: 1000,
      updatedAt: 2000,
    };
    expect(relation.evolution).toHaveLength(2);
    expect(relation.evolution[1].newType).toBe("rival");
  });

  it("should construct valid PersonalityTrait", () => {
    const trait: PersonalityTrait = {
      dimension: "introversion-extroversion",
      value: 0.7,
      label: "extroverted",
    };
    expect(trait.value).toBeGreaterThanOrEqual(-1);
    expect(trait.value).toBeLessThanOrEqual(1);
  });

  it("should construct valid EmotionalState", () => {
    const state: EmotionalState = {
      primary: "joy",
      intensity: 0.9,
      trigger: "reunion with friend",
    };
    expect(state.intensity).toBeLessThanOrEqual(1);
  });

  it("should construct valid CharacterArc", () => {
    const arc: CharacterArc = {
      seriesId: "series_1",
      startState: "naive",
      endState: "wise",
      currentState: "learning",
      turningPoints: [
        { episodeNumber: 3, event: "mentor appears", stateAfter: "curious" },
      ],
    };
    expect(arc.turningPoints).toHaveLength(1);
  });

  it("should construct valid CharacterPersonality", () => {
    const personality: CharacterPersonality = {
      traits: [
        { dimension: "courage", value: 0.8, label: "brave" },
      ],
      speechStyle: "formal and polite",
      emotionalState: { primary: "calm", intensity: 0.3 },
      arc: {
        seriesId: "s1",
        startState: "timid",
        turningPoints: [],
      },
    };
    expect(personality.traits).toHaveLength(1);
    expect(personality.speechStyle).toBe("formal and polite");
  });

  it("should validate relation strength boundaries", () => {
    const relation: CharacterRelation = {
      id: "rel_boundary",
      fromId: "a",
      toId: "b",
      type: "ally",
      label: "",
      strength: 0,
      bidirectional: true,
      evolution: [],
      createdAt: 0,
      updatedAt: 0,
    };
    expect(relation.strength).toBe(0);

    const maxRelation: CharacterRelation = { ...relation, strength: 1 };
    expect(maxRelation.strength).toBe(1);
  });
});
