import { describe, expect, it } from "vitest";
import { buildCreationPreflight } from "@/lib/creation/preflight";
import { createEmptyUserConfig } from "@/lib/config/userConfig";
import { buildGenerationSnapshot } from "@/lib/config/generationPresets";
const model = { id: "text", name: "Script", provider: "custom" as const, apiUrl: "http://localhost:8317", apiKey: "do-not-display", model: "text-model", protocolType: "openai-compatible" as const };
const config = () => ({ ...createEmptyUserConfig(), llmConfigs: [model], activeLLMId: "text" });
const input = () => ({ config: config(), syncStatus: "saved" as const, panelCount: null, customPanelCount: "", maxPanelCount: 30, preset: buildGenerationSnapshot("balanced-auto") });
describe("creation preflight", () => {
  it("allows script-first without an image model and returns credential-free role summaries", () => {
    const result = buildCreationPreflight(input());
    expect(result.canSubmit).toBe(true); expect(result.submitLabel).toBe("生成分镜，先审核");
    expect(result.roles.llm).toMatchObject({ id: "text", name: "Script", model: "text-model" });
    expect(JSON.stringify(result)).not.toContain("do-not-display");
    expect(result.warnings.join()).toContain("图片");
  });
  it.each(["loading", "saving", "error", "conflict"] as const)("blocks %s even with locally complete model fields", syncStatus => {
    expect(buildCreationPreflight({ ...input(), syncStatus }).canSubmit).toBe(false);
  });
  it("uses the explicit valid model even without a default, but never falls back from a deleted selection", () => {
    const data = input(); data.config.activeLLMId = null as unknown as string;
    expect(buildCreationPreflight({ ...data, selectedLLMId: "text" }).canSubmit).toBe(true);
    expect(buildCreationPreflight({ ...input(), selectedLLMId: "deleted" }).canSubmit).toBe(false);
  });
  it("requires an image model only for automatic image continuation", () => {
    expect(buildCreationPreflight({ ...input(), preset: buildGenerationSnapshot("one-click-full") }).errors.join()).toContain("文生图");
  });
  it.each(["0", "-1", "1.5", "31", "4abc", "1e1"])("rejects invalid panel count %s rather than coercing it", customPanelCount => {
    expect(buildCreationPreflight({ ...input(), customPanelCount }).canSubmit).toBe(false);
  });
  it("rejects invalid concurrency and a non-ComfyUI calibration flow", () => {
    expect(buildCreationPreflight({ ...input(), preset: buildGenerationSnapshot("balanced-auto", { imageConcurrency: 0 }) }).canSubmit).toBe(false);
    expect(buildCreationPreflight({ ...input(), preset: buildGenerationSnapshot("local-comfy-calibrated") }).errors.join()).toContain("ComfyUI");
  });
});
