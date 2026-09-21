"use client";

import { toSavedLLMRequest } from "@/lib/config/reviewModel";

import { useEffect, useCallback, useSyncExternalStore } from "react";
import {
  AccuracyProviderConfig,
  AccuracyProviderSlots,
  UserAPIConfig,
  UserAPIConfigV2,
  UserLLMConfig,
  UserImageConfig,
  PartialLLMConfig,
  PartialImageGenConfig,
} from "@/lib/types";
import { normalizeAccuracyConfig } from "@/lib/accuracy/providerConfig";

import { createConfigStore, type ConfigDraftMeta, type ConfigSnapshot } from "@/lib/config/configStore";

import { mergeConfigArchive, type MergeOptions, type MergeResult } from "@/lib/config/configTransfer";
import { validateConfigPayload } from "@/lib/config/configValidation";
import { createEmptyUserConfig as createEmptyConfig } from "@/lib/config/userConfig";
import { createConfigCache } from "@/lib/config/configCache";
let cache: ReturnType<typeof createConfigCache> | undefined;
function browserCache() {
  return cache ??= createConfigCache(localStorage, sessionStorage);
}
const CONFIG_VERSION = 2;

/** 配置验证结果 */
export interface ConfigValidation {
  isValid: boolean;
  hasLLM: boolean;
  hasImage: boolean;
  hasVLM: boolean;
  errors: string[];
}

/** 请求配置（用于传递给 API） */
export interface RequestConfigs {
  llmConfig?: PartialLLMConfig;
  imageConfig?: PartialImageGenConfig;
  vlmConfig?: PartialLLMConfig;
}

/** 生成唯一 ID */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** v1 → v2 迁移 */
function migrateV1ToV2(v1: UserAPIConfig): UserAPIConfigV2 {
  const v2 = createEmptyConfig();

  if (v1.llm) {
    const llmId = generateId();
    v2.llmConfigs.push({
      id: llmId,
      name: `${v1.llm.provider} (迁移)`,
      provider: v1.llm.provider,
      apiUrl: v1.llm.apiUrl,
      apiKey: v1.llm.apiKey,
      model: v1.llm.model,
      protocolType: v1.llm.protocolType,
    });
    v2.activeLLMId = llmId;
  }

  if (v1.image) {
    const imgId = generateId();
    v2.imageConfigs.push({
      id: imgId,
      name: `${v1.image.provider} (迁移)`,
      provider: v1.image.provider,
      apiUrl: v1.image.apiUrl,
      apiKey: v1.image.apiKey,
      model: v1.image.model,
      size: v1.image.size,
      endpointType: v1.image.endpointType,
    });
    v2.activeImageId = imgId;
  }

  return v2;
}

/** 从 localStorage 读取配置 */
function loadConfig(): UserAPIConfigV2 {
  if (typeof window === "undefined") {
    return createEmptyConfig();
  }

  try {
    const stored = browserCache().read();
    if (!stored) {
      return createEmptyConfig();
    }

    const parsed = JSON.parse(stored);

    // v1 → v2 迁移
    if (parsed.version === 1 || (!parsed.version && (parsed.llm || parsed.image))) {
      console.log("[APIConfig] 检测到 v1 配置，执行迁移");
      const migrated = migrateV1ToV2(parsed as UserAPIConfig);
      return migrated;
    }

    if (parsed.version === CONFIG_VERSION) {
      delete parsed._sync;
      if (validateConfigPayload(parsed)) throw new Error("Invalid cached config");
      const cfg = parsed as UserAPIConfigV2;
      // Ensure vlmConfigs exists (backward compat with pre-VLM configs)
      if (!cfg.vlmConfigs) cfg.vlmConfigs = [];
      if (cfg.activeVLMId === undefined) cfg.activeVLMId = null;
      cfg.accuracyConfig = normalizeAccuracyConfig(cfg.accuracyConfig);
      return cfg;
    }

    console.log("[APIConfig] 配置版本不匹配，重置配置");
    return createEmptyConfig();
  } catch {
    console.error("[APIConfig] 本地配置无法读取；原始缓存将在替换前保留备份。");
    return createEmptyConfig();
  }
}

/** 验证 LLM 配置 */
function validateLLMConfig(config: UserLLMConfig): string[] {
  const errors: string[] = [];
  if (!config.apiUrl?.trim()) errors.push("LLM API URL 不能为空");
  // API Key 非必填（本地 Ollama 等不需要）
  if (!config.model?.trim()) errors.push("LLM 模型名称不能为空");
  return errors;
}

/** 验证文生图配置 */
function validateImageConfig(config: UserImageConfig): string[] {
  const errors: string[] = [];
  if (!config.apiUrl?.trim()) errors.push("文生图 API URL 不能为空");
  // API Key 非必填（ComfyUI 等本地服务不需要）
  return errors;
}

const EMPTY_CONFIG_SNAPSHOT: ConfigSnapshot = {
  config: createEmptyConfig(),
  isLoaded: false,
  syncStatus: "loading",
};

let configStoreSnapshot = EMPTY_CONFIG_SNAPSHOT;
let store: ReturnType<typeof createConfigStore> | undefined;
const configStoreListeners = new Set<() => void>();

function emitConfigStore(snapshot: ConfigSnapshot) {
  configStoreSnapshot = snapshot;
  configStoreListeners.forEach((listener) => listener());
}

function subscribeConfigStore(listener: () => void) {
  configStoreListeners.add(listener);
  return () => {
    configStoreListeners.delete(listener);
  };
}

function getConfigSnapshot() {
  return configStoreSnapshot;
}

function getConfigStoreServerSnapshot() {
  return EMPTY_CONFIG_SNAPSHOT;
}

function ensureConfigStoreLoaded() {
  if (store || typeof window === "undefined") return;
  const initial = loadConfig();
  let meta: ConfigDraftMeta | undefined;
  let hasLocalConfig = false;
  try {
    const raw = browserCache().read();
    hasLocalConfig = !!raw;
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?._sync && typeof parsed._sync.dirty === "boolean" && (typeof parsed._sync.revision === "string" || parsed._sync.revision === null)) meta = parsed._sync;
  } catch { /* preserve a recoverable load failure in the store status */ }
  store = createConfigStore({
    initial, meta, hasLocalConfig,
    request: (url, init) => fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(30_000) }),
    persist: (config, sync) => browserCache().write(JSON.stringify({ ...config, _sync: sync }), sync.dirty),
  });
  store.subscribe(() => emitConfigStore(store!.getSnapshot()));
  void store.load();
}

function updateStoredConfig(updater: (config: UserAPIConfigV2) => UserAPIConfigV2) {
  ensureConfigStoreLoaded();
  store?.edit(prev => {
    const next = updater(prev);
    return { ...next, accuracyConfig: normalizeAccuracyConfig(next.accuracyConfig) };
  });
}
function useConfigStore() {
  const snapshot = useSyncExternalStore(
    subscribeConfigStore,
    getConfigSnapshot,
    getConfigStoreServerSnapshot,
  );

  useEffect(() => {
    ensureConfigStoreLoaded();
  }, []);

  return snapshot;
}

/** Read-only reactive view for selectors and creation preflight. */
export const useConfigSnapshot = useConfigStore;
export function getStoredConfigSnapshot(): ConfigSnapshot {
  ensureConfigStoreLoaded();
  return store?.getSnapshot() ?? EMPTY_CONFIG_SNAPSHOT;
}

/** 完整配置管理 Hook */
export function useAPIConfig() {
  const { config, isLoaded, syncStatus, syncError, storageError } = useConfigStore();

  const updateConfig = useCallback((updater: (prev: UserAPIConfigV2) => UserAPIConfigV2) => {
    updateStoredConfig(updater);
  }, []);

  // --- LLM CRUD ---

  const addLLM = useCallback((llm: Omit<UserLLMConfig, "id">) => {
    updateConfig((prev) => {
      const id = generateId();
      return {
        ...prev,
        llmConfigs: [...prev.llmConfigs, { ...llm, id }],
        activeLLMId: prev.activeLLMId ?? id,
      };
    });
  }, [updateConfig]);

  const updateLLMById = useCallback((id: string, updates: Partial<Omit<UserLLMConfig, "id">>) => {
    updateConfig((prev) => ({
      ...prev,
      llmConfigs: prev.llmConfigs.map((c) =>
        c.id === id ? { ...c, ...updates } : c,
      ),
    }));
  }, [updateConfig]);

  const removeLLM = useCallback((id: string) => {
    updateConfig((prev) => {
      const remaining = prev.llmConfigs.filter((c) => c.id !== id);
      return {
        ...prev,
        llmConfigs: remaining,
        activeLLMId: prev.activeLLMId === id ? (remaining[0]?.id ?? null) : prev.activeLLMId,
      };
    });
  }, [updateConfig]);

  const setActiveLLM = useCallback((id: string) => {
    updateConfig((prev) => ({ ...prev, activeLLMId: id }));
  }, [updateConfig]);

  // --- Image CRUD ---

  const addImage = useCallback((img: Omit<UserImageConfig, "id">) => {
    updateConfig((prev) => {
      const id = generateId();
      return {
        ...prev,
        imageConfigs: [...prev.imageConfigs, { ...img, id }],
        activeImageId: prev.activeImageId ?? id,
      };
    });
  }, [updateConfig]);

  const updateImageById = useCallback((id: string, updates: Partial<Omit<UserImageConfig, "id">>) => {
    updateConfig((prev) => ({
      ...prev,
      imageConfigs: prev.imageConfigs.map((c) =>
        c.id === id ? { ...c, ...updates } : c,
      ),
    }));
  }, [updateConfig]);

  const removeImage = useCallback((id: string) => {
    updateConfig((prev) => {
      const remaining = prev.imageConfigs.filter((c) => c.id !== id);
      return {
        ...prev,
        imageConfigs: remaining,
        activeImageId: prev.activeImageId === id ? (remaining[0]?.id ?? null) : prev.activeImageId,
      };
    });
  }, [updateConfig]);

  const setActiveImage = useCallback((id: string) => {
    updateConfig((prev) => ({ ...prev, activeImageId: id }));
  }, [updateConfig]);

  // --- VLM CRUD ---

  const addVLM = useCallback((vlm: Omit<UserLLMConfig, "id">) => {
    updateConfig((prev) => {
      const id = generateId();
      return {
        ...prev,
        vlmConfigs: [...(prev.vlmConfigs || []), { ...vlm, id }],
        activeVLMId: prev.activeVLMId ?? id,
      };
    });
  }, [updateConfig]);

  const updateVLMById = useCallback((id: string, updates: Partial<Omit<UserLLMConfig, "id">>) => {
    updateConfig((prev) => ({
      ...prev,
      vlmConfigs: (prev.vlmConfigs || []).map((c) =>
        c.id === id ? { ...c, ...updates } : c,
      ),
    }));
  }, [updateConfig]);

  const removeVLM = useCallback((id: string) => {
    updateConfig((prev) => {
      const remaining = (prev.vlmConfigs || []).filter((c) => c.id !== id);
      return {
        ...prev,
        vlmConfigs: remaining,
        activeVLMId: prev.activeVLMId === id ? (remaining[0]?.id ?? null) : prev.activeVLMId,
      };
    });
  }, [updateConfig]);

  const setActiveVLM = useCallback((id: string) => {
    updateConfig((prev) => ({ ...prev, activeVLMId: id }));
  }, [updateConfig]);

  // --- Accuracy Provider CRUD ---

  const addAccuracyProvider = useCallback((provider: Omit<AccuracyProviderConfig, "id">) => {
    updateConfig((prev) => ({
      ...prev,
      accuracyConfig: normalizeAccuracyConfig({
        ...prev.accuracyConfig,
        providers: [...prev.accuracyConfig.providers, { ...provider, id: generateId() }],
      }),
    }));
  }, [updateConfig]);

  const updateAccuracyProviderById = useCallback((id: string, updates: Partial<Omit<AccuracyProviderConfig, "id">>) => {
    updateConfig((prev) => ({
      ...prev,
      accuracyConfig: normalizeAccuracyConfig({
        ...prev.accuracyConfig,
        providers: prev.accuracyConfig.providers.map((provider) =>
          provider.id === id ? { ...provider, ...updates } : provider,
        ),
      }),
    }));
  }, [updateConfig]);

  const removeAccuracyProvider = useCallback((id: string) => {
    updateConfig((prev) => ({
      ...prev,
      accuracyConfig: normalizeAccuracyConfig({
        ...prev.accuracyConfig,
        providers: prev.accuracyConfig.providers.filter((provider) => provider.id !== id),
      }),
    }));
  }, [updateConfig]);

  const assignAccuracySlot = useCallback((slot: keyof AccuracyProviderSlots, providerId: string | null) => {
    updateConfig((prev) => ({
      ...prev,
      accuracyConfig: normalizeAccuracyConfig({
        ...prev.accuracyConfig,
        slots: {
          ...prev.accuracyConfig.slots,
          [slot]: providerId,
        },
      }),
    }));
  }, [updateConfig]);

  const setAccuracyWhitelistDomains = useCallback((domains: string[]) => {
    updateConfig((prev) => ({
      ...prev,
      accuracyConfig: normalizeAccuracyConfig({
        ...prev.accuracyConfig,
        whitelistDomains: domains,
      }),
    }));
  }, [updateConfig]);

  // --- Helpers ---

  const getLLMById = useCallback((id: string) => {
    return config.llmConfigs.find((c) => c.id === id) ?? null;
  }, [config]);

  const getImageById = useCallback((id: string) => {
    return config.imageConfigs.find((c) => c.id === id) ?? null;
  }, [config]);

  const getVLMById = useCallback((id: string) => {
    return (config.vlmConfigs || []).find((c) => c.id === id) ?? null;
  }, [config]);

  const importArchive = useCallback((incoming: UserAPIConfigV2, options: MergeOptions = {}): MergeResult => {
    let result: MergeResult | undefined;
    updateStoredConfig(current => {
      result = mergeConfigArchive(current, incoming, options);
      return result.config;
    });
    if (!result) throw new Error("配置尚未加载，无法导入");
    return result;
  }, []);
  const clearAll = useCallback(() => {
    updateStoredConfig(() => createEmptyConfig());
  }, []);

  const validate = useCallback((): ConfigValidation => {
    const activeLLM = config.llmConfigs.find((c) => c.id === config.activeLLMId);
    const activeImage = config.imageConfigs.find((c) => c.id === config.activeImageId);
    const activeVLM = (config.vlmConfigs || []).find((c) => c.id === config.activeVLMId);

    const llmErrors = activeLLM ? validateLLMConfig(activeLLM) : [];
    const imageErrors = activeImage ? validateImageConfig(activeImage) : [];
    const vlmErrors = activeVLM ? validateLLMConfig(activeVLM) : [];

    const hasLLM = !!activeLLM && llmErrors.length === 0;
    const hasImage = !!activeImage && imageErrors.length === 0;
    const hasVLM = !!activeVLM && vlmErrors.length === 0;

    return {
      isValid: hasLLM,
      hasLLM,
      hasImage,
      hasVLM,
      errors: [...llmErrors, ...imageErrors, ...vlmErrors],
    };
  }, [config]);

  return {
    config,
    isLoaded,
    syncStatus, syncError, storageError,
    retrySync: () => store?.retry(),
    reloadFromServer: () => store?.reloadFromServer(),
    refreshFromServer: () => store?.refresh(),
    addLLM,
    updateLLMById,
    removeLLM,
    setActiveLLM,
    addImage,
    updateImageById,
    removeImage,
    setActiveImage,
    addVLM,
    updateVLMById,
    removeVLM,
    setActiveVLM,
    addAccuracyProvider,
    updateAccuracyProviderById,
    removeAccuracyProvider,
    assignAccuracySlot,
    setAccuracyWhitelistDomains,
    getLLMById,
    getImageById,
    getVLMById,
    clearAll,
    importArchive,
    validate,
  };
}

/** 快速检测配置状态 Hook（首页使用） */
export function useConfigCheck() {
  const { config, isLoaded } = useConfigStore();
  const activeLLM = config.llmConfigs.find((c) => c.id === config.activeLLMId);
  const activeImage = config.imageConfigs.find((c) => c.id === config.activeImageId);

  const llmErrors = activeLLM ? validateLLMConfig(activeLLM) : [];
  const imageErrors = activeImage ? validateImageConfig(activeImage) : [];

  return {
    isLoaded,
    hasLLM: !!activeLLM && llmErrors.length === 0,
    hasImage: !!activeImage && imageErrors.length === 0,
  };
}

/** 获取所有已保存的配置列表（非 Hook） */
export function getStoredConfigs(): UserAPIConfigV2 {
  ensureConfigStoreLoaded();
  return store?.getSnapshot().config ?? loadConfig();
}

/** 直接获取请求配置（非 Hook，用于事件处理器） */
export function getStoredRequestConfigs(llmId?: string, imageId?: string, vlmId?: string): RequestConfigs {
  const config = getStoredConfigs();
  const result: RequestConfigs = {};

  const targetLLMId = llmId ?? config.activeLLMId;
  const targetImageId = imageId ?? config.activeImageId;
  const targetVLMId = vlmId ?? config.activeVLMId;

  const llm = targetLLMId ? config.llmConfigs.find((c) => c.id === targetLLMId) : null;
  const image = targetImageId ? config.imageConfigs.find((c) => c.id === targetImageId) : null;
  const vlm = targetVLMId ? (config.vlmConfigs || []).find((c) => c.id === targetVLMId) : null;

  if (llm) {
    result.llmConfig = toSavedLLMRequest(llm, "llm");
  }

  if (image) {
    result.imageConfig = {
      apiUrl: image.apiUrl,
      configId: image.id,
      configRole: "image",
      model: image.model,
      size: image.size,
      endpointType: image.endpointType,

    };
  }

  // VLM config: use dedicated VLM if configured, otherwise fall back to LLM
  if (vlm) {
    result.vlmConfig = toSavedLLMRequest(vlm, "vlm");
  } else if (llm) {
    result.vlmConfig = result.llmConfig;
  }

  return result;
}
