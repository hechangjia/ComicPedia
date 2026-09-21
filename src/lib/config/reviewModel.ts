import type { PartialLLMConfig, UserAPIConfigV2, UserLLMConfig } from "@/lib/types";

type ReviewModelRole = "llm" | "vlm";

/** Protocol hints build the client payload; only the server resolves credentials. */
export function toSavedLLMRequest(model: UserLLMConfig, role: ReviewModelRole): PartialLLMConfig {
  return {
    configId: model.id,
    configRole: role,
    apiUrl: model.apiUrl,
    model: model.model,
    provider: model.protocolType,
  };
}

/** Review defaults retain legacy first-entry fallback; explicit selections never fall back. */
export function resolveReviewModel(
  configs: UserAPIConfigV2,
  role: ReviewModelRole,
  selection?: string,
): PartialLLMConfig {
  if (selection) {
    const separator = selection.indexOf(":");
    const selectedRole = selection.slice(0, separator);
    const id = selection.slice(separator + 1);
    if (separator < 1 || !id || (selectedRole !== "llm" && selectedRole !== "vlm")) {
      throw new Error("模型配置选择无效，请重新选择");
    }
    const entries = selectedRole === "vlm" ? configs.vlmConfigs : configs.llmConfigs;
    const model = entries?.find((entry) => entry.id === id);
    if (!model) throw new Error("所选配置不存在或已删除，请重新选择");
    return toSavedLLMRequest(model, selectedRole);
  }
  if (role === "vlm") {
    const entries = configs.vlmConfigs ?? [];
    const model = entries.find((entry) => entry.id === configs.activeVLMId) ?? entries[0];
    if (model) return toSavedLLMRequest(model, "vlm");
  }
  const model = configs.llmConfigs.find((entry) => entry.id === configs.activeLLMId) ?? configs.llmConfigs[0];
  if (!model) throw new Error(role === "vlm" ? "未配置 VLM 或 LLM" : "未配置 LLM");
  return toSavedLLMRequest(model, "llm");
}
