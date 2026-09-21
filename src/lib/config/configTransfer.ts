import type { AccuracyProviderConfig, UserAPIConfigV2, UserImageConfig, UserLLMConfig } from "@/lib/types";
import { createEmptyUserConfig, normalizeUserConfig } from "./userConfig";
import { validateConfigPayload } from "./configValidation";

export const MAX_CONFIG_ARCHIVE_BYTES = 2 * 1024 * 1024;
export interface TransferCounts { llm: number; vlm: number; image: number; accuracy: number }
export interface ParsedConfigArchive { config: UserAPIConfigV2; credentialCount: number; workflowCount: number; omittedWorkflows?: number }
export interface MergeOptions { includeCredentials?: boolean; includeWorkflows?: boolean; createId?: () => string }
export interface MergeResult { config: UserAPIConfigV2; added: TransferCounts; skipped: TransferCounts }

function modelFields(c: UserLLMConfig) {
  return { id: c.id, name: c.name, provider: c.provider, apiUrl: c.apiUrl, model: c.model, protocolType: c.protocolType };
}
function imageFields(c: UserImageConfig, includeWorkflows: boolean) {
  return { id: c.id, name: c.name, provider: c.provider, apiUrl: c.apiUrl, model: c.model, size: c.size, endpointType: c.endpointType,
    ...(includeWorkflows && c.comfyuiWorkflow ? { comfyuiWorkflow: c.comfyuiWorkflow } : {}) };
}
function providerFields(p: AccuracyProviderConfig) {
  return { id: p.id, name: p.name, kind: p.kind, vendor: p.vendor, baseUrl: p.baseUrl, enabled: p.enabled, priority: p.priority, capabilities: [...p.capabilities] };
}

/** Allowlist transport fields; arbitrary extension fields cannot smuggle stored secrets into an export. */
export function exportConfigArchive(config: UserAPIConfigV2, options: { includeWorkflows?: boolean } = {}) {
  const validation = validateConfigPayload(config);
  if (validation) throw new Error(validation);
  const c = normalizeUserConfig(config);
  return {
    app: "comicpedia" as const, type: "config" as const, formatVersion: 1, version: 2 as const,
    exportedAt: new Date().toISOString(), apiKeyFieldsIncluded: false, embeddedWorkflowsIncluded: !!options.includeWorkflows,
    omittedWorkflows: options.includeWorkflows ? 0 : c.imageConfigs.filter(i => i.comfyuiWorkflow).length,
    llmConfigs: c.llmConfigs.map(modelFields), vlmConfigs: c.vlmConfigs!.map(modelFields),
    imageConfigs: c.imageConfigs.map(i => imageFields(i, !!options.includeWorkflows)),
    activeLLMId: c.activeLLMId, activeVLMId: c.activeVLMId, activeImageId: c.activeImageId,
    accuracyConfig: { providers: c.accuracyConfig.providers.map(providerFields), slots: { ...c.accuracyConfig.slots }, whitelistDomains: [...c.accuracyConfig.whitelistDomains] },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function checkRoleReferences(c: UserAPIConfigV2) {
  for (const [slot, id] of Object.entries(c.accuracyConfig?.slots ?? {})) {
    if (!id) continue;
    const p = c.accuracyConfig.providers.find(p => p.id === id);
    if (!p || !p.enabled || p.kind !== (slot.toLowerCase().includes("fetch") ? "fetch" : "search")) throw new Error("检索角色指向了禁用或能力不匹配的服务");
  }
}

/** Parse/validate everything first. This function never modifies the active store. */
export function parseConfigArchive(text: string): ParsedConfigArchive {
  if (new TextEncoder().encode(text).byteLength > MAX_CONFIG_ARCHIVE_BYTES) throw new Error("配置文件超过 2 MB 限制");
  let raw: unknown;
  try { raw = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { throw new Error("配置文件不是有效 JSON"); }
  if (!isRecord(raw)) throw new Error("配置文件必须是对象");
  if ((raw.app !== undefined && raw.app !== "comicpedia") || (raw.type !== undefined && raw.type !== "config") || (raw.formatVersion !== undefined && raw.formatVersion !== 1)) throw new Error("不是受支持的 ComicPedia 配置文件");
  let payload: Record<string, unknown>;
  const base = createEmptyUserConfig();
  if (raw.version === 1 || (raw.version === undefined && (raw.llm || raw.image))) {
    if ((raw.llm != null && !isRecord(raw.llm)) || (raw.image != null && !isRecord(raw.image))) throw new Error("旧版配置格式无效");
    payload = { ...base,
      llmConfigs: raw.llm ? [{ ...raw.llm as object, id: "legacy-llm", name: (raw.llm as Record<string, unknown>).name || "迁移文字模型" }] : [],
      imageConfigs: raw.image ? [{ ...raw.image as object, id: "legacy-image", name: (raw.image as Record<string, unknown>).name || "迁移图片模型" }] : [],
      activeLLMId: raw.llm ? "legacy-llm" : null, activeImageId: raw.image ? "legacy-image" : null,
    };
  } else {
    if (raw.version !== 2 && !(raw.version === undefined && raw.app === "comicpedia" && raw.type === "config")) throw new Error("不支持的配置版本");
    if (raw.version === 2 && (!Array.isArray(raw.llmConfigs) || !Array.isArray(raw.imageConfigs))) throw new Error("V2 配置缺少模型列表");
    payload = { ...base, ...raw, version: 2 };
  }
  const error = validateConfigPayload(payload);
  if (error) throw new Error(error);
  checkRoleReferences(payload as unknown as UserAPIConfigV2);
  const c = normalizeUserConfig(payload as unknown as UserAPIConfigV2);
  const credentials = [...c.llmConfigs, ...c.vlmConfigs!, ...c.imageConfigs, ...c.accuracyConfig.providers].filter(p => p.apiKey?.trim()).length;
  // Reconstruct instead of spreading untrusted fields. Health/masked-key claims are not portable evidence.
  return { omittedWorkflows: typeof raw.omittedWorkflows === "number" && Number.isInteger(raw.omittedWorkflows) && raw.omittedWorkflows >= 0 && raw.omittedWorkflows <= 200 ? raw.omittedWorkflows : 0, credentialCount: credentials, workflowCount: c.imageConfigs.filter(i => i.comfyuiWorkflow).length, config: {
    ...base, activeLLMId: c.activeLLMId, activeImageId: c.activeImageId, activeVLMId: c.activeVLMId,
    llmConfigs: c.llmConfigs.map(m => ({ ...modelFields(m), apiKey: m.apiKey ?? "" })),
    vlmConfigs: c.vlmConfigs!.map(m => ({ ...modelFields(m), apiKey: m.apiKey ?? "" })),
    imageConfigs: c.imageConfigs.map(m => ({ ...imageFields(m, true), apiKey: m.apiKey ?? "" })),
    accuracyConfig: { ...c.accuracyConfig, providers: c.accuracyConfig.providers.map(p => ({ ...providerFields(p), apiKey: p.apiKey })) },
  } };
}

const counts = (): TransferCounts => ({ llm: 0, vlm: 0, image: 0, accuracy: 0 });
const modelIdentity = (m: UserLLMConfig) => JSON.stringify([m.name, m.provider, m.apiUrl, m.model, m.protocolType]);
const imageIdentity = (m: UserImageConfig) => JSON.stringify([m.name, m.provider, m.apiUrl, m.model, m.endpointType, m.size, m.comfyuiWorkflow ?? ""]);
const providerIdentity = (p: AccuracyProviderConfig) => JSON.stringify([p.name, p.kind, p.vendor, p.baseUrl, p.enabled, p.priority, p.capabilities]);

/** One immutable merge. Current secrets and selections win; imported IDs never identify local credentials. */
export function mergeConfigArchive(current: UserAPIConfigV2, incoming: UserAPIConfigV2, options: MergeOptions = {}): MergeResult {
  const error = validateConfigPayload(incoming);
  if (error) throw new Error(error);
  checkRoleReferences(incoming);
  const added = counts(), skipped = counts();
  const used = new Set([...current.llmConfigs, ...(current.vlmConfigs ?? []), ...current.imageConfigs, ...current.accuracyConfig.providers].map(m => m.id));
  const newId = () => {
    for (let attempt = 0; attempt < 1000; attempt++) {
      const id = (options.createId ?? (() => crypto.randomUUID()))();
      if (id && !used.has(id)) { used.add(id); return id; }
    }
    throw new Error("无法生成独立配置 ID，未导入任何内容");
  };
  function merge<T extends { id: string }>(role: keyof TransferCounts, existing: T[], imports: T[], identity: (m: T) => string, fresh: (m: T) => T) {
    const list = [...existing], mapping = new Map<string, string>();
    const known = new Map(list.map(m => [identity(m), m]));
    for (const m of imports) {
      const sanitized = fresh(m);
      const duplicate = known.get(identity(sanitized));
      if (duplicate) { mapping.set(m.id, duplicate.id); skipped[role]++; continue; }
      const copy = { ...sanitized, id: newId() };
      list.push(copy); known.set(identity(copy), copy); mapping.set(m.id, copy.id); added[role]++;
    }
    return { list, mapping };
  }
  const modelCopy = (m: UserLLMConfig) => ({ ...modelFields(m), apiKey: options.includeCredentials ? m.apiKey ?? "" : "" });
  const llm = merge("llm", current.llmConfigs, incoming.llmConfigs, modelIdentity, modelCopy);
  const vlm = merge("vlm", current.vlmConfigs ?? [], incoming.vlmConfigs ?? [], modelIdentity, modelCopy);
  const image = merge("image", current.imageConfigs, incoming.imageConfigs, m => imageIdentity({ ...m, comfyuiWorkflow: options.includeWorkflows ? m.comfyuiWorkflow : undefined }), m => ({ ...imageFields(m, !!options.includeWorkflows), apiKey: options.includeCredentials ? m.apiKey ?? "" : "" }));
  const accuracy = merge("accuracy", current.accuracyConfig.providers, incoming.accuracyConfig.providers, providerIdentity, p => ({ ...providerFields(p), apiKey: options.includeCredentials ? p.apiKey : undefined, hasApiKey: !!(options.includeCredentials && p.apiKey) }));
  const select = (old: string | null | undefined, id: string | null | undefined, map: Map<string, string>) => old ?? (id ? map.get(id) ?? null : null);
  const slots = { ...current.accuracyConfig.slots };
  for (const key of Object.keys(slots) as Array<keyof typeof slots>) slots[key] = select(slots[key], incoming.accuracyConfig.slots[key], accuracy.mapping);
  const config: UserAPIConfigV2 = { ...current, llmConfigs: llm.list, vlmConfigs: vlm.list, imageConfigs: image.list,
    activeLLMId: select(current.activeLLMId, incoming.activeLLMId, llm.mapping), activeVLMId: select(current.activeVLMId, incoming.activeVLMId, vlm.mapping), activeImageId: select(current.activeImageId, incoming.activeImageId, image.mapping),
    accuracyConfig: { providers: accuracy.list, slots, whitelistDomains: [...new Set([...current.accuracyConfig.whitelistDomains, ...incoming.accuracyConfig.whitelistDomains])] },
  };
  const mergedError = validateConfigPayload(config);
  if (mergedError) throw new Error(mergedError);
  return { config, added, skipped };
}
