import { describe, expect, it } from "vitest";
import { exportConfigArchive, parseConfigArchive, mergeConfigArchive, MAX_CONFIG_ARCHIVE_BYTES } from "@/lib/config/configTransfer";
import { createEmptyUserConfig } from "@/lib/config/userConfig";
import type { UserAPIConfigV2 } from "@/lib/types";
const llm = (id: string, name = id) => ({ id, name, provider: "custom" as const, apiUrl: "http://localhost:8317", apiKey: "private-model-key", model: "gpt-5.6-luna", protocolType: "openai-compatible" as const });
function full(): UserAPIConfigV2 {
  return { ...createEmptyUserConfig(), llmConfigs: [llm("llm")], vlmConfigs: [llm("vlm")], imageConfigs: [{ id: "image", name: "image", provider: "custom", apiUrl: "http://localhost:8317", apiKey: "private-image-key", model: "gpt-image-2", size: "1024x1024", endpointType: "images", comfyuiWorkflow: "opaque-private-workflow" }],
    activeLLMId: "llm", activeVLMId: "vlm", activeImageId: "image", accuracyConfig: { providers: [{ id: "search", name: "Search", kind: "search", vendor: "custom", baseUrl: "http://localhost:8317", apiKey: "private-search-key", maskedApiKey: "private-mask", hasApiKey: true, healthStatus: "error", lastError: "private-error", enabled: true, capabilities: ["search"], priority: 0 }], slots: { primarySearch: "search", fallbackSearch: null, primaryFetch: null, fallbackFetch: null }, whitelistDomains: ["example.org"] } };
}
const ids = () => { let n = 0; return () => `new-${++n}`; };
describe("configuration transfer", () => {
  it("exports every role and slot but no credentials, masks, health errors or opaque workflows by default", () => {
    const original = full(); const before = JSON.stringify(original);
    const archive = exportConfigArchive(original);
    const text = JSON.stringify(archive);
    expect(text).not.toContain("private-"); expect(text).not.toContain('"apiKey":');
    expect(archive.vlmConfigs).toHaveLength(1); expect(archive.accuracyConfig.slots.primarySearch).toBe("search");
    expect(JSON.stringify(original)).toBe(before);
    expect(archive.omittedWorkflows).toBe(1);
  });
  it("includes opaque workflows only when explicitly requested, still omitting API key fields", () => {
    const text = JSON.stringify(exportConfigArchive(full(), { includeWorkflows: true }));
    expect(text).toContain("opaque-private-workflow"); expect(text).not.toContain("private-model-key");
  });
  it("roundtrips a full portable archive with remapped role references and empty credentials", () => {
    const parsed = parseConfigArchive(JSON.stringify(exportConfigArchive(full())));
    const result = mergeConfigArchive(createEmptyUserConfig(), parsed.config, { createId: ids() });
    expect(result.added).toEqual({ llm: 1, vlm: 1, image: 1, accuracy: 1 });
    expect(result.config.activeLLMId).toBe(result.config.llmConfigs[0].id);
    expect(result.config.activeVLMId).toBe(result.config.vlmConfigs![0].id);
    expect(result.config.activeImageId).toBe(result.config.imageConfigs[0].id);
    expect(result.config.accuracyConfig.slots.primarySearch).toBe(result.config.accuracyConfig.providers[0].id);
    expect(result.config.llmConfigs[0].apiKey).toBe("");
  });
  it("requires explicit consent to import keys from older raw exports", () => {
    const parsed = parseConfigArchive(JSON.stringify(full()));
    expect(parsed.credentialCount).toBe(4);
    expect(mergeConfigArchive(createEmptyUserConfig(), parsed.config, { createId: ids() }).config.llmConfigs[0].apiKey).toBe("");
    expect(mergeConfigArchive(createEmptyUserConfig(), parsed.config, { createId: ids(), includeCredentials: true }).config.llmConfigs[0].apiKey).toBe("private-model-key");
  });
  it("preserves existing roles and secrets even when an imported model has matching identity", () => {
    const current = full(); current.llmConfigs[0].apiKey = "keep-me";
    const incoming = full(); incoming.llmConfigs[0].apiKey = "replace-me";
    const result = mergeConfigArchive(current, incoming, { includeCredentials: true, createId: ids() });
    expect(result.config.llmConfigs).toHaveLength(1); expect(result.config.llmConfigs[0].apiKey).toBe("keep-me");
    expect(result.config.activeLLMId).toBe("llm"); expect(result.skipped.llm).toBe(1);
  });
  it("remaps collisions rather than borrowing another stored provider's credentials", () => {
    const current = full(); const incoming = full(); incoming.accuracyConfig.providers[0].baseUrl = "https://other.example";
    const result = mergeConfigArchive(current, incoming, { createId: ids() });
    const imported = result.config.accuracyConfig.providers.find(p => p.baseUrl === "https://other.example")!;
    expect(imported.id).not.toBe("search"); expect(imported.apiKey).toBeUndefined();
    expect(result.config.accuracyConfig.slots.primarySearch).toBe("search");
  });
  it("handles equivalent entries with different source IDs without duplicating or breaking bindings", () => {
    const incoming = full(); incoming.llmConfigs.push({ ...incoming.llmConfigs[0], id: "alias" }); incoming.activeLLMId = "alias";
    const result = mergeConfigArchive(createEmptyUserConfig(), incoming, { createId: ids() });
    expect(result.config.llmConfigs).toHaveLength(1); expect(result.config.activeLLMId).toBe(result.config.llmConfigs[0].id); expect(result.skipped.llm).toBe(1);
  });
  it("accepts V1 and previous single-role exports", () => {
    expect(parseConfigArchive(JSON.stringify({ version: 1, llm: llm("old"), image: null })).config.llmConfigs).toHaveLength(1);
    expect(parseConfigArchive(JSON.stringify({ app: "comicpedia", type: "config", imageConfigs: full().imageConfigs })).config.imageConfigs).toHaveLength(1);
  });
  it.each(["{", "null", "[]", "{}", '{"app":"other","version":2}', '{"version":99}', '{"app":"comicpedia","type":"backup","llmConfigs":[]}'])("rejects wrong or malformed archive %s", input => expect(() => parseConfigArchive(input)).toThrow());
  it("rejects oversized files and bad entries instead of partially importing", () => {
    expect(() => parseConfigArchive(" ".repeat(MAX_CONFIG_ARCHIVE_BYTES + 1))).toThrow();
    const input = full(); (input.llmConfigs as unknown[]).push(null);
    expect(() => parseConfigArchive(JSON.stringify(input))).toThrow();
  });
  it("rejects duplicate IDs and dangling/wrong-kind role references", () => {
    const input = full(); input.llmConfigs.push(llm("llm", "Different"));
    expect(() => parseConfigArchive(JSON.stringify(input))).toThrow();
    const dangling = full(); dangling.activeVLMId = "missing";
    expect(() => parseConfigArchive(JSON.stringify(dangling))).toThrow();
    const wrong = full(); wrong.accuracyConfig.slots.primaryFetch = "search";
    expect(() => parseConfigArchive(JSON.stringify(wrong))).toThrow();
  });
  it("does not transfer health claims as proof of a newly imported capability", () => {
    const parsed = parseConfigArchive(JSON.stringify(full()));
    const result = mergeConfigArchive(createEmptyUserConfig(), parsed.config, { createId: ids() });
    const provider = result.config.accuracyConfig.providers[0];
    expect(provider.healthStatus).toBeUndefined(); expect(provider.hasApiKey).toBe(false); expect(provider.maskedApiKey).toBeUndefined();
  });
  it("omits opaque workflows during import unless separately approved", () => {
    const parsed = parseConfigArchive(JSON.stringify(full()));
    const safe = mergeConfigArchive(createEmptyUserConfig(), parsed.config, { createId: ids() });
    expect(safe.config.imageConfigs[0].comfyuiWorkflow).toBeUndefined();
    const opted = mergeConfigArchive(createEmptyUserConfig(), parsed.config, { createId: ids(), includeWorkflows: true });
    expect(opted.config.imageConfigs[0].comfyuiWorkflow).toBe("opaque-private-workflow");
    expect(opted.config.imageConfigs[0].apiKey).toBe("");
  });
  it("reports workflows omitted by a portable export", () => {
    const parsed = parseConfigArchive(JSON.stringify(exportConfigArchive(full())));
    expect(parsed.omittedWorkflows).toBe(1);
  });
  it("rejects a malformed raw V2 payload instead of treating it as an empty import", () => {
    expect(() => parseConfigArchive('{"version":2}')).toThrow();
  });
  it("rejects merging past the configured row limit without mutating current data", () => {
    const current = createEmptyUserConfig(); current.llmConfigs = Array.from({ length: 200 }, (_, i) => llm(`c${i}`));
    const before = JSON.stringify(current);
    expect(() => mergeConfigArchive(current, full(), { createId: ids() })).toThrow();
    expect(JSON.stringify(current)).toBe(before);
  });  it("is idempotent when workflows and credentials were intentionally excluded", () => {
    const first = mergeConfigArchive(createEmptyUserConfig(), full(), { createId: ids() });
    const second = mergeConfigArchive(first.config, full(), { createId: ids() });
    expect(second.added).toEqual({ llm: 0, vlm: 0, image: 0, accuracy: 0 });
  });
  it("does not claim the workflow opt-in archive is free of embedded credentials", () => {
    const archive = exportConfigArchive(full(), { includeWorkflows: true });
    expect(archive.apiKeyFieldsIncluded).toBe(false);
    expect(archive.embeddedWorkflowsIncluded).toBe(true);
    expect(archive).not.toHaveProperty("credentialsIncluded");
  });  it("reimports a default export into its origin without duplicating an existing workflow configuration", () => {
    const current = full();
    const parsed = parseConfigArchive(JSON.stringify(exportConfigArchive(current)));
    const result = mergeConfigArchive(current, parsed.config, { createId: ids() });
    expect(result.added).toEqual({ llm: 0, vlm: 0, image: 0, accuracy: 0 });
    expect(result.config.imageConfigs[0].comfyuiWorkflow).toBe("opaque-private-workflow");
  });});
