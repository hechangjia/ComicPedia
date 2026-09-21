import { describe, expect, it } from "vitest";
import { validateConfigPayload } from "@/lib/config/configValidation";
const valid = () => ({ version: 2, llmConfigs: [], imageConfigs: [], activeLLMId: null, activeImageId: null });
describe("config boundary validation", () => {
  it("accepts a legacy V2 config without VLM or accuracy", () => expect(validateConfigPayload(valid())).toBeNull());
  it.each([null, [], {}, { ...valid(), version: 1 }, { ...valid(), llmConfigs: "not-an-array" }, { ...valid(), activeImageId: "missing" }])("rejects invalid envelopes and dangling role IDs", input => expect(validateConfigPayload(input)).toBeTruthy());
  const model = { id: "m", name: "Local", provider: "custom", apiUrl: "http://localhost:8317", apiKey: "", model: "m", protocolType: "openai-compatible" };
  it("accepts a local model without credentials", () => expect(validateConfigPayload({ ...valid(), llmConfigs: [model], activeLLMId: "m" })).toBeNull());
  it.each([{ ...model, id: "" }, { ...model, apiKey: {} }, { ...model, apiUrl: "javascript:alert(1)" }, { ...model, protocolType: "guess" }])("rejects malformed models", m => expect(validateConfigPayload({ ...valid(), llmConfigs: [m] })).toBeTruthy());
  it("rejects duplicate IDs in a role", () => expect(validateConfigPayload({ ...valid(), llmConfigs: [model, model] })).toBeTruthy());
  it("rejects malformed accuracy providers instead of silently dropping them", () => expect(validateConfigPayload({ ...valid(), accuracyConfig: { providers: [null] } })).toBeTruthy());
});
