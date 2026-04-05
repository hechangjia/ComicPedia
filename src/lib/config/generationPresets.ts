import type { GenerationPresetSnapshot } from "@/lib/types";

type GenerationPresetDefinition = GenerationPresetSnapshot & {
  id: string;
  label: string;
};

export const GENERATION_PRESETS = {
  "local-comfy-calibrated": {
    id: "local-comfy-calibrated",
    label: "本地 ComfyUI 校准流",
    pauseAfterScript: true,
    calibrationMode: "required" as const,
    imageConcurrency: 1,
    lightCheckMode: "auto" as const,
    deepReviewMode: "manual" as const,
    leavePagePolicy: "finish_inflight_then_pause" as const,
  },
  "balanced-auto": {
    id: "balanced-auto",
    label: "平衡自动流",
    pauseAfterScript: true,
    calibrationMode: "disabled" as const,
    imageConcurrency: 2,
    lightCheckMode: "auto" as const,
    deepReviewMode: "manual" as const,
    leavePagePolicy: "finish_inflight_then_pause" as const,
  },
  "high-quality-review": {
    id: "high-quality-review",
    label: "高质量复审流",
    pauseAfterScript: true,
    calibrationMode: "disabled" as const,
    imageConcurrency: 1,
    lightCheckMode: "auto" as const,
    deepReviewMode: "manual" as const,
    leavePagePolicy: "finish_inflight_then_pause" as const,
  },
  "fast-draft": {
    id: "fast-draft",
    label: "极速草稿流",
    pauseAfterScript: true,
    calibrationMode: "disabled" as const,
    imageConcurrency: 2,
    lightCheckMode: "off" as const,
    deepReviewMode: "manual" as const,
    leavePagePolicy: "finish_inflight_then_pause" as const,
  },
} satisfies Record<string, GenerationPresetDefinition>;

export type GenerationPresetId = keyof typeof GENERATION_PRESETS;

export function buildGenerationSnapshot(
  presetId: GenerationPresetId,
  overrides: Partial<GenerationPresetSnapshot> = {},
): GenerationPresetSnapshot {
  const { id: _id, label: _label, ...preset } = GENERATION_PRESETS[presetId];
  const snapshot: GenerationPresetSnapshot = {
    ...preset,
    ...overrides,
    presetId,
  };

  snapshot.calibrationRequired = snapshot.calibrationMode === "required";
  snapshot.concurrencyPolicy = snapshot.imageConcurrency === 1 ? "single-flight" : "parallel";
  snapshot.imageQueue = {
    imageConcurrency: snapshot.imageConcurrency,
    leavePagePolicy: snapshot.leavePagePolicy,
  };
  snapshot.lightweightCheck = {
    mode: snapshot.lightCheckMode,
  };
  snapshot.deepReview = {
    mode: snapshot.deepReviewMode,
  };

  return snapshot;
}
