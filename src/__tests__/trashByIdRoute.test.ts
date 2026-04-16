import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const upsertTaskMock = vi.fn();
const upsertCharacterMock = vi.fn();
const restoreFromTrashMock = vi.fn();
const permanentlyDeleteTrashItemMock = vi.fn();
const extractTaskImagesMock = vi.fn();
const extractCharacterImagesMock = vi.fn();

vi.mock("@/lib/server/db", () => ({
  upsertTask: upsertTaskMock,
  upsertCharacter: upsertCharacterMock,
}));

vi.mock("@/lib/server/imageExtractor", () => ({
  restoreFromTrash: restoreFromTrashMock,
  permanentlyDeleteTrashItem: permanentlyDeleteTrashItemMock,
  extractTaskImages: extractTaskImagesMock,
  extractCharacterImages: extractCharacterImagesMock,
}));

describe("/api/trash/[id] route", () => {
  beforeEach(() => {
    upsertTaskMock.mockReset();
    upsertCharacterMock.mockReset();
    restoreFromTrashMock.mockReset();
    permanentlyDeleteTrashItemMock.mockReset();
    extractTaskImagesMock.mockReset();
    extractCharacterImagesMock.mockReset();
  });

  it("restores trashed tasks and rebuilds image registry references", async () => {
    const restoredTask = { id: "task-1", status: "completed", progress: 100 };
    restoreFromTrashMock.mockReturnValue({ type: "task", data: restoredTask });
    extractTaskImagesMock.mockReturnValue({ ...restoredTask, script: { title: "Task" } });

    const { POST } = await import("@/app/api/trash/[id]/route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/trash/task-1", { method: "POST" }),
      { params: Promise.resolve({ id: "task-1" }) },
    );

    expect(response.status).toBe(200);
    expect(extractTaskImagesMock).toHaveBeenCalledWith(restoredTask);
    expect(upsertTaskMock).toHaveBeenCalledWith({ ...restoredTask, script: { title: "Task" } });
    await expect(response.json()).resolves.toEqual({ success: true, type: "task" });
  });

  it("restores trashed characters via the character image extractor", async () => {
    const restoredCharacter = { id: "char-1", name: "Hero" };
    restoreFromTrashMock.mockReturnValue({ type: "character", data: restoredCharacter });
    extractCharacterImagesMock.mockReturnValue({ ...restoredCharacter, avatarUrl: "file://char-1_avatar" });

    const { POST } = await import("@/app/api/trash/[id]/route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/trash/char-1", { method: "POST" }),
      { params: Promise.resolve({ id: "char-1" }) },
    );

    expect(response.status).toBe(200);
    expect(extractCharacterImagesMock).toHaveBeenCalledWith(restoredCharacter);
    expect(upsertCharacterMock).toHaveBeenCalledWith({
      ...restoredCharacter,
      avatarUrl: "file://char-1_avatar",
    });
    await expect(response.json()).resolves.toEqual({ success: true, type: "character" });
  });

  it("returns 404 when a trash item cannot be restored", async () => {
    restoreFromTrashMock.mockReturnValue(null);

    const { POST } = await import("@/app/api/trash/[id]/route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/trash/missing", { method: "POST" }),
      { params: Promise.resolve({ id: "missing" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "回收站中未找到该记录" });
  });

  it("permanently deletes a trash item", async () => {
    permanentlyDeleteTrashItemMock.mockReturnValue(true);

    const { DELETE } = await import("@/app/api/trash/[id]/route");
    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/trash/task-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "task-1" }) },
    );

    expect(response.status).toBe(200);
    expect(permanentlyDeleteTrashItemMock).toHaveBeenCalledWith("task-1");
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("returns 404 when a permanent delete target is missing", async () => {
    permanentlyDeleteTrashItemMock.mockReturnValue(false);

    const { DELETE } = await import("@/app/api/trash/[id]/route");
    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/trash/missing", { method: "DELETE" }),
      { params: Promise.resolve({ id: "missing" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "回收站中未找到该记录" });
  });
});
