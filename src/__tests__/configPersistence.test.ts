import { beforeEach, describe, expect, it } from "vitest";
import { getConfig, saveConfig, saveConfigIfMatch } from "@/lib/server/db";
import { configRevision } from "@/lib/server/configRevision";
import { createEmptyAccuracyConfig } from "@/lib/accuracy/providerConfig";
import type { UserAPIConfigV2 } from "@/lib/types";
const config = (): UserAPIConfigV2 => ({ version: 2, llmConfigs: [], imageConfigs: [], accuracyConfig: createEmptyAccuracyConfig(), activeLLMId: null, activeImageId: null, updatedAt: "2026-09-20T00:00:00Z" });
describe("SQLite config conditional writes", () => {
  beforeEach(() => saveConfig(config()));
  it("allows exactly one writer using the same revision", () => {
    const revision = configRevision(getConfig());
    const first = { ...config(), updatedAt: "first" };
    expect(saveConfigIfMatch(first, revision)).toBe(true);
    expect(saveConfigIfMatch({ ...config(), updatedAt: "second" }, revision)).toBe(false);
    expect(getConfig()?.updatedAt).toBe("first");
  });
  it("detects other service writes even if the timestamp stayed the same", () => {
    const revision = configRevision(getConfig());
    saveConfig({ ...config(), activeLLMId: "external-write" });
    expect(saveConfigIfMatch(config(), revision)).toBe(false);
  });
});
