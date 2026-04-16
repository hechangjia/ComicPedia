import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getAllSeriesListMock = vi.fn();
const upsertSeriesMock = vi.fn();

vi.mock("@/lib/server/db", () => ({
  getAllSeriesList: getAllSeriesListMock,
  upsertSeries: upsertSeriesMock,
}));

describe("/api/series route", () => {
  beforeEach(() => {
    getAllSeriesListMock.mockReset();
    upsertSeriesMock.mockReset();
  });

  it("returns all series entries", async () => {
    getAllSeriesListMock.mockReturnValue([
      { id: "series-1", title: "Thunder", episodes: [] },
    ]);

    const { GET } = await import("@/app/api/series/route");
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { id: "series-1", title: "Thunder", episodes: [] },
    ]);
  });

  it("requires series.id on create", async () => {
    const { POST } = await import("@/app/api/series/route");
    const request = new NextRequest("http://localhost:3000/api/series", {
      method: "POST",
      body: JSON.stringify({ series: { title: "Thunder" } }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "缺少 series.id" });
    expect(upsertSeriesMock).not.toHaveBeenCalled();
  });

  it("creates or syncs a series record", async () => {
    const { POST } = await import("@/app/api/series/route");
    const request = new NextRequest("http://localhost:3000/api/series", {
      method: "POST",
      body: JSON.stringify({
        series: { id: "series-1", title: "Thunder", episodes: [] },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(upsertSeriesMock).toHaveBeenCalledWith({
      id: "series-1",
      title: "Thunder",
      episodes: [],
    });
    await expect(response.json()).resolves.toEqual({ success: true, id: "series-1" });
  });
});
