import { describe, expect, it } from "vitest";
import { resolveSavedModelRequest } from "@/lib/server/modelRequest";
import { modelRequestBody } from "@/lib/providers/modelRequestBody";
import { createEmptyUserConfig } from "@/lib/config/userConfig";
const config = () => ({ ...createEmptyUserConfig(), llmConfigs: [{ id: "same", name: "Text", provider: "custom" as const, apiUrl: "http://localhost:8317", apiKey: "server-text-secret", model: "text", protocolType: "openai-compatible" as const }], vlmConfigs: [{ id: "same", name: "Vision", provider: "custom" as const, apiUrl: "https://vision.example/v1", apiKey: "server-vision-secret", model: "vision", protocolType: "anthropic" as const }], imageConfigs: [{ id: "image", name: "Image", provider: "custom" as const, apiUrl: "http://localhost:8317", apiKey: "server-image-secret", model: "image", size: "1024x1024", endpointType: "images" as const }] });
describe("server-resolved model requests", () => {
  it("uses registered URL, model and key, never caller-supplied overrides", () => {
    const result = resolveSavedModelRequest(config(), { modelRef: { role: "llm", id: "same" }, targetUrl: "https://attacker.example", headers: { Authorization: "Bearer attacker" }, payload: { model: "attacker", messages: [] } }, ["llm", "vlm"]);
    expect(result).toMatchObject({ targetUrl: "http://localhost:8317/v1/chat/completions", headers: { Authorization: "Bearer server-text-secret" }, payload: { model: "text", messages: [] } });
    expect(JSON.stringify(result)).not.toContain("attacker");
  });
  it("scopes identical IDs by role and constructs Anthropic headers", () => {
    const result = resolveSavedModelRequest(config(), { modelRef: { role: "vlm", id: "same" }, payload: { messages: [] } }, ["llm", "vlm"]);
    expect(result).toMatchObject({ targetUrl: "https://vision.example/v1/messages", headers: { "x-api-key": "server-vision-secret", "anthropic-version": "2023-06-01" }, payload: { model: "vision" } });
  });
  it.each([null, {}, { role: "llm", id: "missing" }, { role: "image", id: "image" }, { role: "llm", id: 4 }])("fails closed for invalid references on text routes", ref => {
    expect(() => resolveSavedModelRequest(config(), { modelRef: ref, targetUrl: "https://fallback.example", payload: {} }, ["llm", "vlm"])).toThrow();
  });
  it("requires an existing configuration and does not fall back to an active role", () => {
    expect(() => resolveSavedModelRequest(null, { modelRef: { role: "llm", id: "same" }, payload: {} }, ["llm"])).toThrow();
  });
  it("resolves image model and endpoint independently of caller URL/model", () => {
    const result = resolveSavedModelRequest(config(), { modelRef: { role: "image", id: "image" }, payload: { model: "ignored", prompt: "test" } }, ["image"]);
    expect(result).toMatchObject({ targetUrl: "http://localhost:8317/v1/images/generations", payload: { model: "image", prompt: "test" } });
  });
  it("serializes a saved model without any URL/header/credential fields", () => {
    const result = modelRequestBody({ configId: "same", configRole: "vlm" }, "https://private.example", { Authorization: "secret" }, { messages: [] });
    expect(result).toEqual({ modelRef: { id: "same", role: "vlm" }, payload: { messages: [] } });
  });
  it("leaves explicit ad-hoc testing mode separate when no saved ID exists", () => {
    expect(modelRequestBody(undefined, "https://adhoc.example", {}, {})).toEqual({ targetUrl: "https://adhoc.example", headers: {}, payload: {} });
  });
});
