import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ComicScript } from "@/lib/types";

vi.mock("@/lib/llm", () => ({
  callLLM: vi.fn(),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { generateRelatedTopics } from "@/lib/relatedTopics";
import { callLLM } from "@/lib/llm";

const mockCallLLM = vi.mocked(callLLM);

const makeScript = (): ComicScript => ({
  title: "光合作用",
  topic: "植物如何制造食物",
  style: "flat",
  panels: [
    { id: "p1", scene: "阳光照射", dialogue: "叶绿体吸收阳光", imagePrompt: "sun", imageUrl: "", status: "completed" },
  ] as ComicScript["panels"],
});

describe("generateRelatedTopics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns verified topics from Wikipedia", async () => {
    mockCallLLM.mockResolvedValue('["叶绿体", "光合色素", "碳循环"]');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ title: "叶绿体", description: "植物细胞器", thumbnail: { source: "http://thumb.png" } }],
      }),
    });

    const topics = await generateRelatedTopics(makeScript());
    expect(topics.length).toBeGreaterThan(0);
    expect(topics[0].keyword).toBe("叶绿体");
    expect(topics[0].verified).toBe(true);
    expect(topics[0].wikipediaTitle).toBe("叶绿体");
  });

  it("returns empty array when LLM returns no keywords", async () => {
    mockCallLLM.mockResolvedValue("sorry I cannot help");
    const topics = await generateRelatedTopics(makeScript());
    expect(topics).toEqual([]);
  });

  it("skips keywords not found on Wikipedia", async () => {
    mockCallLLM.mockResolvedValue('["存在的词", "不存在的词"]');
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ title: "存在的词", description: "desc" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] }),
      });

    const topics = await generateRelatedTopics(makeScript());
    expect(topics).toHaveLength(1);
    expect(topics[0].keyword).toBe("存在的词");
  });

  it("caps results at 5", async () => {
    mockCallLLM.mockResolvedValue('["a","b","c","d","e","f","g","h"]');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ title: "T", description: "D" }] }),
    });

    const topics = await generateRelatedTopics(makeScript());
    expect(topics.length).toBeLessThanOrEqual(5);
  });

  it("handles Wikipedia API errors gracefully", async () => {
    mockCallLLM.mockResolvedValue('["关键词"]');
    mockFetch.mockResolvedValue({ ok: false });

    const topics = await generateRelatedTopics(makeScript());
    expect(topics).toEqual([]);
  });
});
