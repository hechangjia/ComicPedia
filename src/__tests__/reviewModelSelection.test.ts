import { describe, expect, it } from "vitest";
import { resolveReviewModel, toSavedLLMRequest } from "@/lib/config/reviewModel";
import { createEmptyUserConfig } from "@/lib/config/userConfig";
import type { UserAPIConfigV2, UserLLMConfig } from "@/lib/types";

const model: UserLLMConfig = { id: "shared:id", name: "Same", provider: "custom", apiUrl: "https://model.example/v1", apiKey: "local-draft", model: "shared-model", protocolType: "openai-compatible" };
function configs(): UserAPIConfigV2 {
  return { ...createEmptyUserConfig(), llmConfigs: [model], vlmConfigs: [{ ...model, protocolType: "anthropic" }], activeLLMId: model.id, activeVLMId: model.id };
}
describe("review model selection", () => {
  it("copies only saved reference and nonsecret protocol hints", () => {
    expect(toSavedLLMRequest(model, "llm")).toEqual({ configId: model.id, configRole: "llm", apiUrl: model.apiUrl, model: model.model, provider: model.protocolType });
    expect(model.apiKey).toBe("local-draft");
  });
  it.each(["llm", "vlm"] as const)("honors explicit %s selection and IDs containing colons", role => {
    expect(resolveReviewModel(configs(), "vlm", `${role}:${model.id}`)).toMatchObject({ configId: model.id, configRole: role, provider: role === "vlm" ? "anthropic" : "openai-compatible" });
  });
  it.each(["vlm:deleted", "llm:deleted", "image:shared:id", "garbage", "vlm:"])("rejects invalid explicit selection %s instead of silently switching", selection => {
    expect(() => resolveReviewModel(configs(), "vlm", selection)).toThrow();
  });
  it("uses the active entry instead of the first otherwise identical model", () => {
    const config = configs();
    config.vlmConfigs!.push({ ...model, id: "second" });
    config.activeVLMId = "second";
    expect(resolveReviewModel(config, "vlm").configId).toBe("second");
  });
  it("preserves first-entry default for legacy configs without an active VLM", () => {
    const config = configs(); config.activeVLMId = null;
    expect(resolveReviewModel(config, "vlm").configRole).toBe("vlm");
  });
  it("uses LLM identity only when there are no VLM entries", () => {
    const config = configs(); config.vlmConfigs = [];
    expect(resolveReviewModel(config, "vlm").configRole).toBe("llm");
  });
  it("reports unconfigured roles before making a request", () => {
    expect(() => resolveReviewModel(createEmptyUserConfig(), "llm")).toThrow("未配置 LLM");
    expect(() => resolveReviewModel(createEmptyUserConfig(), "vlm")).toThrow("未配置 VLM 或 LLM");
  });
});
