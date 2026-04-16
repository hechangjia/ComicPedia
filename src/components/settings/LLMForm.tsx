import { useState, useEffect } from "react";
import { APIProvider } from "@/lib/types";
import { LLM_PRESETS, type LLMPreset } from "@/lib/config/presets";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useModelDiscovery } from "@/hooks/useModelDiscovery";
import { RefreshCw } from "lucide-react";


export interface LLMFormFields {
  name: string;
  provider: APIProvider;
  apiUrl: string;
  apiKey: string;
  model: string;
  protocolType: "openai-compatible" | "anthropic";
}

interface LLMFormProps {
  fields: LLMFormFields;
  isEditing: boolean;
  onChange: (fields: Partial<LLMFormFields>) => void;
  onProviderChange: (provider: APIProvider) => void;
  onSave: () => void;
  onCancel: () => void;
  /** 覆盖预设列表（VLM 场景） */
  presets?: LLMPreset[];
  /** 视觉变体：切换主题色和标签文案 */
  variant?: "llm" | "vlm";
}

/** 检测是否为 Ollama URL */
function isOllamaUrl(url: string): boolean {
  return /localhost:11434|127\.0\.0\.1:11434/i.test(url);
}

const VARIANT_STYLES = {
  llm: {
    border: "border-primary/40 bg-primary/5",
    active: "border-primary bg-primary/10 ring-2 ring-primary",
    hover: "hover:border-primary/50",
    btn: "bg-primary text-primary-foreground",
    label: "LLM",
    placeholder: "如：DeepSeek 主力、Ollama 本地",
    modelPlaceholder: "gpt-4o-mini",
  },
  vlm: {
    border: "border-[#a99ad0]/40 bg-[#8b7eb5]/5",
    active: "border-[#8b7eb5] bg-[#8b7eb5]/10 ring-2 ring-[#8b7eb5]",
    hover: "hover:border-[#8b7eb5]/50",
    btn: "bg-[#8b7eb5] text-white",
    label: "VLM",
    placeholder: "如：GPT-4o Vision、Qwen-VL",
    modelPlaceholder: "gpt-4o",
  },
};

export function LLMForm({ fields, isEditing, onChange, onProviderChange, onSave, onCancel, presets, variant = "llm" }: LLMFormProps) {
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const isOllama = isOllamaUrl(fields.apiUrl);
  const items = presets || LLM_PRESETS;
  const s = VARIANT_STYLES[variant];

  // 模型自动发现
  const discovery = useModelDiscovery();
  const clearModels = discovery.clearModels;

  // Ollama 自动获取模型列表（保留原有行为）
  useEffect(() => {
    if (!isOllama) {
      const timer = setTimeout(() => {
        setOllamaModels([]);
        setLoadingModels(false);
      }, 0);
      return () => clearTimeout(timer);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoadingModels(true);
    }, 0);
    const base = fields.apiUrl.replace(/\/v1\/?$/, "").replace(/\/+$/, "");
    fetch(`${base}/api/tags`, { signal: controller.signal })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (controller.signal.aborted) return;
        const models = (data?.models || []).map((m: { name: string }) => m.name);
        setOllamaModels(models);
        if (models.length > 0 && !models.includes(fields.model)) {
          onChange({ model: models[0] });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setOllamaModels([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingModels(false);
        }
      });

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [fields.apiUrl, fields.model, isOllama, onChange]);

  // provider 切换时清除已发现的模型列表
  useEffect(() => {
    clearModels();
  }, [clearModels, fields.provider]);

  const handleFetchModels = async () => {
    const models = await discovery.fetchModels({
      apiUrl: fields.apiUrl,
      apiKey: fields.apiKey,
      protocolType: fields.protocolType,
    });
    // 如果当前 model 不在列表中，自动选择第一个
    if (models.length > 0 && !models.includes(fields.model)) {
      onChange({ model: models[0] });
    }
  };

  // 合并模型列表：discovery 优先，Ollama 其次
  const availableModels = isOllama ? ollamaModels : discovery.models;
  const hasModelList = availableModels.length > 0;

  return (
    <div className={`p-4 rounded-lg border border-dashed ${s.border} space-y-4`}>
      <h3 className="text-sm font-medium">
        {isEditing ? `编辑 ${s.label} 配置` : `添加新 ${s.label} 配置`}
      </h3>

      <div className="space-y-1">
        <label className="text-sm text-muted-foreground">配置名称</label>
        <input
          value={fields.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={s.placeholder}
          className="w-full rounded-lg border bg-background p-3 text-sm"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">提供商</label>
        <div className="grid grid-cols-3 gap-2">
          {items.map((preset) => (
            <button
              key={preset.id}
              onClick={() => onProviderChange(preset.id)}
              className={`p-2 rounded-lg border text-sm transition-all ${
                fields.provider === preset.id ? s.active : s.hover
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3">
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">API URL</label>
          <input
            value={fields.apiUrl}
            onChange={(e) => onChange({ apiUrl: e.target.value })}
            placeholder="https://api.example.com/v1"
            className="w-full rounded-lg border bg-background p-3 text-sm"
          />
        </div>
        {!isOllama && (
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">API Key</label>
            <PasswordInput
              value={fields.apiKey}
              onChange={(v) => onChange({ apiKey: v })}
            />
          </div>
        )}

        {/* 模型选择区域 */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-sm text-muted-foreground">模型名称</label>
            {!isOllama && fields.apiUrl.trim() && (
              <button
                onClick={handleFetchModels}
                disabled={discovery.loading}
                className="text-xs px-2 py-1 rounded border hover:bg-accent transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                {discovery.loading ? (
                  <>
                    <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    获取中...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3 h-3" />
                    获取模型列表
                  </>
                )}
              </button>
            )}
          </div>

          {/* 连通状态指示 */}
          {discovery.status !== "idle" && !isOllama && (
            <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded ${
              discovery.status === "success"
                ? "bg-success/10 text-success"
                : "bg-error/10 text-error"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                discovery.status === "success" ? "bg-success/50" : "bg-error/50"
              }`} />
              {discovery.status === "success"
                ? `连接成功${discovery.models.length > 0 ? `，${discovery.models.length} 个可用模型` : ""}`
                : discovery.error
              }
            </div>
          )}

          {/* 模型选择/输入 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              {hasModelList ? (
                <select
                  value={fields.model}
                  onChange={(e) => onChange({ model: e.target.value })}
                  className="w-full rounded-lg border bg-background p-3 text-sm"
                >
                  {availableModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={fields.model}
                  onChange={(e) => onChange({ model: e.target.value })}
                  placeholder={isOllama && loadingModels ? "获取模型列表..." : s.modelPlaceholder}
                  className="w-full rounded-lg border bg-background p-3 text-sm"
                />
              )}
            </div>
            <div>
              <select
                value={fields.protocolType}
                onChange={(e) => onChange({ protocolType: e.target.value as LLMFormFields["protocolType"] })}
                className="w-full rounded-lg border bg-background p-3 text-sm"
              >
                <option value="openai-compatible">OpenAI 兼容</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onSave}
          className={`flex-1 py-2 rounded-lg ${s.btn} font-medium hover:opacity-90 transition-opacity`}
        >
          {isEditing ? "更新配置" : "保存配置"}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border font-medium text-sm hover:bg-muted transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  );
}
