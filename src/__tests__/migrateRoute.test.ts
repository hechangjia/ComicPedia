import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const upsertTaskMock = vi.fn();
const upsertCharacterMock = vi.fn();
const saveConfigMock = vi.fn();
const batchUpsertSeriesMock = vi.fn();

vi.mock("@/lib/server/db", () => ({
  upsertTask: upsertTaskMock,
  upsertCharacter: upsertCharacterMock,
  saveConfigIfMatch: saveConfigMock,
  batchUpsertSeries: batchUpsertSeriesMock,
}));

describe("/api/migrate POST", () => {
  beforeEach(() => {
    upsertTaskMock.mockReset();
    upsertCharacterMock.mockReset();
    saveConfigMock.mockReset().mockReturnValue(true);
    batchUpsertSeriesMock.mockReset();
  });

  it("requires both type and data", async () => {
    const { POST } = await import("@/app/api/migrate/route");
    const request = new NextRequest("http://localhost:3000/api/migrate", {
      method: "POST",
      body: JSON.stringify({ type: "tasks" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "缺少 type 或 data 字段" });
  });

  it("upserts a single migrated task", async () => {
    const { POST } = await import("@/app/api/migrate/route");
    const request = new NextRequest("http://localhost:3000/api/migrate", {
      method: "POST",
      body: JSON.stringify({
        type: "tasks",
        data: { id: "task-1", status: "completed", imageUrl: "file://task-1_panel0_cur" },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(upsertTaskMock).toHaveBeenCalledWith({
      id: "task-1",
      status: "completed",
      imageUrl: "file://task-1_panel0_cur",
    });
    await expect(response.json()).resolves.toEqual({ success: true, type: "tasks", count: 1 });
  });

  it("batch upserts migrated series", async () => {
    const { POST } = await import("@/app/api/migrate/route");
    const request = new NextRequest("http://localhost:3000/api/migrate", {
      method: "POST",
      body: JSON.stringify({
        type: "series",
        data: [{ id: "series-1", title: "Thunder" }, { id: "series-2", title: "Rain" }],
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(batchUpsertSeriesMock).toHaveBeenCalledWith([
      { id: "series-1", title: "Thunder" },
      { id: "series-2", title: "Rain" },
    ]);
    await expect(response.json()).resolves.toEqual({ success: true, type: "series", count: 2 });
  });

  it("rejects unknown migrate types", async () => {
    const { POST } = await import("@/app/api/migrate/route");
    const request = new NextRequest("http://localhost:3000/api/migrate", {
      method: "POST",
      body: JSON.stringify({
        type: "unknown",
        data: {},
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "未知迁移类型: unknown" });
  });
  it("does not overwrite existing server configuration through legacy migration", async () => {
    saveConfigMock.mockReturnValue(false);
    const { POST } = await import("@/app/api/migrate/route");
    const response = await POST(new NextRequest("http://localhost/api/migrate", {
      method: "POST", body: JSON.stringify({ type: "config", data: { version: 2, llmConfigs: [], imageConfigs: [] } }),
    }));
    expect(response.status).toBe(409);
    expect(saveConfigMock).toHaveBeenCalledWith(expect.any(Object), '"empty"');
  });
  it("validates migrated config before persistence", async () => {
    const { POST } = await import("@/app/api/migrate/route");
    const response = await POST(new NextRequest("http://localhost/api/migrate", { method: "POST", body: JSON.stringify({ type: "config", data: { version: 1 } }) }));
    expect(response.status).toBe(400);
    expect(saveConfigMock).not.toHaveBeenCalled();
  });});

it("refuses to migrate a cached draft with missing credential input", async () => {
  saveConfigMock.mockReset().mockReturnValue(true);
  const { POST } = await import("@/app/api/migrate/route");
  const { createEmptyUserConfig } = await import("@/lib/config/userConfig");
  const data = { ...createEmptyUserConfig(), llmConfigs: [{ id: "a", name: "A", provider: "custom", apiUrl: "http://localhost:8317", apiKey: "", apiKeyInputRequired: true, model: "text", protocolType: "openai-compatible" }] };
  const response = await POST(new NextRequest("http://localhost/api/migrate", { method: "POST", body: JSON.stringify({ type: "config", data }) }));
  expect(response.status).toBe(400);
  expect(saveConfigMock).not.toHaveBeenCalled();
});
