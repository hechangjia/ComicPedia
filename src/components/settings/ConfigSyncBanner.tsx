"use client";

import type { ConfigSyncStatus } from "@/lib/config/configStore";
interface Props {
  status: ConfigSyncStatus;
  error?: string;
  storageError?: string;
  onRetry: () => void;
  onReload: () => void;
}
const labels: Record<ConfigSyncStatus, string> = {
  loading: "正在读取服务器配置…",
  saving: "正在保存到服务器…",
  saved: "已保存到服务器",
  error: "尚未保存到服务器",
  conflict: "配置版本冲突，本地草稿未覆盖服务器",
};
export function ConfigSyncBanner({ status, error, storageError, onRetry, onReload }: Props) {
  const needsAttention = status === "error" || status === "conflict";
  return (
    <section aria-label="配置同步状态" className={`rounded-xl border p-4 text-sm space-y-2 ${needsAttention ? "border-warning/40 bg-warning/5" : "bg-card"}`}>
      <p role="status" aria-live="polite" className="font-medium">{labels[status]}</p>
      {error && <p className="text-muted-foreground">{error}</p>}
      {storageError && <p role="alert">{storageError}</p>}
      {needsAttention && (
        <div className="flex flex-wrap gap-2">
          {status === "error" && <button type="button" onClick={onRetry} className="min-h-[44px] rounded-lg border px-3 hover:bg-accent">重试保存 / 连接</button>}
          <button type="button" onClick={onReload} className="min-h-[44px] rounded-lg border px-3 hover:bg-accent">读取服务器版本</button>
        </div>
      )}
    </section>
  );
}
