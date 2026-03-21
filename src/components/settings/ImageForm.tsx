import { APIProvider, ImageEndpointType } from "@/lib/types";
import { IMAGE_PRESETS } from "@/lib/config/presets";
import { PasswordInput } from "@/components/ui/PasswordInput";

export interface ImageFormFields {
  name: string;
  provider: APIProvider;
  apiUrl: string;
  apiKey: string;
  model: string;
  size: string;
  endpointType: ImageEndpointType;
}

interface ImageFormProps {
  fields: ImageFormFields;
  isEditing: boolean;
  onChange: (fields: Partial<ImageFormFields>) => void;
  onProviderChange: (provider: APIProvider) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function ImageForm({ fields, isEditing, onChange, onProviderChange, onSave, onCancel }: ImageFormProps) {
  return (
    <div className="p-4 rounded-lg border border-dashed border-primary/40 bg-primary/5 space-y-4">
      <h3 className="text-sm font-medium">
        {isEditing ? "编辑文生图配置" : "添加新文生图配置"}
      </h3>

      {/* 配置名称 */}
      <div className="space-y-1">
        <label className="text-sm text-muted-foreground">配置名称</label>
        <input
          value={fields.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="如：DALL-E 3、Gemini 文生图"
          className="w-full rounded-lg border bg-background p-3 text-sm"
        />
      </div>

      {/* 提供商选择 */}
      <div className="space-y-2">
        <label className="text-sm font-medium">提供商</label>
        <div className="grid grid-cols-3 gap-2">
          {IMAGE_PRESETS.map((preset) => (
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
            placeholder="https://api.example.com/v1/images/generations"
            className="w-full rounded-lg border bg-background p-3 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">API Key</label>
          <PasswordInput
            value={fields.apiKey}
            onChange={(v) => onChange({ apiKey: v })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">模型名称</label>
            <input
              value={fields.model}
              onChange={(e) => onChange({ model: e.target.value })}
              placeholder="dall-e-3"
              className="w-full rounded-lg border bg-background p-3 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">图片尺寸</label>
            <input
              value={fields.size}
              onChange={(e) => onChange({ size: e.target.value })}
              placeholder="1024x1024"
              className="w-full rounded-lg border bg-background p-3 text-sm"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">API 端点类型</label>
          <select
            value={fields.endpointType}
            onChange={(e) => onChange({ endpointType: e.target.value as ImageEndpointType })}
            className="w-full rounded-lg border bg-background p-3 text-sm"
          >
            <option value="auto">自动检测（根据 URL 推断）</option>
            <option value="chat">Chat Completions（Gemini/通用 LLM 文生图）</option>
            <option value="images">Images API（OpenAI DALL-E 等）</option>
          </select>
          <p className="text-xs text-muted-foreground">
            使用 Gemini 或通过 chat/completions 端点生成图片时，请选择「Chat Completions」。
          </p>
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
