import { describe, expect, it } from "vitest";
import type { ComicScript } from "@/lib/types";
import { stripDisallowedGuideCharacterFromScript } from "@/lib/guideCharacterPolicy";
import { buildScriptPrompt } from "@/prompts/scriptGenerator";
import { buildWikipediaPrompt } from "@/prompts/wikipediaGenerator";

describe("guide character policy", () => {
  it("adds an explicit prohibition against extra guide characters in science prompts when disabled", () => {
    const prompt = buildScriptPrompt("盘古开天辟地", "anime", 6, undefined, false);

    expect(prompt).toContain("禁止额外添加讲解员、探索者、旁白角色");
    expect(prompt).toContain("题材原生人物");
  });

  it("removes wikipedia guide-role encouragement and replaces it with a prohibition when disabled", () => {
    const prompt = buildWikipediaPrompt(
      {
        title: "Pangu",
        extract: "Pangu is a primordial being in Chinese mythology.",
        lang: "en",
      },
      "manga",
      6,
      false,
    );

    expect(prompt).toContain("禁止额外添加百科讲解员、知识探索者");
    expect(prompt).not.toContain("可以使用\"百科讲解员\"或\"知识探索者\"作为引导角色");
  });

  it("strips generic guide characters from a generated script when disallowed", () => {
    const script: ComicScript = {
      title: "盘古开天辟地",
      topic: "盘古开天辟地",
      style: "anime",
      characterDescription: "[Knowledge Explorer: young adventurer wearing explorer jacket, leather satchel, curious smile]",
      panels: [
        {
          id: 1,
          scene: "混沌初开",
          dialogue: "天地尚未分开。",
          imagePrompt: "[Knowledge Explorer: young adventurer wearing explorer jacket, leather satchel, curious smile] standing before a cosmic egg splitting apart, dramatic lighting",
          status: "pending",
        },
        {
          id: 2,
          scene: "盘古撑天",
          dialogue: "盘古把天地撑开。",
          imagePrompt: "[Knowledge Explorer: young adventurer wearing explorer jacket, leather satchel, curious smile] looking up at Pangu separating sky and earth, wide shot",
          status: "pending",
        },
      ],
    };

    const sanitized = stripDisallowedGuideCharacterFromScript(script);

    expect(sanitized.characterDescription).toBe("");
    expect(sanitized.panels[0].imagePrompt).not.toContain("Knowledge Explorer");
    expect(sanitized.panels[1].imagePrompt).not.toContain("explorer jacket");
    expect(sanitized.panels[0].imagePrompt).toContain("cosmic egg splitting apart");
    expect(sanitized.panels[1].imagePrompt).toContain("Pangu separating sky and earth");
  });

  it("preserves topic-native characters when sanitizing guide characters", () => {
    const script: ComicScript = {
      title: "盘古开天辟地",
      topic: "盘古开天辟地",
      style: "anime",
      characterDescription: "[Pangu: towering primordial giant, wild long hair, fur garments, holding an ancient axe]",
      panels: [
        {
          id: 1,
          scene: "盘古挥斧",
          dialogue: "盘古劈开混沌。",
          imagePrompt: "[Pangu: towering primordial giant, wild long hair, fur garments, holding an ancient axe] splitting the cosmic egg with one powerful strike",
          status: "pending",
        },
      ],
    };

    const sanitized = stripDisallowedGuideCharacterFromScript(script);

    expect(sanitized.characterDescription).toBe(script.characterDescription);
    expect(sanitized.panels[0].imagePrompt).toContain("[Pangu:");
    expect(sanitized.panels[0].imagePrompt).toContain("splitting the cosmic egg");
  });
});
