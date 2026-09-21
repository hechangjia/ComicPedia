import { describe, expect, it } from "vitest";
import { createConfigCache, CONFIG_CACHE_KEY, CONFIG_DRAFT_KEY } from "@/lib/config/configCache";
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
describe("per-tab configuration draft cache", () => {
  it("keeps a dirty draft across reload even when another tab acknowledges a different configuration", () => {
    const shared = storage(); const tabA = storage(); const tabB = storage();
    const a = createConfigCache(shared, tabA); const b = createConfigCache(shared, tabB);
    a.write('{"name":"draft"}', true);
    b.write('{"name":"server"}', false);
    expect(createConfigCache(shared, tabA).read()).toContain('"draft"');
    expect(createConfigCache(shared, tabB).read()).toContain('"server"');
  });
  it("only removes a tab draft after the acknowledged configuration is cached", () => {
    const shared = storage(); const tab = storage(); const cache = createConfigCache(shared, tab);
    cache.write("draft", true);
    shared.setItem = () => { throw new Error("quota"); };
    expect(() => cache.write("saved", false)).toThrow();
    expect(tab.getItem(CONFIG_DRAFT_KEY)).toBe("draft");
  });
  it("preserves legacy or malformed local cache before replacing it", () => {
    const shared = storage(); const tab = storage();
    shared.setItem(CONFIG_CACHE_KEY, "unparsed-legacy-data");
    const cache = createConfigCache(shared, tab);
    cache.write('{"_sync":{"dirty":false}}', false);
    expect(shared.getItem(`${CONFIG_CACHE_KEY}_legacy_backup`)).toBe("unparsed-legacy-data");
  });
  it("never writes replacement keys to browser storage and marks reloads as requiring input", () => {
    const shared = storage(); const tab = storage(); const cache = createConfigCache(shared, tab);
    cache.write(JSON.stringify({ version: 2, llmConfigs: [{ id: "a", apiKey: "new-private-secret" }], _sync: { dirty: true } }), true);
    expect(shared.getItem(CONFIG_CACHE_KEY)).not.toContain("new-private-secret");
    expect(tab.getItem(CONFIG_DRAFT_KEY)).not.toContain("new-private-secret");
    expect(JSON.parse(cache.read()!).llmConfigs[0]).toMatchObject({ apiKey: "", apiKeyInputRequired: true });
  });

  it("redacts keys in parseable legacy backups when replacing the cache", () => {
    const shared = storage(); const tab = storage();
    shared.setItem(CONFIG_CACHE_KEY, JSON.stringify({ version: 2, llmConfigs: [{ id: "old", apiKey: "legacy-secret" }] }));
    createConfigCache(shared, tab).write('{"_sync":{"dirty":false}}', false);
    expect(shared.getItem(`${CONFIG_CACHE_KEY}_legacy_backup`)).not.toContain("legacy-secret");
  });

});
