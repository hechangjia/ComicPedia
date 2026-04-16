import { beforeEach, describe, expect, it, vi } from "vitest";

const getAllTasksMock = vi.fn();
const upsertTaskMock = vi.fn();
const loadDemoSeedMock = vi.fn();

vi.mock("@/lib/server/db", () => ({
  getAllTasks: getAllTasksMock,
  upsertTask: upsertTaskMock,
}));

vi.mock("@/lib/server/demoSeed", () => ({
  loadDemoSeed: loadDemoSeedMock,
}));

describe("/api/demo/export GET", () => {
  beforeEach(() => {
    getAllTasksMock.mockReset();
  });

  it("exports only completed tasks and strips base64 image payloads", async () => {
    getAllTasksMock.mockReturnValue([
      {
        id: "task-1",
        status: "completed",
        script: {
          referenceImage: "data:image/png;base64,cover",
          referenceImages: ["data:image/png;base64,ref"],
          referenceEntries: [{ imageUrl: "data:image/png;base64,entry" }],
          panels: [
            {
              imageUrl: "data:image/png;base64,panel",
              referenceImage: "data:image/png;base64,pref",
              referenceImages: ["data:image/png;base64,prefs"],
              imageVersions: [{ imageUrl: "data:image/png;base64,v1" }],
            },
          ],
        },
      },
      { id: "task-2", status: "script_ready", script: { panels: [{}] } },
      { id: "task-3", status: "completed", script: { panels: [] } },
    ]);

    const { GET } = await import("@/app/api/demo/export/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.count).toBe(1);
    expect(body.tasks[0].script).toEqual({
      referenceImage: undefined,
      referenceImages: undefined,
      referenceEntries: undefined,
      panels: [
        {
          imageUrl: undefined,
          referenceImage: undefined,
          referenceImages: undefined,
          imageVersions: undefined,
        },
      ],
    });
  });
});

describe("/api/demo/seed POST", () => {
  beforeEach(() => {
    getAllTasksMock.mockReset();
    upsertTaskMock.mockReset();
    loadDemoSeedMock.mockReset();
  });

  it("refuses to seed when the database already has tasks", async () => {
    getAllTasksMock.mockReturnValue([{ id: "task-1" }]);

    const { POST } = await import("@/app/api/demo/seed/route");
    const response = await POST();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Database already has tasks. Seed only works on empty DB.",
      count: 1,
    });
    expect(loadDemoSeedMock).not.toHaveBeenCalled();
  });

  it("returns 404 when no demo seed data exists", async () => {
    getAllTasksMock.mockReturnValue([]);
    loadDemoSeedMock.mockReturnValue([]);

    const { POST } = await import("@/app/api/demo/seed/route");
    const response = await POST();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "No demo seed file found. Generate comics first, then export via GET /api/demo/export.",
    });
  });

  it("upserts every demo seed task into an empty database", async () => {
    getAllTasksMock.mockReturnValue([]);
    loadDemoSeedMock.mockReturnValue([
      { id: "task-1" },
      { id: "task-2" },
    ]);

    const { POST } = await import("@/app/api/demo/seed/route");
    const response = await POST();

    expect(response.status).toBe(200);
    expect(upsertTaskMock).toHaveBeenNthCalledWith(1, { id: "task-1" });
    expect(upsertTaskMock).toHaveBeenNthCalledWith(2, { id: "task-2" });
    await expect(response.json()).resolves.toEqual({
      success: true,
      seeded: 2,
    });
  });
});
