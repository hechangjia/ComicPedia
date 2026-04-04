import { describe, it, expect } from "vitest";
import { buildCharacterContext, inferAppearingCharacters } from "@/lib/characterContext";
import { Character, CharacterRelation } from "@/lib/types";

function makeCharacter(overrides: Partial<Character> & { id: string; name: string }): Character {
  return {
    appearance: { gender: "male", age: "30", hair: "black", eyes: "brown", clothing: "lab coat" },
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Character;
}

describe("buildCharacterContext", () => {
  it("returns empty text for empty characters array", () => {
    const result = buildCharacterContext([], []);
    expect(result.text).toBe("");
    expect(result.characterNames).toEqual([]);
  });

  it("builds context for a single character", () => {
    const chars = [makeCharacter({ id: "c1", name: "Alice" })];
    const result = buildCharacterContext(chars, []);
    expect(result.characterNames).toEqual(["Alice"]);
    expect(result.text).toContain("CHARACTERS IN THIS STORY");
    expect(result.text).toContain("**Alice**");
    expect(result.text).toContain("black hair");
  });

  it("builds context for multiple characters", () => {
    const chars = [
      makeCharacter({ id: "c1", name: "Alice" }),
      makeCharacter({ id: "c2", name: "Bob", appearance: { gender: "male", age: "25", hair: "blonde", eyes: "blue", clothing: "armor" } }),
    ];
    const result = buildCharacterContext(chars, []);
    expect(result.characterNames).toEqual(["Alice", "Bob"]);
    expect(result.text).toContain("**Alice**");
    expect(result.text).toContain("**Bob**");
  });

  it("includes personality and speech style when present", () => {
    const chars = [makeCharacter({
      id: "c1",
      name: "Alice",
      personality: {
        traits: [{ label: "brave" } as any, { label: "kind" } as any],
        speechStyle: "formal and precise",
        emotionalState: { current: "neutral", intensity: 0.5 } as any,
      },
    })];
    const result = buildCharacterContext(chars, []);
    expect(result.text).toContain("Personality: brave, kind");
    expect(result.text).toContain("Speech style: formal and precise");
  });

  it("includes relationships section", () => {
    const chars = [
      makeCharacter({ id: "c1", name: "Alice" }),
      makeCharacter({ id: "c2", name: "Bob" }),
    ];
    const relations: CharacterRelation[] = [{
      id: "r1",
      fromId: "c1",
      toId: "c2",
      type: "friend",
      label: "Best friends",
      strength: 0.8,
      bidirectional: true,
      evolution: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];
    const result = buildCharacterContext(chars, relations);
    expect(result.text).toContain("CHARACTER RELATIONSHIPS");
    expect(result.text).toContain("Alice ↔ Bob: Best friends (friend)");
  });

  it("uses arrow for non-bidirectional relations", () => {
    const chars = [
      makeCharacter({ id: "c1", name: "Alice" }),
      makeCharacter({ id: "c2", name: "Bob" }),
    ];
    const relations: CharacterRelation[] = [{
      id: "r1",
      fromId: "c1",
      toId: "c2",
      type: "mentor",
      label: "Teaches",
      strength: 0.7,
      bidirectional: false,
      evolution: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }];
    const result = buildCharacterContext(chars, relations);
    expect(result.text).toContain("Alice → Bob: Teaches (mentor)");
  });

  it("includes series context when provided", () => {
    const chars = [makeCharacter({ id: "c1", name: "Alice" })];
    const result = buildCharacterContext(chars, [], {
      episodeNumber: 3,
      seriesTitle: "Science Adventures",
      previousRecap: "Alice discovered the atom.",
    });
    expect(result.text).toContain("STORY CONTINUITY");
    expect(result.text).toContain("Science Adventures");
    expect(result.text).toContain("#3");
    expect(result.text).toContain("Alice discovered the atom.");
  });

  it("handles non-human characters", () => {
    const chars = [makeCharacter({
      id: "c1",
      name: "Pikachu",
      appearance: { species: "electric mouse", age: "young", hair: "yellow fur", eyes: "round black", clothing: "" },
    })];
    const result = buildCharacterContext(chars, []);
    expect(result.text).toContain("electric mouse");
    // Non-human: no "hair" suffix
    expect(result.text).toContain("yellow fur");
    expect(result.text).not.toContain("yellow fur hair");
  });
});

describe("inferAppearingCharacters", () => {
  it("returns empty array when no names match", () => {
    const result = inferAppearingCharacters("A lab scene", "Hello world", ["Alice", "Bob"]);
    expect(result).toEqual([]);
  });

  it("finds character name in scene", () => {
    const result = inferAppearingCharacters("Alice walks into the lab", "", ["Alice", "Bob"]);
    expect(result).toEqual(["Alice"]);
  });

  it("finds character name in dialogue", () => {
    const result = inferAppearingCharacters("", "Bob said hello", ["Alice", "Bob"]);
    expect(result).toEqual(["Bob"]);
  });

  it("is case-insensitive", () => {
    const result = inferAppearingCharacters("ALICE is here", "bob too", ["Alice", "Bob"]);
    expect(result).toEqual(["Alice", "Bob"]);
  });

  it("finds multiple characters", () => {
    const result = inferAppearingCharacters("Alice and Bob meet", "Charlie joins", ["Alice", "Bob", "Charlie"]);
    expect(result).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("returns empty for empty inputs", () => {
    const result = inferAppearingCharacters("", "", ["Alice"]);
    expect(result).toEqual([]);
  });
});
