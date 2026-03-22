import { ComicScript, DifficultyLevel, QuizQuestion, PartialLLMConfig } from "./types";
import { callLLM } from "./llm";

/** 根据难度生成出题指导 */
function getDifficultyGuidance(difficulty: DifficultyLevel): string {
  switch (difficulty) {
    case "easy":
      return `目标受众：幼儿园到小学低年级（6-9岁）。
要求：使用简单生活化的词汇，避免专业术语，题目以判断和基础概念识别为主。
选项要清晰直白，干扰项不能太相似。解析要用比喻和生活例子。`;
    case "medium":
      return `目标受众：小学高年级到初中（10-14岁）。
要求：可使用基础科学概念，题目侧重因果推理和基本原理理解。
选项要有一定区分度，解析简洁明了。`;
    case "hard":
      return `目标受众：初中及以上（14岁+）。
要求：可使用专业术语，题目侧重综合分析、对比和跨学科思考。
选项需要仔细辨析，解析要有深度。`;
  }
}

/** 构建测验 prompt */
function buildQuizPrompt(script: ComicScript, difficulty: DifficultyLevel): string {
  const panelSummary = script.panels
    .map((p, i) => `第${i + 1}格：场景="${p.scene}" 对话="${p.dialogue}"`)
    .join("\n");

  return `你是一位教育测验出题专家。根据以下漫画内容出 3 道四选一选择题。

## 漫画信息
标题：${script.title}
主题：${script.topic}

## 漫画内容
${panelSummary}

## 出题难度要求
${getDifficultyGuidance(difficulty)}

## 出题规则
1. 题目必须基于漫画内容中的知识点
2. 每题恰好 4 个选项，只有 1 个正确答案
3. 解析要说明为什么正确答案对、其他选项为什么错
4. 题目、选项和解析都使用简体中文

## 输出格式
严格返回以下 JSON（不要包含其他文字）：

\`\`\`json
[
  {
    "question": "题目文本",
    "options": ["选项A", "选项B", "选项C", "选项D"],
    "correctIndex": 0,
    "explanation": "答案解析"
  }
]
\`\`\``;
}

/** 解析测验响应 */
function parseQuizResponse(response: string): QuizQuestion[] {
  // 提取 JSON 数组
  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((q: unknown): q is Record<string, unknown> => {
        if (!q || typeof q !== "object") return false;
        const obj = q as Record<string, unknown>;
        return (
          typeof obj.question === "string" &&
          Array.isArray(obj.options) &&
          (obj.options as unknown[]).length === 4 &&
          typeof obj.correctIndex === "number" &&
          obj.correctIndex >= 0 &&
          obj.correctIndex <= 3 &&
          typeof obj.explanation === "string"
        );
      })
      .slice(0, 3)
      .map((q) => ({
        question: q.question as string,
        options: (q.options as string[]).slice(0, 4) as [string, string, string, string],
        correctIndex: q.correctIndex as number,
        explanation: q.explanation as string,
      }));
  } catch {
    return [];
  }
}

/** 调用 LLM 生成测验题 */
export async function generateQuiz(
  script: ComicScript,
  difficulty: DifficultyLevel = "medium",
  llmOverrides?: PartialLLMConfig,
): Promise<QuizQuestion[]> {
  const prompt = buildQuizPrompt(script, difficulty);
  const content = await callLLM(prompt, llmOverrides);

  const questions = parseQuizResponse(content);
  if (questions.length === 0) {
    throw new Error("无法解析测验题目，请重试");
  }
  return questions;
}

/** 返回难度对 prompt 生成的指导段落（供各 prompt 生成器注入） */
export function getDifficultyPromptGuidance(difficulty?: DifficultyLevel): string {
  if (!difficulty || difficulty === "medium") return "";
  if (difficulty === "easy") {
    return `\n## 难度要求：入门级
- 使用简单、生活化的词汇，面向 6-9 岁儿童
- 避免专业术语，用比喻和类比解释概念
- 对话要活泼有趣，像讲故事一样\n`;
  }
  return `\n## 难度要求：进阶级
- 面向有基础知识的读者（14岁+）
- 可使用专业术语和精确表述
- 深入分析原理和因果关系，展示知识的深度\n`;
}
