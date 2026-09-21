import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComicScript, UserAPIConfigV2, Character } from "@/lib/types";
import type { VisualScoreSectionProps } from "@/components/result/score/VisualScoreSection";
import { createEmptyUserConfig } from "@/lib/config/userConfig";

const state = vi.hoisted(() => ({
  configs: null as unknown as UserAPIConfigV2,
  visual: null as unknown as VisualScoreSectionProps,
  text: null as unknown as { onEvaluate: () => Promise<void> },
  quality: vi.fn(), vision: vi.fn(), character: vi.fn(), generate: vi.fn(),
}));
vi.mock("@/hooks/useAPIConfig", () => ({ getStoredConfigs: () => state.configs, getStoredRequestConfigs: () => ({ imageConfig: { configId: "image", configRole: "image" } }) }));
vi.mock("@/components/result/score/VisualScoreSection", () => ({ VisualScoreSection: (props: VisualScoreSectionProps) => { state.visual = props; return null; } }));
vi.mock("@/components/result/score/TextScoreSection", () => ({ TextScoreSection: (props: typeof state.text) => { state.text = props; return null; } }));
vi.mock("@/lib/qualityScore", () => ({ evaluateQuality: state.quality }));
vi.mock("@/lib/vlmScorer", () => ({ evaluateVisualQuality: state.vision, evaluateCharacterVisual: state.character }));
vi.mock("@/lib/imageGen", () => ({ getImageAdapter: () => ({ generate: state.generate }) }));
import { QualityScorePanel } from "@/components/result/QualityScorePanel";
import { useCharacterForm } from "@/hooks/useCharacterForm";

const script: ComicScript = { title: "QA", topic: "QA", style: "anime", panels: [] };
beforeEach(() => {
  vi.clearAllMocks();
  const model = { id: "same-id", name: "QA", provider: "custom" as const, apiUrl: "https://models.example/v1", apiKey: "draft-secret-must-not-forward", model: "same-model", protocolType: "openai-compatible" as const };
  state.configs = { ...createEmptyUserConfig(), llmConfigs: [model], vlmConfigs: [{ ...model, protocolType: "anthropic" }], activeLLMId: model.id, activeVLMId: model.id };
  state.generate.mockResolvedValue("data:image/png;base64,QA");
  state.quality.mockResolvedValue({ overall: 8 });
  state.vision.mockResolvedValue({ overall: 8 });
  state.character.mockResolvedValue({ overall: 8, evaluatedAt: "2026-09-21T00:00:00Z" });
});
function expectReference(value: unknown, role: "llm" | "vlm") {
  expect(value).toMatchObject({ configId: "same-id", configRole: role });
  expect(value).not.toHaveProperty("apiKey");
  expect(JSON.stringify(value)).not.toContain("draft-secret");
}
describe("review entry points preserve saved model identity", () => {
  it("text scoring carries the LLM reference rather than a draft credential", async () => {
    renderToStaticMarkup(<QualityScorePanel script={script} />);
    await state.text.onEvaluate();
    expectReference(state.quality.mock.calls[0][1], "llm");
  });
  it("durable deep review preserves the VLM role even with a colliding LLM ID", async () => {
    const start = vi.fn();
    renderToStaticMarkup(<QualityScorePanel script={script} onStartDeepReview={start} />);
    await state.visual.onEvaluate();
    expectReference(start.mock.calls[0][0], "vlm");
    await state.visual.onRunDiagnosis!();
    expectReference(start.mock.calls[1][0], "vlm");
  });
  it("forwards explicitly selected diagnosis targets to durable review", async () => {
    const start = vi.fn();
    renderToStaticMarkup(<QualityScorePanel script={script} onStartDeepReview={start} />);
    await state.visual.onRunDiagnosis!([1, 3]);
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ configRole: "vlm" }), [1, 3]);
  });
  it("does not widen an explicitly empty diagnosis request", async () => {
    const start = vi.fn();
    renderToStaticMarkup(<QualityScorePanel script={script} onStartDeepReview={start} />);
    await state.visual.onRunDiagnosis!([]);
    expect(start).not.toHaveBeenCalled();
  });
  it("browser visual scoring carries a VLM reference", async () => {
    renderToStaticMarkup(<QualityScorePanel script={script} />);
    await state.visual.onEvaluate();
    expectReference(state.vision.mock.calls[0][1], "vlm");
  });
  it("visual scoring preserves the LLM role when no VLM is configured", async () => {
    state.configs.vlmConfigs = [];
    renderToStaticMarkup(<QualityScorePanel script={script} />);
    await state.visual.onEvaluate();
    expectReference(state.vision.mock.calls[0][1], "llm");
  });
  it("character scoring uses a saved VLM reference", async () => {
    const capture = vi.fn<(hook: ReturnType<typeof useCharacterForm>) => void>();
    function Harness() {
      capture(useCharacterForm({ character: { id: "character", name: "QA", referenceEntries: [{ imageUrl: "data:image/png;base64,QA", label: "QA", source: "upload", createdAt: 1, versions: [], activeVersionIndex: 0 }] }, onSave: vi.fn().mockImplementation(async (value) => ({ ...value, id: "character" })) }));
      return null;
    }
    renderToStaticMarkup(<Harness />);
    await capture.mock.calls[0][0].handleVlmEvaluate();
    expectReference(state.character.mock.calls[0][3], "vlm");
  });
  it("character repair re-evaluation retains the saved VLM identity", async () => {
    const capture = vi.fn<(hook: ReturnType<typeof useCharacterForm>) => void>();
    const character: Partial<Character> = {
      id: "character", name: "QA",
      visualScore: { overall: 4, featureClarity: 4, consistency: 4, imageQuality: 4, issues: ["blurry"], suggestions: [], evaluatedAt: "2026-09-21T00:00:00Z" },
    };
    const save = vi.fn().mockImplementation(async (value) => ({ ...value, id: "character" }));
    function Harness() { capture(useCharacterForm({ character, onSave: save })); return null; }
    renderToStaticMarkup(<Harness />);
    await capture.mock.calls[0][0].handleVlmRetry();
    expect(state.generate).toHaveBeenCalledOnce();
    expectReference(state.character.mock.calls[0][3], "vlm");
    expect(save).toHaveBeenCalledTimes(2);
  });

});
