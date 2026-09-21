export const CONFIG_CACHE_KEY = "comicpedia_api_config";
export const CONFIG_DRAFT_KEY = "comicpedia_api_config_tab_draft";
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Shared acknowledged cache + per-tab draft. Never let another tab erase unsaved edits. */
export function createConfigCache(shared: StorageLike, tab: StorageLike) {
  return {
    read: () => tab.getItem(CONFIG_DRAFT_KEY) ?? shared.getItem(CONFIG_CACHE_KEY),
    write: (serialized: string, dirty: boolean) => {
      serialized = redactPendingModelKeys(serialized);
      const old = shared.getItem(CONFIG_CACHE_KEY);
      let legacy = false;
      if (old) {
        try { legacy = !JSON.parse(old)?._sync; } catch { legacy = true; }
      }
      if (legacy && !shared.getItem(`${CONFIG_CACHE_KEY}_legacy_backup`)) {
        shared.setItem(`${CONFIG_CACHE_KEY}_legacy_backup`, redactPendingModelKeys(old!));
      }
      const backup = shared.getItem(`${CONFIG_CACHE_KEY}_legacy_backup`);
      if (backup) shared.setItem(`${CONFIG_CACHE_KEY}_legacy_backup`, redactPendingModelKeys(backup));
      if (dirty) {
        // Session storage survives reload and is not overwritten by a different tab.
        tab.setItem(CONFIG_DRAFT_KEY, serialized);
        shared.setItem(CONFIG_CACHE_KEY, serialized);
      } else {
        shared.setItem(CONFIG_CACHE_KEY, serialized);
        tab.removeItem(CONFIG_DRAFT_KEY);
      }
    },
  };
}

/** New credential inputs stay in memory only. A reload must never silently drop them. */
function redactPendingModelKeys(serialized: string): string {
  try {
    const config = JSON.parse(serialized);
    for (const role of ["llmConfigs", "vlmConfigs", "imageConfigs"]) {
      if (!Array.isArray(config?.[role])) continue;
      config[role] = config[role].map((model: Record<string, unknown>) =>
        typeof model?.apiKey === "string" && model.apiKey.trim()
          ? { ...model, apiKey: "", apiKeyInputRequired: true }
          : model);
    }
    // V1 cache is consumed in memory by migration before the next cache write.
    for (const role of ["llm", "image"]) {
      const model = config?.[role];
      if (model && typeof model.apiKey === "string" && model.apiKey.trim()) {
        config[role] = { ...model, apiKey: "", apiKeyInputRequired: true };
      }
    }
    return JSON.stringify(config);
  } catch { return serialized; }
}
