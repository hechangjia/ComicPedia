import { acknowledgeModelCredentials, hasMissingCredentialInput } from "./modelCredentials";
import { validateConfigPayload } from "./configValidation";
import type { UserAPIConfigV2 } from "@/lib/types";

export interface ConfigDraftMeta { revision: string | null; dirty: boolean }
export type ConfigSyncStatus = "loading" | "saving" | "saved" | "error" | "conflict";
export interface ConfigSnapshot {
  config: UserAPIConfigV2;
  isLoaded: boolean;
  syncStatus: ConfigSyncStatus;
  syncError?: string;
  storageError?: string;
}
interface Dependencies {
  initial: UserAPIConfigV2;
  hasLocalConfig: boolean;
  meta?: ConfigDraftMeta;
  request: (url: string, init?: RequestInit) => Promise<Response>;
  persist: (config: UserAPIConfigV2, meta: ConfigDraftMeta) => void;
}

/** Owns the editable draft. Only a verified server acknowledgement marks it saved. */
export function createConfigStore(deps: Dependencies) {
  let snapshot: ConfigSnapshot = { config: deps.initial, isLoaded: false, syncStatus: "loading" };
  let revision = deps.meta?.revision ?? null;
  let dirty = deps.meta?.dirty ?? deps.hasLocalConfig;
  let editSequence = 0;
  let initialized = false;
  let loading: Promise<void> | undefined;
  let saving: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  function publish(patch: Partial<ConfigSnapshot>) {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach(listener => listener());
  }
  function persist() {
    try {
      deps.persist(snapshot.config, { revision, dirty });
      if (snapshot.storageError) publish({ storageError: undefined });
    } catch {
      publish({ storageError: "本地草稿缓存写入失败；请勿在服务器保存成功前关闭页面。" });
    }
  }
  const conflict = () => publish({ syncStatus: "conflict", syncError: "服务器配置已变化。本地草稿仍保留；读取服务器版本前请导出需要的草稿，并另行妥善保管密钥与工作流；默认配置导出不包含这些敏感内容。" });
  function flush(): Promise<void> {
    if (saving) return saving;
    if (!initialized || !dirty || revision === null || snapshot.syncStatus === "conflict") return Promise.resolve();
    const run = async () => {
      while (dirty) {
        const sequence = editSequence;
        const config = snapshot.config;
        if (hasMissingCredentialInput(config)) {
          publish({ syncStatus: "error", syncError: "未保存的密钥不会缓存。请编辑相关模型重新输入密钥，或明确清除后再保存。" });
          return;
        }
        publish({ syncStatus: "saving", syncError: undefined });
        try {
          const res = await deps.request("/api/config", {
            method: "PUT", headers: { "Content-Type": "application/json", "If-Match": revision! }, body: JSON.stringify(config),
          });
          if (res.status === 412) { conflict(); return; }
          if (!res.ok) {
            const error = await res.json().catch(() => null);
            if (error?.code === "MODEL_CREDENTIAL_ACTION_REQUIRED") {
              publish({ syncStatus: "error", syncError: "密钥操作需要确认：修改服务地址或协议后，请编辑该模型重新输入密钥，或明确清除已保存密钥。" });
              return;
            }
            throw new Error("Save failed");
          }
          const nextRevision = res.headers.get("etag");
          const body = await res.json();
          if (!nextRevision || body?.success !== true) throw new Error("Missing save acknowledgement");
          revision = nextRevision;
          publish({ config: acknowledgeModelCredentials(snapshot.config, config) });
          dirty = sequence !== editSequence;
          persist();
          if (!dirty) publish({ syncStatus: "saved", syncError: undefined });
        } catch {
          publish({ syncStatus: "error", syncError: "尚未保存到服务器，本地草稿已保留。请检查连接或授权后重试。" });
          return;
        }
      }
    };
    saving = run().finally(() => { saving = undefined; });
    return saving;
  }
  function load(discardDraft = false): Promise<void> {
    if (loading) return loading;
    if (discardDraft && saving) return Promise.resolve();
    initialized = false;
    const initialSequence = editSequence;
    const baseConfig = snapshot.config;
    publish({ isLoaded: true, syncStatus: "loading", syncError: undefined });
    const run = async () => {
      try {
        const res = await deps.request("/api/config");
        if (!res.ok) throw new Error("Load failed");
        const server = await res.json() as UserAPIConfigV2;
        const remoteRevision = res.headers.get("etag");
        if (validateConfigPayload(server) !== null || !remoteRevision) throw new Error("Invalid server config");
        initialized = true;
        // Reload cannot discard an edit made after the user requested it.
        if ((!dirty || discardDraft) && initialSequence === editSequence) {
          revision = remoteRevision;
          dirty = false;
          publish({ config: server, syncStatus: "saved" });
          persist();
          return;
        }
        const unchangedBase = !deps.hasLocalConfig && !deps.meta && sameContent(baseConfig, server);
        if (revision !== remoteRevision && !(remoteRevision === '"empty"' && revision === null) && !unchangedBase) {
          conflict(); return;
        }
        revision = remoteRevision;
        persist();
        publish({ syncStatus: "saving" });
        await flush();
      } catch {
        publish({ syncStatus: "error", syncError: "读取服务器配置失败；当前仅显示本地草稿。请检查连接或授权后重试。" });
      }
    };
    loading = run().finally(() => { loading = undefined; });
    return loading;
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load: () => load(),
    edit: (updater: (config: UserAPIConfigV2) => UserAPIConfigV2) => {
      const next = updater(snapshot.config);
      editSequence++;
      dirty = true;
      publish({ config: { ...next, updatedAt: new Date().toISOString() }, isLoaded: true });
      persist();
      if (!initialized) { void load(); return; }
      void flush();
    },
    retry: () => initialized && revision !== null ? flush() : load(),
    refresh: () => saving ? saving.then(() => load()) : load(),
    reloadFromServer: () => load(true),
  };
}

function sameContent(a: UserAPIConfigV2, b: UserAPIConfigV2): boolean {
  const { updatedAt: _a, ...left } = a;
  const { updatedAt: _b, ...right } = b;
  return JSON.stringify(left) === JSON.stringify(right);
}
