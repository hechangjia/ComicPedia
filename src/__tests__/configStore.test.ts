import { describe, expect, it, vi } from "vitest";
import { createConfigStore } from "@/lib/config/configStore";
import type { UserAPIConfigV2 } from "@/lib/types";
import { createEmptyAccuracyConfig } from "@/lib/accuracy/providerConfig";

const empty = (): UserAPIConfigV2 => ({ version: 2, llmConfigs: [], imageConfigs: [], vlmConfigs: [], activeLLMId: null, activeImageId: null, activeVLMId: null, accuracyConfig: createEmptyAccuracyConfig(), updatedAt: "2099-01-01" });
const model = (id: string) => ({ id, name: id, provider: "custom" as const, apiUrl: "http://localhost:8317", apiKey: "", model: id, protocolType: "openai-compatible" as const });
const response = (config = empty(), revision = '"r1"') => new Response(JSON.stringify(config), { headers: { ETag: revision } });
const ack = (revision: string) => new Response(JSON.stringify({ success: true }), { headers: { ETag: revision } });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function setup(request: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>, initial = empty(), meta?: { revision: string | null; dirty: boolean }) {
  const persist = vi.fn();
  const store = createConfigStore({ initial, hasLocalConfig: !!initial.llmConfigs.length, meta, request, persist });
  return { store, persist };
}

describe("authoritative configuration store", () => {
  it("loads server state even when the empty local clock is in the future", async () => {
    const remote = { ...empty(), llmConfigs: [model("server")] };
    const { store } = setup(vi.fn().mockResolvedValue(response(remote)));
    await store.load();
    expect(store.getSnapshot().config.llmConfigs[0].id).toBe("server");
    expect(store.getSnapshot().syncStatus).toBe("saved");
  });
  it("retains every same-tick edit, serializes PUTs and chains server revisions", async () => {
    const firstSave = deferred<Response>();
    const request = vi.fn().mockResolvedValueOnce(response()).mockReturnValueOnce(firstSave.promise).mockResolvedValueOnce(ack('"r3"'));
    const { store } = setup(request);
    await store.load();
    store.edit(c => ({ ...c, llmConfigs: [...c.llmConfigs, model("a")] }));
    store.edit(c => ({ ...c, llmConfigs: [...c.llmConfigs, model("b")] }));
    expect(store.getSnapshot().config.llmConfigs.map(m => m.id)).toEqual(["a", "b"]);
    expect(request).toHaveBeenCalledTimes(2);
    firstSave.resolve(ack('"r2"'));
    await settle();
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[2][1].headers["If-Match"]).toBe('"r2"');
    expect(JSON.parse(request.mock.calls[2][1].body).llmConfigs).toHaveLength(2);
    expect(store.getSnapshot().syncStatus).toBe("saved");
  });
  it.each([401, 412, 500])("keeps draft on HTTP %s and never publishes secret upstream errors", async (status) => {
    const request = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(new Response("provider-key-secret", { status })).mockResolvedValueOnce(ack('"r2"'));
    const { store, persist } = setup(request);
    await store.load();
    store.edit(c => ({ ...c, llmConfigs: [model("draft")] }));
    await settle();
    expect(store.getSnapshot().syncStatus).toBe(status === 412 ? "conflict" : "error");
    expect(store.getSnapshot().syncError).not.toContain("provider-key-secret");
    expect(persist.mock.calls.at(-1)?.[1].dirty).toBe(true);
    await store.retry();
    expect(store.getSnapshot().syncStatus).toBe(status === 412 ? "conflict" : "saved");
  });
  it("does not replace edits made while initial GET is outstanding", async () => {
    const load = deferred<Response>();
    const request = vi.fn().mockReturnValueOnce(load.promise).mockResolvedValueOnce(ack('"r2"'));
    const { store } = setup(request);
    const loading = store.load();
    store.edit(c => ({ ...c, llmConfigs: [model("new")] }));
    load.resolve(response());
    await loading; await settle();
    expect(store.getSnapshot().config.llmConfigs[0].id).toBe("new");
  });
  it("rejects missing acknowledgement or revision even for HTTP 200", async () => {
    const request = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(new Response("{}"));
    const { store } = setup(request); await store.load(); store.edit(c => c); await settle();
    expect(store.getSnapshot().syncStatus).toBe("error");
  });
  it("does not overwrite a remote config with a legacy local cache", async () => {
    const request = vi.fn().mockImplementation(async () => response());
    const { store } = setup(request, { ...empty(), llmConfigs: [model("legacy")] });
    await store.load();
    expect(store.getSnapshot().syncStatus).toBe("conflict");
    expect(request).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().config.llmConfigs[0].id).toBe("legacy");
  });
  it("preserves stale dirty drafts across reloads and allows explicit server reload", async () => {
    const request = vi.fn().mockImplementation(async () => response());
    const { store } = setup(request, { ...empty(), llmConfigs: [model("draft")] }, { revision: '"old"', dirty: true });
    await store.load();
    expect(store.getSnapshot().syncStatus).toBe("conflict");
    await store.reloadFromServer();
    expect(store.getSnapshot().config.llmConfigs).toEqual([]);
    expect(store.getSnapshot().syncStatus).toBe("saved");
  });
  it("migrates legacy local config only into an empty server", async () => {
    const request = vi.fn().mockResolvedValueOnce(response(empty(), '"empty"')).mockResolvedValueOnce(ack('"r1"'));
    const { store } = setup(request, { ...empty(), llmConfigs: [model("legacy")] });
    await store.load(); await settle();
    expect(request).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().syncStatus).toBe("saved");
  });
  it("reports local persistence failure separately from server acknowledgement", async () => {
    const request = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(ack('"r2"'));
    const { store, persist } = setup(request); await store.load(); persist.mockImplementation(() => { throw new Error("quota"); });
    store.edit(c => c); await settle();
    expect(store.getSnapshot().syncStatus).toBe("saved");
    expect(store.getSnapshot().storageError).toBeTruthy();
  });
  it("does not erase edits made during an explicit server reload", async () => {
    const pending = deferred<Response>();
    const request = vi.fn().mockResolvedValueOnce(response()).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(ack('"r2"'));
    const { store } = setup(request); await store.load();
    const reload = store.reloadFromServer();
    store.edit(c => ({ ...c, llmConfigs: [model("during-reload")] }));
    expect(request).toHaveBeenCalledTimes(2);
    pending.resolve(response()); await reload; await settle();
    expect(store.getSnapshot().config.llmConfigs[0].id).toBe("during-reload");
    expect(store.getSnapshot().syncStatus).toBe("saved");
  });
  it("does not overwrite a server reset using a draft based on an old revision", async () => {
    const request = vi.fn().mockResolvedValueOnce(response(empty(), '"empty"'));
    const { store } = setup(request, { ...empty(), llmConfigs: [model("old")] }, { revision: '"previous"', dirty: true });
    await store.load();
    expect(store.getSnapshot().syncStatus).toBe("conflict");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("reconnects after a GET failure without losing an offline edit", async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(response(empty(), '"empty"')).mockResolvedValueOnce(ack('"r2"'));
    const { store } = setup(request); await store.load();
    store.edit(c => ({ ...c, llmConfigs: [model("offline")] }));
    await store.retry(); await settle();
    expect(store.getSnapshot().config.llmConfigs[0].id).toBe("offline");
    expect(store.getSnapshot().syncStatus).toBe("saved");
  });  it("does not install malformed server model entries into the UI store", async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ...empty(), llmConfigs: [null] }), { headers: { ETag: '"r1"' } }));
    const { store } = setup(request); await store.load();
    expect(store.getSnapshot().config.llmConfigs).toEqual([]);
    expect(store.getSnapshot().syncStatus).toBe("error");
  });  it("does not dirty the store or send a save when an atomic import planner rejects the data", async () => {
    const request = vi.fn().mockResolvedValueOnce(response());
    const { store, persist } = setup(request); await store.load();
    const before = store.getSnapshot(); const calls = persist.mock.calls.length;
    expect(() => store.edit(() => { throw new Error("Invalid import"); })).toThrow();
    expect(store.getSnapshot()).toBe(before);
    await store.retry();
    expect(request).toHaveBeenCalledTimes(1); expect(persist).toHaveBeenCalledTimes(calls);
  });

  it("removes acknowledged replacement inputs from memory and persistence", async () => {
    const request = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(ack('"r2"'));
    const { store, persist } = setup(request);
    await store.load();
    store.edit(c => ({ ...c, llmConfigs: [{ ...model("a"), apiKey: "new-private-secret" }] }));
    await settle();
    expect(JSON.parse(request.mock.calls[1][1].body).llmConfigs[0].apiKey).toBe("new-private-secret");
    expect(store.getSnapshot().config.llmConfigs[0]).toMatchObject({ apiKey: "", hasApiKey: true });
    expect(JSON.stringify(persist.mock.calls.at(-1))).not.toContain("new-private-secret");
  });
  it("does not submit a reloaded draft whose replacement input was omitted from storage", async () => {
    const local = { ...empty(), llmConfigs: [{ ...model("a"), apiKeyInputRequired: true }] };
    const request = vi.fn().mockResolvedValueOnce(response(empty(), '"r1"'));
    const { store } = setup(request, local, { revision: '"r1"', dirty: true });
    await store.load(); await store.retry();
    expect(request).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().syncStatus).toBe("error");
    expect(store.getSnapshot().syncError).toContain("重新输入");
  });

});
