import { describe, it, expect } from "vitest";
import {
  validateScript,
  canonicalizeCharacterDescription,
  applyCanonicalCharacterDesc,
} from "@/lib/scriptValidator";
import type { ComicScript } from "@/lib/types";

function makeScript(overrides: Partial<ComicScript> = {}): ComicScript {
  return {
    title: "Test",
    topic: "Test topic",
    style: "anime",
    panels: [
      { id: 1, scene: "Scene 1", dialogue: "Hello", imagePrompt: "a cat sitting", status: "completed" },
      { id: 2, scene: "Scene 2", dialogue: "World", imagePrompt: "a dog running", status: "completed" },
    ],
    ...overrides,
  };
}

describe("validateScript", () => {
  it("passes for a clean script", () => {
    const result = validateScript(makeScript());
    expect(result.passed).toBe(true);
    expect(result.warnings.length).toBe(0);
  });

  it("detects CJK in imagePrompt", () => {
    const result = validateScript(makeScript({
      panels: [
        { id: 1, scene: "S", dialogue: "D", imagePrompt: "a cat 猫咪 sitting", status: "completed" },
        { id: 2, scene: "S", dialogue: "D", imagePrompt: "a dog running", status: "completed" },
      ],
    }));
    expect(result.languagePurity).toBe(false);
    const langWarning = result.warnings.find(w => w.dimension === "language");
    expect(langWarning).toBeDefined();
    expect(langWarning!.panelIndices).toContain(0);
  });

  it("detects consecutive same composition", () => {
    const result = validateScript(makeScript({
      panels: [
        { id: 1, scene: "S", dialogue: "D", imagePrompt: "close-up of a cat", status: "completed" },
        { id: 2, scene: "S", dialogue: "D", imagePrompt: "close-up of a dog", status: "completed" },
        { id: 3, scene: "S", dialogue: "D", imagePrompt: "wide shot of city", status: "completed" },
      ],
    }));
    const compWarning = result.warnings.find(w => w.dimension === "composition" && w.message.includes("连续"));
    expect(compWarning).toBeDefined();
  });

  it("detects style conflict", () => {
    const result = validateScript(makeScript({
      style: "watercolor",
      panels: [
        { id: 1, scene: "S", dialogue: "D", imagePrompt: "neon cyberpunk cityscape", status: "completed" },
        { id: 2, scene: "S", dialogue: "D", imagePrompt: "soft flowers", status: "completed" },
      ],
    }));
    expect(result.styleAlignment).toBe(false);
    const styleWarning = result.warnings.find(w => w.dimension === "style");
    expect(styleWarning).toBeDefined();
    expect(styleWarning!.panelIndices).toContain(0);
  });

  it("detects narrative repetition", () => {
    const repeatedText = "光合作用是植物利用阳光将二氧化碳和水转化为有机物的过程，这个过程对地球生命至关重要";
    const result = validateScript(makeScript({
      panels: [
        { id: 1, scene: "S", dialogue: "开场介绍", imagePrompt: "a", status: "completed" },
        { id: 2, scene: "S", dialogue: repeatedText, imagePrompt: "b", status: "completed" },
        { id: 3, scene: "S", dialogue: repeatedText, imagePrompt: "c", status: "completed" },
      ],
    }));
    const narWarning = result.warnings.find(w => w.dimension === "narrative");
    expect(narWarning).toBeDefined();
  });

  it("detects character inconsistency", () => {
    const result = validateScript(makeScript({
      characterDescription: "A young girl",
      panels: [
        { id: 1, scene: "S", dialogue: "D", imagePrompt: "[Alice: short black hair, blue dress]", status: "completed" },
        { id: 2, scene: "S", dialogue: "D", imagePrompt: "[Alice: long red hair, green dress]", status: "completed" },
      ],
    }));
    expect(result.characterConsistency).toBe(false);
    const charWarning = result.warnings.find(w => w.dimension === "character");
    expect(charWarning).toBeDefined();
  });
});

describe("canonicalizeCharacterDescription", () => {
  it("returns undefined when no characterDescription", () => {
    expect(canonicalizeCharacterDescription(makeScript())).toBeUndefined();
  });

  it("picks the longest description variant", () => {
    const script = makeScript({
      characterDescription: "A girl",
      panels: [
        { id: 1, scene: "S", dialogue: "D", imagePrompt: "[Alice: short hair]", status: "completed" },
        { id: 2, scene: "S", dialogue: "D", imagePrompt: "[Alice: short black hair, blue eyes, wearing school uniform]", status: "completed" },
      ],
    });
    const canonical = canonicalizeCharacterDescription(script);
    expect(canonical).toContain("school uniform");
  });
});

describe("applyCanonicalCharacterDesc", () => {
  it("replaces shorter tags with canonical", () => {
    const script = makeScript({
      characterDescription: "A girl",
      panels: [
        { id: 1, scene: "S", dialogue: "D", imagePrompt: "[Alice: short hair]", status: "completed" },
        { id: 2, scene: "S", dialogue: "D", imagePrompt: "[Alice: short black hair, blue eyes]", status: "completed" },
      ],
    });
    applyCanonicalCharacterDesc(script);
    // Both panels should now have the longer version
    expect(script.panels[0].imagePrompt).toContain("blue eyes");
    expect(script.panels[1].imagePrompt).toContain("blue eyes");
  });

  it("does nothing when no character tags exist", () => {
    const script = makeScript({ characterDescription: "A girl" });
    const originalPrompts = script.panels.map(p => p.imagePrompt);
    applyCanonicalCharacterDesc(script);
    expect(script.panels.map(p => p.imagePrompt)).toEqual(originalPrompts);
  });
});
