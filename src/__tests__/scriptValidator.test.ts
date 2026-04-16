import { describe, it, expect } from "vitest";
import {
  validateScript,
  canonicalizeCharacterDescription,
  applyCanonicalCharacterDesc,
} from "@/lib/scriptValidator";
import type { ComicScript, NarrativeOutline } from "@/lib/types";

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

function makeBeatPlan(overrides: Partial<NarrativeOutline> = {}): NarrativeOutline {
  return {
    totalPanels: 5,
    templateType: "mechanism",
    source: "beat-plan",
    narrativeArc: "Hook first, then reveal the mechanism",
    infoDistribution: "progressive",
    characterList: [],
    panels: [
      {
        narrativeFunction: "opening",
        beatRole: "hook",
        suggestedComposition: "close-up",
        shotIntent: "hook-closeup",
        characters: [],
        keyInfo: "先展示异常现象",
        knowledgeGoal: "让读者先感到惊讶",
        infoDensity: "low",
        intensity: "high",
        carryForward: "为什么会这样",
      },
      {
        narrativeFunction: "development",
        beatRole: "progression",
        suggestedComposition: "medium shot",
        shotIntent: "contrast",
        characters: [],
        keyInfo: "对比旧直觉和真实机制",
        knowledgeGoal: "看见旧直觉的不足",
        infoDensity: "medium",
        intensity: "medium",
        carryForward: "真正机制是什么",
      },
      {
        narrativeFunction: "climax",
        beatRole: "reveal",
        suggestedComposition: "dynamic",
        shotIntent: "reveal",
        characters: [],
        keyInfo: "揭示核心原理",
        knowledgeGoal: "理解关键因果",
        infoDensity: "high",
        intensity: "high",
        carryForward: "会有什么结果",
      },
      {
        narrativeFunction: "resolution",
        beatRole: "progression",
        suggestedComposition: "wide shot",
        shotIntent: "process",
        characters: [],
        keyInfo: "推进结果",
        knowledgeGoal: "把原理与结果连接起来",
        infoDensity: "medium",
        intensity: "medium",
        carryForward: "最后记住什么",
      },
      {
        narrativeFunction: "epilogue",
        beatRole: "closure",
        suggestedComposition: "wide shot",
        shotIntent: "aftermath",
        characters: [],
        keyInfo: "用余波收束",
        knowledgeGoal: "记住最后的结论",
        infoDensity: "low",
        intensity: "medium",
        carryForward: "none",
      },
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

  it("warns when too many panels collapse into the same battle-scene family", () => {
    const result = validateScript(makeScript({
      panels: [
        { id: 1, scene: "两军在战场上列阵对峙", dialogue: "涿鹿大战即将开始。", imagePrompt: "wide shot battlefield armies facing off", status: "completed" },
        { id: 2, scene: "黄帝军与蚩尤军在战场上正面厮杀", dialogue: "双方在战场中央激烈交战。", imagePrompt: "dynamic angle battlefield warriors charging", status: "completed" },
        { id: 3, scene: "战场烟尘四起，士兵继续冲锋", dialogue: "战场局势陷入胶着。", imagePrompt: "close-up battlefield dust and soldiers clashing", status: "completed" },
        { id: 4, scene: "战场上风云突变，黄帝观察局势", dialogue: "黄帝需要新的策略。", imagePrompt: "medium shot battlefield commander reviewing chaos", status: "completed" },
      ],
    }));

    expect(result.warnings.some((w) => w.dimension === "narrative" && w.message.includes("场景语义重复"))).toBe(true);
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

  it("warns when science scripts open with flat explanation panels", () => {
    const result = validateScript(makeScript({
      style: "flat",
      panels: [
        { id: 1, scene: "讲解", dialogue: "雷电是一种自然现象，会在云层之间放电", imagePrompt: "teacher explaining at blackboard, medium shot", status: "completed" },
        { id: 2, scene: "继续讲解", dialogue: "它通常发生在积雨云内部和云层之间", imagePrompt: "teacher explaining at podium, medium shot", status: "completed" },
      ],
    }), {
      contentType: "science",
      narrativeOutline: makeBeatPlan(),
    });

    expect(result.warnings.some((w) => w.dimension === "narrative" && w.message.includes("开场缺少钩子"))).toBe(true);
  });

  it("warns when beat roles repeat without progression", () => {
    const repeatedPlan = makeBeatPlan({
      panels: [
        { ...makeBeatPlan().panels[0], beatRole: "progression", shotIntent: "process" },
        { ...makeBeatPlan().panels[1], beatRole: "progression", shotIntent: "process" },
      ],
    });

    const result = validateScript(makeScript({
      style: "flat",
      panels: [
        { id: 1, scene: "解释1", dialogue: "先解释定义", imagePrompt: "process diagram, medium shot", status: "completed" },
        { id: 2, scene: "解释2", dialogue: "再解释定义", imagePrompt: "process diagram, medium shot", status: "completed" },
      ],
    }), {
      contentType: "science",
      narrativeOutline: repeatedPlan,
    });

    expect(result.warnings.some((w) => w.dimension === "narrative" && w.message.includes("叙事职责重复"))).toBe(true);
  });

  it("warns when no strong hook-closeup or contrast shot exists", () => {
    const weakPlan = makeBeatPlan({
      panels: makeBeatPlan().panels.map((panel) => ({
        ...panel,
        shotIntent: "process",
      })),
    });

    const result = validateScript(makeScript({
      style: "flat",
      panels: [
        { id: 1, scene: "过程1", dialogue: "解释过程", imagePrompt: "process diagram, medium shot", status: "completed" },
        { id: 2, scene: "过程2", dialogue: "继续解释过程", imagePrompt: "process flow, wide shot", status: "completed" },
      ],
    }), {
      contentType: "wikipedia",
      narrativeOutline: weakPlan,
    });

    expect(result.warnings.some((w) => w.dimension === "composition" && w.message.includes("缺少强镜头变化"))).toBe(true);
  });

  it("warns when final panel is not reveal or aftermath when beat metadata exists", () => {
    const flatEndingPlan = makeBeatPlan({
      panels: [
        ...makeBeatPlan().panels.slice(0, 4),
        { ...makeBeatPlan().panels[4], shotIntent: "process", beatRole: "progression" },
      ],
    });

    const result = validateScript(makeScript({
      style: "flat",
      panels: [
        { id: 1, scene: "开场", dialogue: "先有钩子", imagePrompt: "hook-closeup lightning, close-up", status: "completed" },
        { id: 2, scene: "收尾", dialogue: "最后还在继续解释步骤", imagePrompt: "process diagram, medium shot", status: "completed" },
      ],
    }), {
      contentType: "science",
      narrativeOutline: flatEndingPlan,
    });

    expect(result.warnings.some((w) => w.dimension === "narrative" && w.message.includes("结尾缺少揭示或余波"))).toBe(true);
  });

  it("does not apply beat-plan ending rules to legacy runs without outline metadata", () => {
    const result = validateScript(makeScript({
      style: "flat",
      panels: [
        { id: 1, scene: "开场", dialogue: "普通说明", imagePrompt: "medium shot explainer", status: "completed" },
        { id: 2, scene: "结尾", dialogue: "普通说明", imagePrompt: "medium shot explainer", status: "completed" },
      ],
    }), {
      contentType: "science",
    });

    expect(result.warnings.some((w) => w.message.includes("结尾缺少揭示或余波"))).toBe(false);
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
