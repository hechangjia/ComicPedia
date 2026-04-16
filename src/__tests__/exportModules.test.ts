import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ComicPanel } from "@/lib/types";

// Mock browser APIs
const mockLocalStorage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => mockLocalStorage.get(key) ?? null,
  setItem: (key: string, value: string) => mockLocalStorage.set(key, value),
  removeItem: (key: string) => mockLocalStorage.delete(key),
});

function makePanel(overrides: Partial<ComicPanel> = {}): ComicPanel {
  return {
    id: 1,
    scene: "Test scene",
    dialogue: "Test dialogue",
    imagePrompt: "a test prompt",
    status: "completed",
    imageUrl: "file://test-img-1",
    ...overrides,
  } as ComicPanel;
}

describe("export/shared", () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it("getValidPanels filters out pending and placeholder panels", async () => {
    const { getValidPanels } = await import("@/lib/export/shared");
    const panels: ComicPanel[] = [
      makePanel({ id: 1, status: "completed", imageUrl: "file://img1" }),
      makePanel({ id: 2, status: "pending", imageUrl: undefined }),
      makePanel({ id: 3, status: "completed", imageUrl: "data:text/plain;base64,abc" }),
      makePanel({ id: 4, status: "completed", imageUrl: "file://img4" }),
      makePanel({ id: 5, status: "failed" }),
    ];
    const valid = getValidPanels(panels);
    expect(valid).toHaveLength(2);
    expect(valid.map((p) => p.id)).toEqual([1, 4]);
  });

  it("dateSuffix returns YYYY-MM-DD format", async () => {
    const { dateSuffix } = await import("@/lib/export/shared");
    const result = dateSuffix();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("getWatermarkText returns empty string when not set", async () => {
    const { getWatermarkText } = await import("@/lib/export/shared");
    expect(getWatermarkText()).toBe("");
  });

  it("setWatermarkText persists and retrieves text", async () => {
    const { setWatermarkText, getWatermarkText } = await import("@/lib/export/shared");
    setWatermarkText("Created by Alice");
    expect(getWatermarkText()).toBe("Created by Alice");
  });

  it("setWatermarkText removes entry when empty", async () => {
    const { setWatermarkText, getWatermarkText } = await import("@/lib/export/shared");
    setWatermarkText("test");
    setWatermarkText("");
    expect(getWatermarkText()).toBe("");
  });

  it("downloadTextFile is exported", async () => {
    const { downloadTextFile } = await import("@/lib/export/shared");
    expect(typeof downloadTextFile).toBe("function");
  });
});

describe("export/markdown", () => {
  it("generateMarkdownContent produces structured markdown", async () => {
    const { generateMarkdownContent } = await import("@/lib/export/markdown");
    const panels = [
      makePanel({ id: 1, scene: "城堡远景", dialogue: "从前有座城堡", imagePrompt: "castle wide shot" }),
      makePanel({ id: 2, scene: "骑士登场", dialogue: "勇者到来", imagePrompt: "knight entrance" }),
    ];
    const md = generateMarkdownContent(panels, "测试漫画");

    expect(md).toContain("# 测试漫画");
    expect(md).toContain("## 第 1 格");
    expect(md).toContain("## 第 2 格");
    expect(md).toContain("城堡远景");
    expect(md).toContain("从前有座城堡");
    expect(md).toContain("castle wide shot");
    expect(md).toContain("panel_01.png");
    expect(md).toContain("panel_02.png");
  });

  it("generateMarkdownContent handles empty panels", async () => {
    const { generateMarkdownContent } = await import("@/lib/export/markdown");
    const md = generateMarkdownContent([], "空漫画");
    expect(md).toContain("# 空漫画");
    expect(md).toContain("面板数量：0");
    expect(md).not.toContain("## 第");
  });
});

describe("export/seedance", () => {
  it("buildSeedanceData produces structured segments", async () => {
    const { buildSeedanceData } = await import("@/lib/export/seedance");
    const script = {
      title: "测试",
      topic: "测试主题",
      style: "flat" as const,
      panels: [
        makePanel({ id: 1, scene: "开场", dialogue: "旁白一", imagePrompt: "prompt1" }),
        makePanel({ id: 2, scene: "高潮", dialogue: "旁白二", imagePrompt: "prompt2" }),
      ],
    };
    const result = buildSeedanceData(script as import("@/lib/types").ComicScript);
    expect(result.title).toBe("测试");
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].narration).toBe("旁白一");
    expect(result.segments[0].scene).toBe("开场");
    expect(result.segmentCount).toBe(2);
    expect(result.totalDuration).toBeGreaterThan(0);
  });
});
