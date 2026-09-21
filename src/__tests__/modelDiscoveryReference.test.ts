import { beforeEach, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { createEmptyUserConfig } from "@/lib/config/userConfig";
const { getConfig } = vi.hoisted(() => ({ getConfig: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getConfig }));
beforeEach(() => {
  getConfig.mockReturnValue({ ...createEmptyUserConfig(), vlmConfigs: [{ id: "a", apiUrl: "http://localhost:8317", apiKey: "stored-vision-key", model: "vision", protocolType: "openai-compatible" }] });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: [{ id: "vision" }] })));
});
import { afterEach } from "vitest";
afterEach(() => vi.unstubAllGlobals());
it("discovers with stored role credentials without forwarding browser credentials or redirects", async () => {
  const { POST } = await import("@/app/api/models/route");
  const response = await POST(new NextRequest("http://localhost/api/models", { method: "POST", body: JSON.stringify({ modelRef: { id: "a", role: "vlm" } }) }));
  expect(response.status).toBe(200);
  expect(fetch).toHaveBeenCalledWith("http://localhost:8317/v1/models", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer stored-vision-key" }), redirect: "error" }));
  expect(await response.text()).not.toContain("stored-vision-key");
});
it("refuses stored-key discovery after the user edits the service address", async () => {
  const { POST } = await import("@/app/api/models/route");
  const response = await POST(new NextRequest("http://localhost/api/models", { method: "POST", body: JSON.stringify({ modelRef: { id: "a", role: "vlm" }, apiUrl: "https://other.example" }) }));
  expect(response.status).toBe(409); expect(fetch).not.toHaveBeenCalled();
});
