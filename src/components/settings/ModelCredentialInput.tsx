"use client";
import { useId } from "react";

export interface ModelCredentialFields {
  hasApiKey?: boolean;
  clearApiKey?: boolean;
  apiKeyInputRequired?: boolean;
}
interface Props extends ModelCredentialFields {
  value: string;
  onChange: (patch: { apiKey?: string } & ModelCredentialFields) => void;
}

export function ModelCredentialInput({ value, hasApiKey, clearApiKey, apiKeyInputRequired, onChange }: Props) {
  const id = useId();
  return <div className="space-y-2">
    <label htmlFor={id} className="text-sm text-muted-foreground">API Key</label>
    <input id={id} type="password" autoComplete="new-password" value={value}
      placeholder={hasApiKey ? "留空保留已保存密钥；输入新值替换" : "可选：输入服务要求的 API Key"}
      disabled={clearApiKey}
      onChange={event => onChange({ apiKey: event.target.value, clearApiKey: false, apiKeyInputRequired: false })}
      className="w-full rounded-lg border bg-background p-3 text-sm disabled:opacity-50" />
    <p className="text-xs text-muted-foreground">{hasApiKey ? "已保存密钥：留空保留，输入新值替换。" : "未保存密钥。本地无认证服务可以留空。"} 新输入仅在本页内存暂存，保存后清除输入。</p>
    {(hasApiKey || apiKeyInputRequired) && <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={!!clearApiKey}
        onChange={event => onChange({ clearApiKey: event.target.checked, apiKey: "", apiKeyInputRequired })} />
      清除已保存密钥（下次保存生效）
    </label>}
    {apiKeyInputRequired && <p role="alert" className="text-xs text-destructive">刷新前未保存的密钥不会缓存，请重新输入，或明确选择清除。</p>}
    {hasApiKey && <p className="text-xs text-muted-foreground">修改服务地址或协议时，必须重新输入密钥或清除原密钥，不能把旧凭据带到新服务。</p>}
  </div>;
}
