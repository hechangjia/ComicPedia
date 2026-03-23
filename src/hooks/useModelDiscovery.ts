import { useState, useCallback, useRef } from "react";

export interface ModelDiscoveryState {
  models: string[];
  loading: boolean;
  error: string;
  /** 连通状态: idle / success / error */
  status: "idle" | "success" | "error";
}

interface FetchModelsParams {
  apiUrl: string;
  apiKey?: string;
  protocolType?: "openai-compatible" | "anthropic";
}

/** 缓存 key: apiUrl+apiKey 的 hash → 模型列表 */
const modelCache = new Map<string, string[]>();

function cacheKey(params: FetchModelsParams): string {
  return `${params.apiUrl}|${params.apiKey || ""}|${params.protocolType || ""}`;
}

/**
 * 模型自动发现 Hook。
 * 调用 /api/models 代理端点获取可用模型列表，同时验证连通性。
 */
export function useModelDiscovery() {
  const [state, setState] = useState<ModelDiscoveryState>({
    models: [],
    loading: false,
    error: "",
    status: "idle",
  });
  const abortRef = useRef<AbortController | null>(null);

  const fetchModels = useCallback(async (params: FetchModelsParams) => {
    if (!params.apiUrl.trim()) {
      setState({ models: [], loading: false, error: "请先填写 API 地址", status: "error" });
      return [];
    }

    // 检查缓存
    const key = cacheKey(params);
    const cached = modelCache.get(key);
    if (cached) {
      setState({ models: cached, loading: false, error: "", status: "success" });
      return cached;
    }

    // 取消上一个请求
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((prev) => ({ ...prev, loading: true, error: "", status: "idle" }));

    try {
      const response = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        const errMsg = (data as { error?: string }).error || `连接失败 (${response.status})`;
        setState({ models: [], loading: false, error: errMsg, status: "error" });
        return [];
      }

      const data = await response.json();
      const models: string[] = Array.isArray(data.models) ? data.models : [];

      if (models.length === 0) {
        setState({ models: [], loading: false, error: "连接成功但未获取到模型列表", status: "success" });
        return [];
      }

      // 缓存结果
      modelCache.set(key, models);

      setState({ models, loading: false, error: "", status: "success" });
      return models;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return [];
      const errMsg = err instanceof Error ? err.message : "网络错误";
      setState({ models: [], loading: false, error: errMsg, status: "error" });
      return [];
    }
  }, []);

  const clearModels = useCallback(() => {
    setState({ models: [], loading: false, error: "", status: "idle" });
  }, []);

  return { ...state, fetchModels, clearModels };
}
