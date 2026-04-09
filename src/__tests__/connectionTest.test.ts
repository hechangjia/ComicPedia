import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testImageConnection } from "@/lib/api/connectionTest";
import type { UserImageConfig } from "@/lib/types";

const originalFetch = globalThis.fetch;

function makeImageConfig(overrides: Partial<UserImageConfig> = {}): UserImageConfig {
  return {
    id: "image-test",
    name: "Image Test",
    provider: "custom",
    apiUrl: "https://aiapi.exe.xyz",
    apiKey: "secret",
    model: "google/nano-banana-2",
    size: "1024x1024",
    endpointType: "chat",
    ...overrides,
  };
}

describe("connectionTest", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("reports html pages as an invalid image api endpoint instead of a successful connection", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("<!doctype html><html><body>Not an API</body></html>", {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    }));

    const result = await testImageConnection(makeImageConfig());

    expect(result).toEqual(
      expect.objectContaining({
        status: "error",
        message: expect.stringContaining("HTML"),
        detail: expect.stringContaining("/chat/completions"),
      }),
    );
  });
});
