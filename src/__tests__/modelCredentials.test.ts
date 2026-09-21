import { describe, it, expect } from "vitest";
import { sanitizeModelCredentials, mergeModelCredentials, acknowledgeModelCredentials } from "@/lib/config/modelCredentials";
import { createEmptyUserConfig } from "@/lib/config/userConfig";
const model = (id = "shared") => ({ id, name: id, provider: "custom" as const, apiUrl: "http://localhost:8317", apiKey: "stored-text", model: "text", protocolType: "openai-compatible" as const });
const saved = () => ({ ...createEmptyUserConfig(), llmConfigs: [model()], vlmConfigs: [{ ...model(), apiKey: "stored-vision" }], imageConfigs: [{ id: "shared", name: "image", provider: "custom" as const, apiUrl: "http://localhost:8317", apiKey: "stored-image", model: "image", size: "1024x1024", endpointType: "images" as const }] });
describe("model credential lifecycle", () => {
  it("returns presence only for all three roles, never a masked key fragment", () => {
    const dto = sanitizeModelCredentials(saved());
    expect(JSON.stringify(dto)).not.toContain("stored-");
    expect(dto.llmConfigs[0]).toMatchObject({ apiKey: "", hasApiKey: true });
    expect(dto.vlmConfigs![0]).toMatchObject({ apiKey: "", hasApiKey: true });
    expect(dto.imageConfigs[0]).toMatchObject({ apiKey: "", hasApiKey: true });
  });
  it("preserves, replaces, and explicitly clears secrets independently by role", () => {
    const original = saved(); const incoming = sanitizeModelCredentials(original);
    incoming.vlmConfigs![0].apiKey = " replacement ";
    incoming.imageConfigs[0].clearApiKey = true;
    const merged = mergeModelCredentials(original, incoming);
    expect(merged.llmConfigs[0].apiKey).toBe("stored-text");
    expect(merged.vlmConfigs![0].apiKey).toBe("replacement");
    expect(merged.imageConfigs[0].apiKey).toBe("");
    expect(merged.imageConfigs[0]).not.toHaveProperty("clearApiKey");
    expect(original.imageConfigs[0].apiKey).toBe("stored-image");
  });
  it("refuses carrying a stored secret to a changed address without replacement or clear", () => {
    const incoming = sanitizeModelCredentials(saved()); incoming.llmConfigs[0].apiUrl = "https://other.example";
    expect(() => mergeModelCredentials(saved(), incoming)).toThrow("地址");
    incoming.llmConfigs[0].clearApiKey = true;
    expect(mergeModelCredentials(saved(), incoming).llmConfigs[0].apiKey).toBe("");
  });
  it("erases acknowledged inputs without erasing a newer pending replacement", () => {
    const sent = saved(); const current = saved(); current.vlmConfigs![0].apiKey = "newer";
    const next = acknowledgeModelCredentials(current, sent);
    expect(next.llmConfigs[0]).toMatchObject({ apiKey: "", hasApiKey: true });
    expect(next.vlmConfigs![0].apiKey).toBe("newer");
  });
  it("does not carry a just-acknowledged input into a concurrently changed target", () => {
    const sent = saved(); const current = saved(); current.llmConfigs[0].apiUrl = "https://other.example";
    const next = acknowledgeModelCredentials(current, sent);
    expect(next.llmConfigs[0].apiKey).toBe("");
    expect(() => mergeModelCredentials(sent, next)).toThrow("地址");
  });

});
