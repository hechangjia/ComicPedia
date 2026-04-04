import { AccuracyProviderKind, AccuracyProviderVendor } from "@/lib/types";
import { PasswordInput } from "@/components/ui/PasswordInput";

export interface AccuracyProviderFormFields {
  name: string;
  kind: AccuracyProviderKind;
  vendor: AccuracyProviderVendor;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  priority: number;
}

interface AccuracyProviderFormProps {
  fields: AccuracyProviderFormFields;
  isEditing: boolean;
  hasStoredSecret: boolean;
  onChange: (fields: Partial<AccuracyProviderFormFields>) => void;
  onSave: () => void;
  onCancel: () => void;
}

const DEFAULT_BASE_URLS: Record<AccuracyProviderVendor, string> = {
  firecrawl: "https://api.firecrawl.dev",
  tavily: "https://api.tavily.com",
  custom: "",
};

export function AccuracyProviderForm({
  fields,
  isEditing,
  hasStoredSecret,
  onChange,
  onSave,
  onCancel,
}: AccuracyProviderFormProps) {
  return (
    <div className="p-4 rounded-lg border border-dashed border-warning/40 bg-warning/5 space-y-4">
      <h3 className="text-sm font-medium">
        {isEditing ? "编辑 Accuracy Provider" : "添加 Accuracy Provider"}
      </h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">名称</label>
          <input
            value={fields.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="如：Firecrawl 主检索"
            className="w-full rounded-lg border bg-background p-3 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">优先级</label>
          <input
            type="number"
            value={fields.priority}
            onChange={(e) => onChange({ priority: Number.parseInt(e.target.value || "0", 10) || 0 })}
            className="w-full rounded-lg border bg-background p-3 text-sm"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">类型</label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: "search", label: "Search" },
              { value: "fetch", label: "Fetch" },
            ] as const).map((option) => (
              <button
                key={option.value}
                onClick={() => onChange({ kind: option.value })}
                className={`p-2 rounded-lg border text-sm transition-all ${
                  fields.kind === option.value
                    ? "border-warning bg-warning/10 ring-2 ring-warning"
                    : "hover:border-warning/50"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Vendor</label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: "firecrawl", label: "Firecrawl" },
              { value: "tavily", label: "Tavily" },
              { value: "custom", label: "Custom" },
            ] as const).map((option) => (
              <button
                key={option.value}
                onClick={() => onChange({
                  vendor: option.value,
                  baseUrl: fields.baseUrl.trim() ? fields.baseUrl : DEFAULT_BASE_URLS[option.value],
                })}
                className={`p-2 rounded-lg border text-sm transition-all ${
                  fields.vendor === option.value
                    ? "border-warning bg-warning/10 ring-2 ring-warning"
                    : "hover:border-warning/50"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm text-muted-foreground">Base URL</label>
        <input
          value={fields.baseUrl}
          onChange={(e) => onChange({ baseUrl: e.target.value })}
          placeholder={DEFAULT_BASE_URLS[fields.vendor] || "https://api.example.com"}
          className="w-full rounded-lg border bg-background p-3 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm text-muted-foreground">API Key</label>
        <PasswordInput
          value={fields.apiKey}
          onChange={(value) => onChange({ apiKey: value })}
        />
        {isEditing && hasStoredSecret && !fields.apiKey && (
          <p className="text-xs text-muted-foreground">
            已保存密钥，留空表示保持不变。
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={fields.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
        />
        启用该 provider
      </label>

      <div className="flex items-center gap-2">
        <button
          onClick={onSave}
          className="px-4 py-2 text-sm rounded-lg bg-warning text-white hover:opacity-90 transition-opacity"
        >
          {isEditing ? "保存修改" : "添加 Provider"}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm rounded-lg border hover:bg-muted transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  );
}
