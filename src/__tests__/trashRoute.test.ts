import { beforeEach, describe, expect, it, vi } from "vitest";

const getAllTrashMock = vi.fn();
const clearTrashMock = vi.fn();
const purgeAllTrashMock = vi.fn();

vi.mock("@/lib/server/db", () => ({
  getAllTrash: getAllTrashMock,
  clearTrash: clearTrashMock,
}));

vi.mock("@/lib/server/imageStorage", () => ({
  purgeAllTrash: purgeAllTrashMock,
}));

describe("/api/trash route", () => {
  beforeEach(() => {
    getAllTrashMock.mockReset();
    clearTrashMock.mockReset();
    purgeAllTrashMock.mockReset();
  });

  it("returns a summarized trash listing without full data payloads", async () => {
    getAllTrashMock.mockReturnValue([
      {
        id: "task-1",
        type: "task",
        name: "Task One",
        data: "{\"huge\":true}",
        deletedAt: "2026-04-09T00:00:00.000Z",
      },
    ]);

    const { GET } = await import("@/app/api/trash/route");
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        id: "task-1",
        type: "task",
        name: "Task One",
        deletedAt: "2026-04-09T00:00:00.000Z",
      },
    ]);
  });

  it("clears trash records and purges trashed image files", async () => {
    clearTrashMock.mockReturnValue(2);
    purgeAllTrashMock.mockReturnValue({ dirs: 1, files: 4 });

    const { DELETE } = await import("@/app/api/trash/route");
    const response = await DELETE();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      deletedRecords: 2,
      deletedDirs: 1,
      deletedFiles: 4,
    });
  });
});
