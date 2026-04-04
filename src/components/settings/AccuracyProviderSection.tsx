import { useMemo } from "react";
import type { AccuracyProviderConfig, AccuracyProviderSlots, AccuracySettings } from "@/lib/types";
import type { AccuracyProviderFormFields } from "@/components/settings/AccuracyProviderForm";
import { AccuracyProviderForm } from "@/components/settings/AccuracyProviderForm";
import type { TestResult } from "@/lib/api/connectionTest";

interface AccuracyProviderSectionProps {
  config: AccuracySettings;
  formFields: AccuracyProviderFormFields;
  editingId: string | null;
  showForm: boolean;
  testResults: Record<string, TestResult>;
  onChangeForm: (fields: Partial<AccuracyProviderFormFields>) => void;
  onStartNew: () => void;
  onStartEdit: (provider: AccuracyProviderConfig) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
  onTest: (providerId: string) => void;
  onAssignSlot: (slot: keyof AccuracyProviderSlots, providerId: string | null) => void;
  onWhitelistChange: (domains: string[]) => void;
}

const SLOT_LABELS: Record<keyof AccuracyProviderSlots, string> = {
  primarySearch: "主 Search",
  fallbackSearch: "备 Search",
  primaryFetch: "主 Fetch",
  fallbackFetch: "备 Fetch",
};

export function AccuracyProviderSection({
  config,
  formFields,
  editingId,
  showForm,
  testResults,
  onChangeForm,
  onStartNew,
  onStartEdit,
  onSave,
  onCancel,
  onDelete,
  onTest,
  onAssignSlot,
  onWhitelistChange,
}: AccuracyProviderSectionProps) {
  const providerById = useMemo(
    () => new Map(config.providers.map((provider) => [provider.id, provider])),
    [config.providers],
  );
  const searchProviders = config.providers.filter((provider) => provider.kind === "search");
  const fetchProviders = config.providers.filter((provider) => provider.kind === "fetch");
  const whitelistValue = config.whitelistDomains.join(", ");
  const editingProvider = editingId ? providerById.get(editingId) ?? null : null;

  return (
    <div className="p-6 rounded-xl border bg-card space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium">Accuracy Research Providers</h2>
          <p className="text-xs text-muted-foreground">
            仅供 science / wikipedia 的准确性研究 agent 使用。支持 Search / Fetch 分槽位配置。
          </p>
        </div>
        {!showForm && (
          <button
            onClick={onStartNew}
            className="px-3 py-1.5 text-sm rounded-lg bg-warning text-white hover:opacity-90 transition-opacity"
          >
            + 添加
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">{SLOT_LABELS.primarySearch}</label>
          <select
            value={config.slots.primarySearch ?? ""}
            onChange={(e) => onAssignSlot("primarySearch", e.target.value || null)}
            className="w-full rounded-lg border bg-background p-3 text-sm"
          >
            <option value="">未配置</option>
            {searchProviders.map((provider) => (
              <option key={provider.id} value={provider.id}>{provider.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">{SLOT_LABELS.fallbackSearch}</label>
          <select
            value={config.slots.fallbackSearch ?? ""}
            onChange={(e) => onAssignSlot("fallbackSearch", e.target.value || null)}
            className="w-full rounded-lg border bg-background p-3 text-sm"
          >
            <option value="">未配置</option>
            {searchProviders.map((provider) => (
              <option key={provider.id} value={provider.id}>{provider.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">{SLOT_LABELS.primaryFetch}</label>
          <select
            value={config.slots.primaryFetch ?? ""}
            onChange={(e) => onAssignSlot("primaryFetch", e.target.value || null)}
            className="w-full rounded-lg border bg-background p-3 text-sm"
          >
            <option value="">未配置</option>
            {fetchProviders.map((provider) => (
              <option key={provider.id} value={provider.id}>{provider.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">{SLOT_LABELS.fallbackFetch}</label>
          <select
            value={config.slots.fallbackFetch ?? ""}
            onChange={(e) => onAssignSlot("fallbackFetch", e.target.value || null)}
            className="w-full rounded-lg border bg-background p-3 text-sm"
          >
            <option value="">未配置</option>
            {fetchProviders.map((provider) => (
              <option key={provider.id} value={provider.id}>{provider.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Whitelist Domains</label>
        <input
          value={whitelistValue}
          onChange={(e) => onWhitelistChange(e.target.value.split(",").map((item) => item.trim()))}
          placeholder="如：wikipedia.org, britannica.com"
          className="w-full rounded-lg border bg-background p-3 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          仅在 Anchor 不足时使用这些域名做受限扩展检索；留空表示跳过 whitelist 层。
        </p>
      </div>

      {config.providers.length > 0 ? (
        <div className="space-y-2">
          {config.providers.map((provider) => {
            const test = testResults[provider.id];
            const slotBadges = (Object.entries(config.slots) as Array<[keyof AccuracyProviderSlots, string | null]>)
              .filter(([, value]) => value === provider.id)
              .map(([slot]) => SLOT_LABELS[slot]);

            return (
              <div
                key={provider.id}
                className="p-4 rounded-lg border transition-all hover:border-muted-foreground/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{provider.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        provider.enabled ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                      }`}>
                        {provider.enabled ? "启用" : "禁用"}
                      </span>
                      {slotBadges.map((badge) => (
                        <span
                          key={badge}
                          className="text-xs px-1.5 py-0.5 rounded-full bg-warning/10 text-warning font-medium"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {provider.vendor} · {provider.kind} · priority {provider.priority}
                    </div>
                    <div className="text-xs text-muted-foreground break-all">
                      {provider.baseUrl}
                    </div>
                    {(provider.maskedApiKey || provider.hasApiKey) && (
                      <div className="text-xs text-muted-foreground">
                        密钥：{provider.maskedApiKey || "已保存"}
                      </div>
                    )}
                    {provider.lastCheckedAt && (
                      <div className="text-xs text-muted-foreground">
                        最近检测：{provider.lastCheckedAt}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onTest(provider.id)}
                      disabled={test?.status === "testing"}
                      className="px-2 py-1 text-xs rounded border hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      {test?.status === "testing" ? "测试中..." : "测试"}
                    </button>
                    <button
                      onClick={() => onStartEdit(provider)}
                      className="px-2 py-1 text-xs rounded border hover:bg-muted transition-colors"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => onDelete(provider.id)}
                      className="px-2 py-1 text-xs rounded border border-error/20 text-error hover:bg-error/5 transition-colors"
                    >
                      删除
                    </button>
                  </div>
                </div>

                {(test && test.status !== "idle" && test.status !== "testing") || provider.lastError ? (
                  <div className={`mt-2 p-2 rounded text-xs ${
                    (test?.status || provider.healthStatus) === "success"
                      ? "bg-success/5 text-success border border-success/20"
                      : "bg-error/5 text-error border border-error/20"
                  }`}>
                    <div className="font-medium">
                      {test?.message || (provider.healthStatus === "success" ? "连接成功" : "连接失败")}
                    </div>
                    {(test?.detail || provider.lastError) && (
                      <div className="mt-0.5 opacity-80 break-all">{test?.detail || provider.lastError}</div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-6 text-sm text-muted-foreground">
          暂无 Accuracy Provider 配置，点击上方「+ 添加」按钮创建。
        </div>
      )}

      {showForm && (
        <AccuracyProviderForm
          fields={formFields}
          isEditing={Boolean(editingId)}
          hasStoredSecret={Boolean(editingProvider?.hasApiKey || editingProvider?.maskedApiKey || editingProvider?.apiKey)}
          onChange={onChangeForm}
          onSave={onSave}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}
