import { useState, useEffect } from "react";
import { APIProvider } from "@/lib/types";
import { LLM_PRESETS } from "@/lib/config/presets";
import { PasswordInput } from "@/components/ui/PasswordInput";

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
}

/** 检测是否为 Ollama URL */
function isOllamaUrl(url: string): boolean {
  return /localhost:11434|127\.0\.0\.1:11434/i.test(url);
}

export function LLMForm({ fields, isEditing, onChange, onProviderChange, onSave, onCancel }: LLMFormProps) {
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const isOllama = isOllamaUrl(fields.apiUrl);

  // 自动获取 Ollama 模型列表
  useEffect(() => {
    if (!isOllama) { setOllamaModels([]); return; }
    setLoadingModels(true);
    const base = fields.apiUrl.replace(/\/v1\/?$/, "").replace(/\/+$/, "");
    fetch(`${base}/api/tags`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        const models = (data?.models || []).map((m: { name: string }) => m.name);
        setOllamaModels(models);
        // 自动选中第一个模型（如果当前模型不在列表中）
        if (models.length > 0 && !models.includes(fields.model)) {
          onChange({ model: models[0] });
        }
      })
      .catch(() => setOllamaModels([]))
      .finally(() => setLoadingModels(false));
  }, [fields.apiUrl]);

  return (
    <div className="p-4 rounded-lg border border-dashed border-primary/40 bg-primary/5 space-y-4">
      <h3 className="text-sm font-medium">
        {isEditing ? "编辑 LLM 配置" : "添加新 LLM 配置"}
      </h3>

      {/* 配置名称 */}
      <div className="space-y-1">
        <label className="text-sm text-muted-foreground">配置名称</label>
        <input
          value={fields.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="如：DeepSeek 主力、Ollama 本地"
          className="w-full rounded-lg border bg-background p-3 text-sm"
        />
      </div>

      {/* 提供商选择 */}
      <div className="space-y-2">
        <label className="text-sm font-medium">提供商</label>
        <div className="grid grid-cols-3 gap-2">
          {LLM_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => onProviderChange(preset.id)}
              className={`p-2 rounded-lg border text-sm transition-all ${
                fields.provider === preset.id
                  ? "border-primary bg-primary/10 ring-2 ring-primary"
                  : "hover:border-primary/50"
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* 表单字段 */}
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
            <label className="text-sm text-muted-foreground">API Key{isOllama ? "（本地服务可留空）" : ""}</label>
            <PasswordInput
              value={fields.apiKey}
              onChange={(v) => onChange({ apiKey: v })}
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">模型名称</label>
            {isOllama && ollamaModels.length > 0 ? (
              <select
                value={fields.model}
                onChange={(e) => onChange({ model: e.target.value })}
                className="w-full rounded-lg border bg-background p-3 text-sm"
              >
                {ollamaModels.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            ) : (
              <input
                value={fields.model}
                onChange={(e) => onChange({ model: e.target.value })}
                placeholder={isOllama && loadingModels ? "获取模型列表..." : "gpt-4o-mini"}
                className="w-full rounded-lg border bg-background p-3 text-sm"
              />
            )}
          </div>
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">协议类型</label>
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

      <div className="flex gap-2">
        <button
          onClick={onSave}
          className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
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
