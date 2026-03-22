import { ComicScript, RelatedTopic, PartialLLMConfig } from "./types";
import { callLLM } from "./llm";

/** 从脚本内容中提取关联关键词 */
async function extractKeywords(
  script: ComicScript,
  llmOverrides?: PartialLLMConfig,
): Promise<string[]> {
  const panelContent = script.panels
    .map((p) => `${p.scene} ${p.dialogue}`)
    .join("\n");

  const prompt = `从以下漫画内容中提取 5-8 个可独立成为百科词条的关键词。
这些关键词应该是与主题"${script.topic}"相关但不同的概念，适合进一步学习探索。
不要返回与"${script.topic}"完全相同的词。

漫画内容：
${panelContent}

只返回 JSON 数组格式，例如：["关键词1", "关键词2", ...]
不要包含其他文字。`;

  const content = await callLLM(prompt, llmOverrides);

  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed) ? parsed.filter((k: unknown) => typeof k === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

/** 通过 Wikipedia API 验证并获取词条信息 */
async function verifyTopic(keyword: string, lang: string = "zh"): Promise<RelatedTopic | null> {
  try {
    const searchRes = await fetch(`/api/wikipedia?q=${encodeURIComponent(keyword)}&lang=${lang}`);
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const results = searchData.results;
    if (!results || results.length === 0) return null;

    const first = results[0];
    return {
      keyword,
      wikipediaTitle: first.title,
      description: first.description || "",
      thumbnail: first.thumbnail?.source,
      verified: true,
    };
  } catch {
    return null;
  }
}

/** 生成关联词条推荐 */
export async function generateRelatedTopics(
  script: ComicScript,
  llmOverrides?: PartialLLMConfig,
  lang: string = "zh",
): Promise<RelatedTopic[]> {
  const keywords = await extractKeywords(script, llmOverrides);
  if (keywords.length === 0) return [];

  // 并发验证（max 3 同时）
  const results: RelatedTopic[] = [];
  const batchSize = 3;
  for (let i = 0; i < keywords.length && results.length < 5; i += batchSize) {
    const batch = keywords.slice(i, i + batchSize);
    const verified = await Promise.all(batch.map((k) => verifyTopic(k, lang)));
    for (const topic of verified) {
      if (topic && results.length < 5) results.push(topic);
    }
  }

  return results;
}
