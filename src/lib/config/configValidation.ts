import { modelEndpoint } from "@/lib/providers/endpoints";

type RecordValue = Record<string, unknown>;
const record = (v: unknown): v is RecordValue => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string";
const nonempty = (v: unknown): v is string => text(v) && !!v.trim();
const optionalText = (v: unknown) => v === undefined || text(v);
function apiUrl(v: unknown): boolean {
  if (!nonempty(v)) return false;
  try { modelEndpoint(v, "models"); return true; } catch { return false; }
}

/** Validate the wire format BEFORE normalizing or dropping any entries. No secret values in errors. */
export function validateConfigPayload(input: unknown): string | null {
  if (!record(input) || input.version !== 2) return "仅支持 v2 配置对象";
  for (const [listKey, activeKey, image] of [
    ["llmConfigs", "activeLLMId", false], ["imageConfigs", "activeImageId", true], ["vlmConfigs", "activeVLMId", false],
  ] as const) {
    const list = input[listKey] ?? (listKey === "vlmConfigs" ? [] : undefined);
    if (!Array.isArray(list) || list.length > 200) return `${listKey} 必须是最多 200 项的数组`;
    const ids = new Set<string>();
    for (const item of list) {
      if (!record(item) || !nonempty(item.id) || ids.has(item.id) || !nonempty(item.name) || !nonempty(item.provider)
        || !apiUrl(item.apiUrl) || !optionalText(item.apiKey) || !text(item.model)) return `${listKey} 存在无效配置或重复 ID`;
      if (["hasApiKey", "clearApiKey", "apiKeyInputRequired"].some(key => item[key] !== undefined && typeof item[key] !== "boolean")) return "密钥操作标记格式无效";
      if (item.clearApiKey && typeof item.apiKey === "string" && item.apiKey.trim()) return "不能同时替换和清除密钥";
      ids.add(item.id);
      if (image) {
        if (!text(item.size) || !["auto", "chat", "images", "comfyui"].includes(String(item.endpointType)) || !optionalText(item.comfyuiWorkflow)) return "文生图配置格式无效";
      } else if (!["openai-compatible", "anthropic"].includes(String(item.protocolType)) || !nonempty(item.model)) return `${listKey} 模型或协议无效`;
    }
    const active = input[activeKey];
    if (active !== null && active !== undefined && (!text(active) || !ids.has(active))) return `${activeKey} 未指向有效配置`;
  }
  if (!optionalText(input.updatedAt)) return "配置时间格式无效";
  if (input.accuracyConfig !== undefined) {
    const accuracy = input.accuracyConfig;
    if (!record(accuracy) || !Array.isArray(accuracy.providers) || accuracy.providers.length > 200) return "检索配置格式无效";
    const ids = new Set<string>();
    for (const p of accuracy.providers) {
      if (!record(p) || !nonempty(p.id) || ids.has(p.id) || !nonempty(p.name) || !apiUrl(p.baseUrl)
        || !optionalText(p.apiKey) || !["search", "fetch"].includes(String(p.kind))
        || !["firecrawl", "tavily", "custom"].includes(String(p.vendor))
        || (p.capabilities !== undefined && (!Array.isArray(p.capabilities) || !p.capabilities.every(text)))
        || (p.enabled !== undefined && typeof p.enabled !== "boolean")
        || (p.priority !== undefined && (typeof p.priority !== "number" || !Number.isFinite(p.priority)))) return "检索服务配置无效";
      ids.add(p.id);
    }
    if (accuracy.whitelistDomains !== undefined && (!Array.isArray(accuracy.whitelistDomains) || !accuracy.whitelistDomains.every(text))) return "白名单域名格式无效";
    if (accuracy.slots !== undefined) {
      if (!record(accuracy.slots)) return "检索角色配置无效";
      for (const key of ["primarySearch", "fallbackSearch", "primaryFetch", "fallbackFetch"]) {
        const id = accuracy.slots[key];
        if (id != null && (!text(id) || !ids.has(id))) return "检索角色未指向有效服务";
      }
    }
  }
  return null;
}
