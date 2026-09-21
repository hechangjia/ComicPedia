import type { UserAPIConfigV2 } from "@/lib/types";
import { createEmptyAccuracyConfig, normalizeAccuracyConfig } from "@/lib/accuracy/providerConfig";

export function createEmptyUserConfig(): UserAPIConfigV2 {
  return {
    version: 2, llmConfigs: [], imageConfigs: [], vlmConfigs: [],
    accuracyConfig: createEmptyAccuracyConfig(),
    activeLLMId: null, activeImageId: null, activeVLMId: null,
    updatedAt: new Date().toISOString(),
  };
}

/** Normalize validated V2 / stored legacy V2 data; never use instead of input validation. */
export function normalizeUserConfig(config?: UserAPIConfigV2 | null): UserAPIConfigV2 {
  const base = createEmptyUserConfig();
  if (!config) return base;
  return {
    version: 2,
    llmConfigs: config.llmConfigs || [], imageConfigs: config.imageConfigs || [], vlmConfigs: config.vlmConfigs || [],
    accuracyConfig: normalizeAccuracyConfig(config.accuracyConfig),
    activeLLMId: config.activeLLMId ?? null, activeImageId: config.activeImageId ?? null, activeVLMId: config.activeVLMId ?? null,
    updatedAt: config.updatedAt || base.updatedAt,
  };
}
