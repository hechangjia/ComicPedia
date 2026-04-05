import { describe, expect, it } from "vitest";
import { buildGenerationSnapshot, GENERATION_PRESETS } from "@/lib/config/generationPresets";

describe("generation presets", () => {
  it("maps Local ComfyUI Calibrated to pause-after-script + required calibration + single-flight queue", () => {
    const preset = GENERATION_PRESETS["local-comfy-calibrated"];
    expect(preset.pauseAfterScript).toBe(true);
    expect(preset.calibrationMode).toBe("required");
    expect(preset.imageConcurrency).toBe(1);
    expect(preset.lightCheckMode).toBe("auto");
  });

  it("builds a snapshot with advanced overrides without mutating the preset defaults", () => {
    const snapshot = buildGenerationSnapshot("balanced-auto", {
      imageConcurrency: 3,
      lightCheckMode: "off",
    });

    expect(snapshot).toMatchObject({
      presetId: "balanced-auto",
      imageConcurrency: 3,
      lightCheckMode: "off",
      deepReviewMode: "manual",
    });
    expect(GENERATION_PRESETS["balanced-auto"].imageConcurrency).toBe(2);
  });
});
