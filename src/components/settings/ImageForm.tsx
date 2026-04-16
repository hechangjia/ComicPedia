import { APIProvider, ImageEndpointType } from "@/lib/types";
import { IMAGE_PRESETS } from "@/lib/config/presets";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useModelDiscovery } from "@/hooks/useModelDiscovery";
import { useEffect } from "react";
import { RefreshCw } from "lucide-react";


export interface ImageFormFields {
  name: string;
  provider: APIProvider;
  apiUrl: string;
  apiKey: string;
  model: string;
  size: string;
  endpointType: ImageEndpointType;
  comfyuiWorkflow?: string;
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
  const discovery = useModelDiscovery();
  const clearModels = discovery.clearModels;
  const isComfyUI = fields.endpointType === "comfyui";

  // provider 切换时清除已发现的模型列表
  useEffect(() => {
    clearModels();
  }, [clearModels, fields.provider]);

  const handleFetchModels = async () => {
    const models = await discovery.fetchModels({
      apiUrl: fields.apiUrl,
      apiKey: fields.apiKey,
      protocolType: "openai-compatible",
    });
    if (models.length > 0 && !models.includes(fields.model)) {
      onChange({ model: models[0] });
    }
  };

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

        {/* 模型 + 尺寸 */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-sm text-muted-foreground">模型名称</label>
            {!isComfyUI && fields.apiUrl.trim() && (
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
          {discovery.status !== "idle" && !isComfyUI && (
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              {discovery.models.length > 0 ? (
                <select
                  value={fields.model}
                  onChange={(e) => onChange({ model: e.target.value })}
                  className="w-full rounded-lg border bg-background p-3 text-sm"
                >
                  {discovery.models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={fields.model}
                  onChange={(e) => onChange({ model: e.target.value })}
                  placeholder="dall-e-3"
                  className="w-full rounded-lg border bg-background p-3 text-sm"
                />
              )}
            </div>
            <div>
              <input
                value={fields.size}
                onChange={(e) => onChange({ size: e.target.value })}
                placeholder="1024x1024"
                className="w-full rounded-lg border bg-background p-3 text-sm"
              />
            </div>
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
            <option value="comfyui">ComfyUI（本地 Workflow）</option>
          </select>
          <p className="text-xs text-muted-foreground">
            {fields.endpointType === "comfyui"
              ? "API URL 填 ComfyUI 地址（如 http://localhost:8188），下方粘贴 Workflow JSON。"
              : "使用 Gemini 或通过 chat/completions 端点生成图片时，请选择「Chat Completions」。"}
          </p>
        </div>

        {/* ComfyUI Workflow JSON */}
        {fields.endpointType === "comfyui" && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-sm text-muted-foreground">Workflow JSON（API 格式）</label>
              <label className="px-2 py-1 text-xs border rounded-lg hover:bg-muted transition-colors cursor-pointer">
                导入 JSON 文件
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const text = ev.target?.result as string;
                      try {
                        JSON.parse(text); // validate
                        onChange({ comfyuiWorkflow: text });
                      } catch {
                        alert("无效的 JSON 文件");
                      }
                    };
                    reader.readAsText(file);
                    e.target.value = ""; // reset for re-import
                  }}
                />
              </label>
            </div>
            <textarea
              value={fields.comfyuiWorkflow || ""}
              onChange={(e) => onChange({ comfyuiWorkflow: e.target.value })}
              placeholder='粘贴或导入从 ComfyUI "Save (API Format)" 导出的 JSON...'
              className="w-full min-h-[160px] rounded-lg border bg-background p-3 text-xs font-mono resize-y"
            />
            <p className="text-xs text-muted-foreground">
              系统会自动识别 CLIPTextEncode 节点注入 prompt，KSampler 节点注入 seed，EmptyLatentImage 节点注入尺寸。
            </p>
          </div>
        )}
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
