import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ComicScript } from "@/lib/types";

vi.mock("@/lib/llm", () => ({
  callLLM: vi.fn(),
}));

import { generateQuiz, getDifficultyPromptGuidance } from "@/lib/quizGenerator";
import { callLLM } from "@/lib/llm";

const mockCallLLM = vi.mocked(callLLM);

const makeScript = (): ComicScript => ({
  title: "光合作用",
  topic: "植物如何制造食物",
  style: "flat",
  panels: [
    { id: 1, scene: "阳光照射植物", dialogue: "植物通过光合作用吸收阳光", imagePrompt: "sun on plant", imageUrl: "", status: "completed" },
    { id: 2, scene: "叶片结构", dialogue: "叶绿体是光合作用的场所", imagePrompt: "chloroplast", imageUrl: "", status: "completed" },
  ] as ComicScript["panels"],
});

const validQuizResponse = JSON.stringify([
  { question: "光合作用在哪里进行？", options: ["叶绿体", "线粒体", "细胞核", "液泡"], correctIndex: 0, explanation: "叶绿体是光合作用的场所" },
  { question: "光合作用需要什么？", options: ["阳光", "黑暗", "冰", "沙子"], correctIndex: 0, explanation: "需要阳光" },
  { question: "植物如何获取能量？", options: ["光合作用", "呼吸", "吃东西", "睡觉"], correctIndex: 0, explanation: "通过光合作用" },
]);

describe("generateQuiz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns parsed quiz questions", async () => {
    mockCallLLM.mockResolvedValue(validQuizResponse);
    const questions = await generateQuiz(makeScript(), "medium");
    expect(questions).toHaveLength(3);
    expect(questions[0].question).toBe("光合作用在哪里进行？");
    expect(questions[0].options).toHaveLength(4);
    expect(questions[0].correctIndex).toBe(0);
  });

  it("throws when LLM returns unparseable response", async () => {
    mockCallLLM.mockResolvedValue("I cannot generate quiz questions");
    await expect(generateQuiz(makeScript())).rejects.toThrow("无法解析测验题目");
  });

  it("throws when LLM returns invalid quiz structure", async () => {
    mockCallLLM.mockResolvedValue(JSON.stringify([{ bad: "data" }]));
    await expect(generateQuiz(makeScript())).rejects.toThrow("无法解析测验题目");
  });

  it("caps at 3 questions", async () => {
    const fiveQuestions = Array.from({ length: 5 }, (_, i) => ({
      question: `Q${i}`,
      options: ["A", "B", "C", "D"],
      correctIndex: 0,
      explanation: "E",
    }));
    mockCallLLM.mockResolvedValue(JSON.stringify(fiveQuestions));
    const questions = await generateQuiz(makeScript());
    expect(questions).toHaveLength(3);
  });

  it("passes llmOverrides to callLLM", async () => {
    mockCallLLM.mockResolvedValue(validQuizResponse);
    const overrides = { model: "gpt-4" };
    await generateQuiz(makeScript(), "easy", overrides);
    expect(mockCallLLM).toHaveBeenCalledWith(expect.any(String), overrides);
  });
});

describe("getDifficultyPromptGuidance", () => {
  it("returns empty string for medium or undefined", () => {
    expect(getDifficultyPromptGuidance("medium")).toBe("");
    expect(getDifficultyPromptGuidance(undefined)).toBe("");
  });

  it("returns easy guidance for easy", () => {
    const result = getDifficultyPromptGuidance("easy");
    expect(result).toContain("入门级");
    expect(result).toContain("6-9");
  });

  it("returns hard guidance for hard", () => {
    const result = getDifficultyPromptGuidance("hard");
    expect(result).toContain("进阶级");
    expect(result).toContain("14岁");
  });
});
