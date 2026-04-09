import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getSeriesByIdMock = vi.fn();
const upsertSeriesMock = vi.fn();
const deleteSeriesMock = vi.fn();
const getEpisodeArcSnapshotsMock = vi.fn();

vi.mock("@/lib/server/db", () => ({
  getSeriesById: getSeriesByIdMock,
  upsertSeries: upsertSeriesMock,
  deleteSeries: deleteSeriesMock,
  getEpisodeArcSnapshots: getEpisodeArcSnapshotsMock,
}));

describe("/api/series/[id] routes", () => {
  beforeEach(() => {
    getSeriesByIdMock.mockReset();
    upsertSeriesMock.mockReset();
    deleteSeriesMock.mockReset();
    getEpisodeArcSnapshotsMock.mockReset();
  });

  it("returns 404 when a series detail is missing", async () => {
    getSeriesByIdMock.mockReturnValue(null);

    const { GET } = await import("@/app/api/series/[id]/route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/series/missing"),
      { params: Promise.resolve({ id: "missing" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "连载不存在" });
  });

  it("rejects updates when series.id does not match the route", async () => {
    const { PUT } = await import("@/app/api/series/[id]/route");
    const request = new NextRequest("http://localhost:3000/api/series/series-1", {
      method: "PUT",
      body: JSON.stringify({
        series: { id: "series-2", title: "Mismatch", episodes: [] },
      }),
    });

    const response = await PUT(request, {
      params: Promise.resolve({ id: "series-1" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "series.id 与路由不匹配" });
    expect(upsertSeriesMock).not.toHaveBeenCalled();
  });

  it("updates a series when the payload matches the route id", async () => {
    const { PUT } = await import("@/app/api/series/[id]/route");
    const request = new NextRequest("http://localhost:3000/api/series/series-1", {
      method: "PUT",
      body: JSON.stringify({
        series: { id: "series-1", title: "Updated", episodes: [] },
      }),
    });

    const response = await PUT(request, {
      params: Promise.resolve({ id: "series-1" }),
    });

    expect(response.status).toBe(200);
    expect(upsertSeriesMock).toHaveBeenCalledWith({
      id: "series-1",
      title: "Updated",
      episodes: [],
    });
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("returns deletion state for series deletes", async () => {
    deleteSeriesMock.mockReturnValue(true);

    const { DELETE } = await import("@/app/api/series/[id]/route");
    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/series/series-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "series-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, deleted: true });
  });
});

describe("/api/series/[id]/arc-snapshots GET", () => {
  beforeEach(() => {
    getSeriesByIdMock.mockReset();
    getEpisodeArcSnapshotsMock.mockReset();
  });

  it("requires characterNames query param", async () => {
    getSeriesByIdMock.mockReturnValue({ id: "series-1", episodes: [{ taskId: "task-1" }] });

    const { GET } = await import("@/app/api/series/[id]/arc-snapshots/route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/series/series-1/arc-snapshots"),
      { params: Promise.resolve({ id: "series-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "缺少 characterNames 参数" });
    expect(getEpisodeArcSnapshotsMock).not.toHaveBeenCalled();
  });

  it("returns snapshots for the requested series episodes and characters", async () => {
    getSeriesByIdMock.mockReturnValue({
      id: "series-1",
      episodes: [{ taskId: "task-1" }, { taskId: "task-2" }],
    });
    getEpisodeArcSnapshotsMock.mockReturnValue([
      { characterName: "Alice", latest: "mentor" },
    ]);

    const { GET } = await import("@/app/api/series/[id]/arc-snapshots/route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/series/series-1/arc-snapshots?characterNames=Alice,Bob"),
      { params: Promise.resolve({ id: "series-1" }) },
    );

    expect(response.status).toBe(200);
    expect(getEpisodeArcSnapshotsMock).toHaveBeenCalledWith(
      ["task-1", "task-2"],
      ["Alice", "Bob"],
    );
    await expect(response.json()).resolves.toEqual([
      { characterName: "Alice", latest: "mentor" },
    ]);
  });
});
