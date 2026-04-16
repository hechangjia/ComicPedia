import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const batchUpsertTasksMock = vi.fn();
const batchUpsertCharactersMock = vi.fn();
const batchUpsertSeriesMock = vi.fn();

vi.mock("@/lib/server/db", () => ({
  batchUpsertTasks: batchUpsertTasksMock,
  batchUpsertCharacters: batchUpsertCharactersMock,
  batchUpsertSeries: batchUpsertSeriesMock,
}));

describe("/api/backup/import POST", () => {
  beforeEach(() => {
    batchUpsertTasksMock.mockReset();
    batchUpsertCharactersMock.mockReset();
    batchUpsertSeriesMock.mockReset();
    delete process.env.ADMIN_TOKEN;
  });

  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
  });

  it("requires authorization when ADMIN_TOKEN is configured", async () => {
    process.env.ADMIN_TOKEN = "secret-token";

    const { POST } = await import("@/app/api/backup/import/route");
    const request = new Request("http://localhost:3000/api/backup/import", {
      method: "POST",
      body: JSON.stringify({ version: "1.0.0", tasks: [] }),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("rejects invalid backup payloads", async () => {
    const { POST } = await import("@/app/api/backup/import/route");
    const request = new Request("http://localhost:3000/api/backup/import", {
      method: "POST",
      body: JSON.stringify({ version: "", tasks: {} }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid backup format" });
    expect(batchUpsertTasksMock).not.toHaveBeenCalled();
  });

  it("sanitizes timestamps and batch imports all entity families", async () => {
    const { POST } = await import("@/app/api/backup/import/route");
    const request = new Request("http://localhost:3000/api/backup/import", {
      method: "POST",
      headers: { Authorization: "Bearer optional-token" },
      body: JSON.stringify({
        version: "1.0.0",
        exportedAt: "2026-04-09T00:00:00.000Z",
        tasks: [
          {
            id: "task-1",
            status: "completed",
            progress: 100,
            createdAt: "2026-04-01T00:00:00.000Z",
            updatedAt: "2026-04-02T00:00:00.000Z",
          },
        ],
        characters: [
          {
            id: "char-1",
            name: "Hero",
            createdAt: "2026-04-01T00:00:00.000Z",
            updatedAt: "2026-04-02T00:00:00.000Z",
          },
        ],
        series: [
          {
            id: "series-1",
            title: "Thunder",
            createdAt: "2026-04-01T00:00:00.000Z",
            updatedAt: "2026-04-02T00:00:00.000Z",
          },
        ],
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(batchUpsertTasksMock).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "task-1",
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
        updatedAt: new Date("2026-04-02T00:00:00.000Z"),
      }),
    ]);
    expect(batchUpsertCharactersMock).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "char-1",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-02T00:00:00.000Z",
      }),
    ]);
    expect(batchUpsertSeriesMock).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "series-1",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-02T00:00:00.000Z",
      }),
    ]);
    await expect(response.json()).resolves.toEqual({
      success: true,
      imported: {
        tasks: 1,
        characters: 1,
        series: 1,
      },
    });
  });
});
