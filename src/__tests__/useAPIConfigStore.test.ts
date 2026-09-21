import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyAccuracyConfig } from "@/lib/accuracy/providerConfig";
vi.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
  useEffect: (callback: () => void) => callback(),
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
}));
function storage() {
  const map = new Map<string, string>();
  return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, v: string) => { map.set(key, v); }, removeItem: (key: string) => { map.delete(key); } };
}
afterEach(() => vi.unstubAllGlobals());
describe("config hook integration", () => {
  it("accumulates multiple imports using one captured CRUD callback and exports the current draft", async () => {
    vi.resetModules();
    vi.stubGlobal("window", {}); vi.stubGlobal("localStorage", storage()); vi.stubGlobal("sessionStorage", storage());
    const empty = { version: 2, llmConfigs: [], imageConfigs: [], vlmConfigs: [], accuracyConfig: createEmptyAccuracyConfig(), activeLLMId: null, activeImageId: null, activeVLMId: null, updatedAt: "" };
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => init?.method === "PUT"
      ? new Response(JSON.stringify({ success: true }), { headers: { ETag: '"r2"' } })
      : new Response(JSON.stringify(empty), { headers: { ETag: '"empty"' } })));
    const { useAPIConfig, getStoredConfigs, getStoredRequestConfigs } = await import("@/hooks/useAPIConfig");
    const api = useAPIConfig();
    const model = { name: "first", apiUrl: "http://localhost:8317", apiKey: "stored-secret", model: "first", provider: "custom" as const, protocolType: "openai-compatible" as const };
    api.addLLM(model);
    api.addLLM({ ...model, name: "second", model: "second" });
    expect(getStoredConfigs().llmConfigs.map(c => c.name)).toEqual(["first", "second"]);
    const second = getStoredConfigs().llmConfigs[1];
    api.setActiveLLM(second.id);
    expect(getStoredRequestConfigs().llmConfig?.model).toBe("second");
    expect(getStoredRequestConfigs().llmConfig?.configId).toBe(second.id);
    expect(getStoredRequestConfigs().llmConfig?.apiKey).toBeUndefined();
    for (let i = 0; i < 30; i++) await Promise.resolve();
    expect(useAPIConfig().syncStatus).toBe("saved");
    const incoming = { ...empty, version: 2 as const, llmConfigs: [{ ...model, id: "import-a", name: "third" }], vlmConfigs: [{ ...model, id: "import-v", name: "vision" }], activeVLMId: "import-v" };
    const fetcher = vi.mocked(fetch); fetcher.mockClear();
    api.importArchive(incoming);
    for (let i = 0; i < 30; i++) await Promise.resolve();
    expect(getStoredConfigs().llmConfigs).toHaveLength(3);
    expect(getStoredConfigs().vlmConfigs).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);  });
});
