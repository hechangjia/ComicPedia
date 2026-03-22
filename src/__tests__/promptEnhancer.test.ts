import { describe, it, expect } from "vitest";
import { buildEnhancedPrompt, buildEnhancedPromptWithLog } from "@/lib/client/promptEnhancer";

describe("buildEnhancedPrompt", () => {
  it("returns enhanced prompt as string", () => {
    const result = buildEnhancedPrompt("a cat sitting on a chair", 0, undefined, "anime", 6);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("injects character description when no tags present", () => {
    const result = buildEnhancedPrompt(
      "a person walking",
      0,
      "young woman with black hair and blue eyes",
      "anime",
      6,
    );
    expect(result).toContain("young woman with black hair");
  });

  it("does NOT inject character when per-panel tags exist", () => {
    const result = buildEnhancedPrompt(
      "[Alice: blonde hair, green eyes] walking in park",
      0,
      "young woman with black hair",
      "anime",
      6,
    );
    expect(result).not.toContain("young woman with black hair");
  });

  it("removes style-conflicting terms", () => {
    const result = buildEnhancedPrompt(
      "a digital art painting with hard edges and sharp details",
      0,
      undefined,
      "watercolor",
      4,
    );
    // "digital art" and "hard edges" are in watercolor's negative prompt
    expect(result.toLowerCase()).not.toContain("digital art");
    expect(result.toLowerCase()).not.toContain("hard edges");
  });

  it("adds composition when missing", () => {
    const result = buildEnhancedPrompt("a cat", 0, undefined, "anime", 6);
    // Should add establishing/wide shot for first panel
    expect(result.toLowerCase()).toContain("establishing");
  });

  it("preserves existing composition", () => {
    const result = buildEnhancedPrompt("close-up of a cat's face", 0, undefined, "anime", 6);
    // Should NOT add another composition
    expect(result.match(/close-up/gi)?.length).toBe(1);
  });

  it("adds style-specific lighting when missing", () => {
    const result = buildEnhancedPrompt("a cat", 0, undefined, "watercolor", 4);
    expect(result.toLowerCase()).toContain("soft diffused");
  });

  it("removes CJK characters", () => {
    const result = buildEnhancedPrompt("a cat 猫咪 sitting 坐着", 0, undefined, "anime", 4);
    expect(result).not.toMatch(/[\u4E00-\u9FFF]/);
  });
});

describe("buildEnhancedPromptWithLog", () => {
  it("returns log with original and enhanced", () => {
    const log = buildEnhancedPromptWithLog("a cat 猫", 0, undefined, "anime", 4);
    expect(log.original).toBe("a cat 猫");
    expect(log.enhanced).not.toContain("猫");
    expect(log.layers.length).toBeGreaterThan(0);
  });

  it("logs each enhancement layer", () => {
    const log = buildEnhancedPromptWithLog(
      "digital art 霓虹灯",
      0,
      "a girl with long hair",
      "watercolor",
      6,
    );
    const layerNames = log.layers.map(l => l.name);
    expect(layerNames).toContain("角色锚定");
    expect(layerNames).toContain("风格净化");
    expect(layerNames).toContain("CJK 清理");
  });

  it("does not log layers that made no changes", () => {
    const log = buildEnhancedPromptWithLog("close-up of a watercolor painting, soft diffused natural light", 0, undefined, "watercolor", 4);
    const layerNames = log.layers.map(l => l.name);
    // Should NOT have composition or lighting layers since they already exist
    expect(layerNames).not.toContain("构图补充");
    expect(layerNames).not.toContain("光影补充");
  });
});
