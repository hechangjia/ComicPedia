import { describe, expect, it } from "vitest";
import { modelEndpoint } from "@/lib/providers/endpoints";

describe("provider endpoint normalization", () => {
  it.each([
    ["https://gateway.example/chat/completions", "chat", "https://gateway.example/chat/completions"],
    ["http://localhost:8317", "chat", "http://localhost:8317/v1/chat/completions"],
    ["http://localhost:8317/v1/", "images", "http://localhost:8317/v1/images/generations"],
    ["http://localhost:8317/v1/chat/completions", "models", "http://localhost:8317/v1/models"],
    ["https://gateway.example/proxy/v1/images/generations", "chat", "https://gateway.example/proxy/v1/chat/completions"],
    ["https://api.anthropic.com", "messages", "https://api.anthropic.com/v1/messages"],
  ] as const)("normalizes %s for %s", (url, operation, expected) => {
    expect(modelEndpoint(url, operation)).toBe(expected);
  });
  it.each(["file:///secret", "https://user:password@example.com", "https://example.com?api_key=secret", "https://example.com/#secret"])("rejects credential-bearing or invalid endpoint %s", (url) => {
    expect(() => modelEndpoint(url, "models")).toThrow();
  });
});
