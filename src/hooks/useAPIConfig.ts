"use client";

import { useState, useEffect, useCallback } from "react";
import {
  UserAPIConfig,
  UserAPIConfigV2,
  UserLLMConfig,
  UserImageConfig,
  PartialLLMConfig,
  PartialImageGenConfig,
} from "@/lib/types";

const STORAGE_KEY = "comicpedia_api_config";
const CONFIG_VERSION = 2;

/** 配置验证结果 */
export interface ConfigValidation {
  isValid: boolean;
  hasLLM: boolean;
  hasImage: boolean;
  errors: string[];
}

/** 请求配置（用于传递给 API） */
export interface RequestConfigs {
  llmConfig?: PartialLLMConfig;
  imageConfig?: PartialImageGenConfig;
}

/** 生成唯一 ID */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** 创建空 V2 配置 */
function createEmptyConfig(): UserAPIConfigV2 {
  return {
    version: 2,
    llmConfigs: [],
    imageConfigs: [],
    activeLLMId: null,
    activeImageId: null,
    updatedAt: new Date().toISOString(),
  };
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
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return createEmptyConfig();
    }

    const parsed = JSON.parse(stored);

    // v1 → v2 迁移
    if (parsed.version === 1 || (!parsed.version && (parsed.llm || parsed.image))) {
      console.log("[APIConfig] 检测到 v1 配置，执行迁移");
      const migrated = migrateV1ToV2(parsed as UserAPIConfig);
      saveConfig(migrated);
      return migrated;
    }

    if (parsed.version === CONFIG_VERSION) {
      return parsed as UserAPIConfigV2;
    }

    console.log("[APIConfig] 配置版本不匹配，重置配置");
    return createEmptyConfig();
  } catch (error) {
    console.error("[APIConfig] 读取配置失败:", error);
    return createEmptyConfig();
  }
}

/** 保存配置到 localStorage + 异步同步服务端 */
function saveConfig(config: UserAPIConfigV2): void {
  if (typeof window === "undefined") return;

  try {
    config.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.error("[APIConfig] 保存配置失败:", error);
  }

  // 异步同步到服务端 SQLite
  syncConfigToServer(config);
}

/** 异步同步配置到服务端 */
function syncConfigToServer(config: UserAPIConfigV2): void {
  fetch("/api/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  }).catch(() => {
    // 服务端同步失败不影响本地功能
  });
}

/** 从服务端拉取配置（在后台执行，不阻塞渲染） */
function pullConfigFromServer(onUpdate: (config: UserAPIConfigV2) => void): void {
  fetch("/api/config")
    .then((res) => {
      if (!res.ok) throw new Error("API error");
      return res.json();
    })
    .then((serverConfig: UserAPIConfigV2) => {
      if (!serverConfig?.updatedAt) return;

      // 对比本地缓存时间
      const local = loadConfig();
      if (serverConfig.updatedAt > local.updatedAt) {
        // 服务端更新 → 写入 localStorage 并通知
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serverConfig));
        onUpdate(serverConfig);
      }
    })
    .catch(() => {
      // 静默降级
    });
}

/** 验证 LLM 配置 */
function validateLLMConfig(config: UserLLMConfig): string[] {
  const errors: string[] = [];
  if (!config.apiUrl?.trim()) errors.push("LLM API URL 不能为空");
  if (!config.apiKey?.trim()) errors.push("LLM API Key 不能为空");
  if (!config.model?.trim()) errors.push("LLM 模型名称不能为空");
  return errors;
}

/** 验证文生图配置 */
function validateImageConfig(config: UserImageConfig): string[] {
  const errors: string[] = [];
  if (!config.apiUrl?.trim()) errors.push("文生图 API URL 不能为空");
  if (!config.apiKey?.trim()) errors.push("文生图 API Key 不能为空");
  return errors;
}

/** 完整配置管理 Hook */
export function useAPIConfig() {
  const [config, setConfig] = useState<UserAPIConfigV2>(createEmptyConfig);
  const [isLoaded, setIsLoaded] = useState(false);

  // 初始加载：localStorage 即时 + 服务端异步拉取
  useEffect(() => {
    const loaded = loadConfig();
    setConfig(loaded);
    setIsLoaded(true);

    // 后台从服务端拉取最新配置
    pullConfigFromServer((serverConfig) => {
      setConfig(serverConfig);
    });
  }, []);

  // --- LLM CRUD ---

  const addLLM = useCallback((llm: Omit<UserLLMConfig, "id">) => {
    setConfig((prev) => {
      const id = generateId();
      const newConfig: UserAPIConfigV2 = {
        ...prev,
        llmConfigs: [...prev.llmConfigs, { ...llm, id }],
        activeLLMId: prev.activeLLMId ?? id, // 第一个自动设为默认
      };
      saveConfig(newConfig);
      return newConfig;
    });
  }, []);

  const updateLLMById = useCallback((id: string, updates: Partial<Omit<UserLLMConfig, "id">>) => {
    setConfig((prev) => {
      const newConfig: UserAPIConfigV2 = {
        ...prev,
        llmConfigs: prev.llmConfigs.map((c) =>
          c.id === id ? { ...c, ...updates } : c
        ),
      };
      saveConfig(newConfig);
      return newConfig;
    });
  }, []);

  const removeLLM = useCallback((id: string) => {
    setConfig((prev) => {
      const remaining = prev.llmConfigs.filter((c) => c.id !== id);
      const newConfig: UserAPIConfigV2 = {
        ...prev,
        llmConfigs: remaining,
        activeLLMId: prev.activeLLMId === id
          ? (remaining[0]?.id ?? null)
          : prev.activeLLMId,
      };
      saveConfig(newConfig);
      return newConfig;
    });
  }, []);

  const setActiveLLM = useCallback((id: string) => {
    setConfig((prev) => {
      const newConfig: UserAPIConfigV2 = { ...prev, activeLLMId: id };
      saveConfig(newConfig);
      return newConfig;
    });
  }, []);

  // --- Image CRUD ---

  const addImage = useCallback((img: Omit<UserImageConfig, "id">) => {
    setConfig((prev) => {
      const id = generateId();
      const newConfig: UserAPIConfigV2 = {
        ...prev,
        imageConfigs: [...prev.imageConfigs, { ...img, id }],
        activeImageId: prev.activeImageId ?? id,
      };
      saveConfig(newConfig);
      return newConfig;
    });
  }, []);

  const updateImageById = useCallback((id: string, updates: Partial<Omit<UserImageConfig, "id">>) => {
    setConfig((prev) => {
      const newConfig: UserAPIConfigV2 = {
        ...prev,
        imageConfigs: prev.imageConfigs.map((c) =>
          c.id === id ? { ...c, ...updates } : c
        ),
      };
      saveConfig(newConfig);
      return newConfig;
    });
  }, []);

  const removeImage = useCallback((id: string) => {
    setConfig((prev) => {
      const remaining = prev.imageConfigs.filter((c) => c.id !== id);
      const newConfig: UserAPIConfigV2 = {
        ...prev,
        imageConfigs: remaining,
        activeImageId: prev.activeImageId === id
          ? (remaining[0]?.id ?? null)
          : prev.activeImageId,
      };
      saveConfig(newConfig);
      return newConfig;
    });
  }, []);

  const setActiveImage = useCallback((id: string) => {
    setConfig((prev) => {
      const newConfig: UserAPIConfigV2 = { ...prev, activeImageId: id };
      saveConfig(newConfig);
      return newConfig;
    });
  }, []);

  // --- Helpers ---

  const getLLMById = useCallback((id: string) => {
    return config.llmConfigs.find((c) => c.id === id) ?? null;
  }, [config]);

  const getImageById = useCallback((id: string) => {
    return config.imageConfigs.find((c) => c.id === id) ?? null;
  }, [config]);

  // 清除所有配置
  const clearAll = useCallback(() => {
    const empty = createEmptyConfig();
    setConfig(empty);
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // 验证配置
  const validate = useCallback((): ConfigValidation => {
    const activeLLM = config.llmConfigs.find((c) => c.id === config.activeLLMId);
    const activeImage = config.imageConfigs.find((c) => c.id === config.activeImageId);

    const llmErrors = activeLLM ? validateLLMConfig(activeLLM) : [];
    const imageErrors = activeImage ? validateImageConfig(activeImage) : [];

    const hasLLM = !!activeLLM && llmErrors.length === 0;
    const hasImage = !!activeImage && imageErrors.length === 0;

    return {
      isValid: hasLLM,
      hasLLM,
      hasImage,
      errors: [...llmErrors, ...imageErrors],
    };
  }, [config]);

  return {
    config,
    isLoaded,
    addLLM,
    updateLLMById,
    removeLLM,
    setActiveLLM,
    addImage,
    updateImageById,
    removeImage,
    setActiveImage,
    getLLMById,
    getImageById,
    clearAll,
    validate,
  };
}

/** 快速检测配置状态 Hook（首页使用） */
export function useConfigCheck() {
  const [status, setStatus] = useState<{
    isLoaded: boolean;
    hasLLM: boolean;
    hasImage: boolean;
  }>({
    isLoaded: false,
    hasLLM: false,
    hasImage: false,
  });

  useEffect(() => {
    const config = loadConfig();
    const activeLLM = config.llmConfigs.find((c) => c.id === config.activeLLMId);
    const activeImage = config.imageConfigs.find((c) => c.id === config.activeImageId);

    const llmErrors = activeLLM ? validateLLMConfig(activeLLM) : [];
    const imageErrors = activeImage ? validateImageConfig(activeImage) : [];

    setStatus({
      isLoaded: true,
      hasLLM: !!activeLLM && llmErrors.length === 0,
      hasImage: !!activeImage && imageErrors.length === 0,
    });
  }, []);

  return status;
}

/** 获取所有已保存的配置列表（非 Hook） */
export function getStoredConfigs(): UserAPIConfigV2 {
  return loadConfig();
}

/** 直接获取请求配置（非 Hook，用于事件处理器） */
export function getStoredRequestConfigs(llmId?: string, imageId?: string): RequestConfigs {
  const config = loadConfig();
  const result: RequestConfigs = {};

  const targetLLMId = llmId ?? config.activeLLMId;
  const targetImageId = imageId ?? config.activeImageId;

  const llm = targetLLMId ? config.llmConfigs.find((c) => c.id === targetLLMId) : null;
  const image = targetImageId ? config.imageConfigs.find((c) => c.id === targetImageId) : null;

  if (llm) {
    result.llmConfig = {
      apiUrl: llm.apiUrl,
      apiKey: llm.apiKey,
      model: llm.model,
      provider: llm.protocolType,
    };
  }

  if (image) {
    result.imageConfig = {
      apiUrl: image.apiUrl,
      apiKey: image.apiKey,
      model: image.model,
      size: image.size,
      endpointType: image.endpointType,
    };
  }

  return result;
}
