import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ComicScript, ComicPanel } from "@/lib/types";

vi.mock("@/lib/llm", () => ({
  callLLM: vi.fn(),
}));

import { optimizeDialogue, optimizeImagePrompt, optimizeNarrative } from "@/lib/aiEditor";
import { callLLM } from "@/lib/llm";

const mockCallLLM = vi.mocked(callLLM);

const makeScript = (): ComicScript => ({
  title: "测试漫画",
  topic: "科学",
  style: "flat",
  characterDescription: "一个科学家",
  panels: [
    { id: "p1", scene: "实验室", dialogue: "你好", imagePrompt: "a scientist in lab", imageUrl: "", status: "completed" },
    { id: "p2", scene: "户外", dialogue: "再见", imagePrompt: "outdoor scene", imageUrl: "", status: "completed" },
  ] as ComicScript["panels"],
});

describe("optimizeDialogue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns AI suggestion for dialogue", async () => {
    mockCallLLM.mockResolvedValue(JSON.stringify({
      original: "你好",
      suggested: "嗨！让我们开始实验吧！",
      reason: "更有活力",
    }));

    const script = makeScript();
    const result = await optimizeDialogue(script.panels[0], script, 0);
    expect(result.original).toBe("你好");
    expect(result.suggested).toBe("嗨！让我们开始实验吧！");
    expect(result.reason).toBe("更有活力");
  });

  it("throws when LLM returns unparseable response", async () => {
    mockCallLLM.mockResolvedValue("I don't know");
    const script = makeScript();
    await expect(optimizeDialogue(script.panels[0], script, 0)).rejects.toThrow("无法解析 AI 建议");
  });
});

describe("optimizeImagePrompt", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns AI suggestion for image prompt", async () => {
    mockCallLLM.mockResolvedValue(JSON.stringify({
      original: "a scientist in lab",
      suggested: "a scientist in a bright modern lab, dramatic lighting, flat illustration style",
      reason: "增强构图和光影",
    }));

    const script = makeScript();
    const result = await optimizeImagePrompt(script.panels[0], script, 0);
    expect(result.suggested).toContain("bright modern lab");
  });

  it("throws on invalid response", async () => {
    mockCallLLM.mockResolvedValue("no json");
    const script = makeScript();
    await expect(optimizeImagePrompt(script.panels[0], script, 0)).rejects.toThrow("无法解析 AI 建议");
  });
});

describe("optimizeNarrative", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns narrative suggestions array", async () => {
    mockCallLLM.mockResolvedValue(JSON.stringify([
      { type: "modify", panelIndex: 0, field: "dialogue", original: "你好", suggested: "欢迎来到实验室！", reason: "更引人入胜" },
    ]));

    const result = await optimizeNarrative(makeScript());
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("modify");
    expect(result[0].panelIndex).toBe(0);
  });

  it("returns empty array on parse failure", async () => {
    mockCallLLM.mockResolvedValue("cannot help");
    const result = await optimizeNarrative(makeScript());
    expect(result).toEqual([]);
  });

  it("caps suggestions at 8", async () => {
    const suggestions = Array.from({ length: 12 }, (_, i) => ({
      type: "modify",
      panelIndex: 0,
      field: "dialogue",
      original: `o${i}`,
      suggested: `s${i}`,
      reason: `r${i}`,
    }));
    mockCallLLM.mockResolvedValue(JSON.stringify(suggestions));

    const result = await optimizeNarrative(makeScript());
    expect(result.length).toBeLessThanOrEqual(8);
  });
});
