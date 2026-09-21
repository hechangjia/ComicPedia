import type { UserAPIConfigV2, UserImageConfig, UserLLMConfig } from "@/lib/types";

type Model = UserLLMConfig | UserImageConfig;
export class ModelCredentialError extends Error {}

function connection(config: Model): string {
  return JSON.stringify([config.apiUrl.trim(), "protocolType" in config ? config.protocolType : config.endpointType]);
}
function mapModels(config: UserAPIConfigV2, transform: (model: Model, role: "llmConfigs" | "vlmConfigs" | "imageConfigs") => Model): UserAPIConfigV2 {
  return {
    ...config,
    llmConfigs: config.llmConfigs.map(m => transform(m, "llmConfigs") as UserLLMConfig),
    vlmConfigs: (config.vlmConfigs ?? []).map(m => transform(m, "vlmConfigs") as UserLLMConfig),
    imageConfigs: config.imageConfigs.map(m => transform(m, "imageConfigs") as UserImageConfig),
  };
}

/** Saved credentials leave the server only as a presence flag, not even a suffix. */
export function sanitizeModelCredentials(config: UserAPIConfigV2): UserAPIConfigV2 {
  return mapModels(config, model => {
    const { apiKey, clearApiKey: _clear, apiKeyInputRequired: _required, ...metadata } = model;
    return { ...metadata, apiKey: "", hasApiKey: Boolean(apiKey) };
  });
}

/** Empty/omitted means keep, a value means replace, clearApiKey means delete. */
export function mergeModelCredentials(existing: UserAPIConfigV2, incoming: UserAPIConfigV2): UserAPIConfigV2 {
  return mapModels(incoming, (model, role) => {
    const old = existing[role]?.find(item => item.id === model.id);
    const input = model.apiKey?.trim() ?? "";
    if (model.clearApiKey && input) throw new ModelCredentialError("不能同时替换和清除密钥");
    if (model.apiKeyInputRequired && !input && !model.clearApiKey) throw new ModelCredentialError("草稿密钥未缓存，请重新输入或明确清除");
    if (old?.apiKey && !input && !model.clearApiKey && connection(old) !== connection(model)) {
      throw new ModelCredentialError("地址或协议已改变，请重新输入密钥或明确清除原密钥");
    }
    const apiKey = model.clearApiKey ? "" : input || old?.apiKey || "";
    const { clearApiKey: _clear, apiKeyInputRequired: _required, ...metadata } = model;
    return { ...metadata, apiKey, hasApiKey: Boolean(apiKey) };
  });
}

/** Consume exactly the acknowledged input, never a newer concurrent replacement. */
export function acknowledgeModelCredentials(current: UserAPIConfigV2, sent: UserAPIConfigV2): UserAPIConfigV2 {
  return mapModels(current, (model, role) => {
    const submitted = sent[role]?.find(item => item.id === model.id);
    if (!submitted || model.apiKey !== submitted.apiKey || model.clearApiKey !== submitted.clearApiKey) return model;
    const { clearApiKey: _clear, apiKeyInputRequired: _required, ...metadata } = model;
    return { ...metadata, apiKey: "", hasApiKey: submitted.clearApiKey ? false : Boolean(submitted.apiKey?.trim() || submitted.hasApiKey) };
  });
}

export function hasMissingCredentialInput(config: UserAPIConfigV2): boolean {
  return [...config.llmConfigs, ...(config.vlmConfigs ?? []), ...config.imageConfigs]
    .some(m => m.apiKeyInputRequired && !m.apiKey?.trim() && !m.clearApiKey);
}
