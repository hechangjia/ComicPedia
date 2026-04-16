import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCharacterByIdMock = vi.fn();
const upsertCharacterMock = vi.fn();
const deleteCharacterMock = vi.fn();
const extractCharacterImagesAsyncMock = vi.fn();
const fileRefsToUrlsMock = vi.fn((value) => value);
const trashCharacterImagesMock = vi.fn();

vi.mock("@/lib/server/db", () => ({
  getCharacterById: getCharacterByIdMock,
  upsertCharacter: upsertCharacterMock,
  deleteCharacter: deleteCharacterMock,
}));

vi.mock("@/lib/server/imageExtractor", () => ({
  extractCharacterImagesAsync: extractCharacterImagesAsyncMock,
  fileRefsToUrls: fileRefsToUrlsMock,
  trashCharacterImages: trashCharacterImagesMock,
}));

describe("/api/characters/[id] route", () => {
  beforeEach(() => {
    getCharacterByIdMock.mockReset();
    upsertCharacterMock.mockReset();
    deleteCharacterMock.mockReset();
    extractCharacterImagesAsyncMock.mockReset();
    fileRefsToUrlsMock.mockReset();
    trashCharacterImagesMock.mockReset();
    fileRefsToUrlsMock.mockImplementation((value) => value);
  });

  it("returns 404 when a character detail is missing", async () => {
    getCharacterByIdMock.mockReturnValue(null);

    const { GET } = await import("@/app/api/characters/[id]/route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/characters/missing"),
      { params: Promise.resolve({ id: "missing" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "角色不存在" });
  });

  it("returns a character after rewriting file refs to urls", async () => {
    getCharacterByIdMock.mockReturnValue({
      id: "char-1",
      avatarUrl: "file://char-1_avatar",
    });
    fileRefsToUrlsMock.mockReturnValue({
      id: "char-1",
      avatarUrl: "/api/images/char-1_avatar",
    });

    const { GET } = await import("@/app/api/characters/[id]/route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/characters/char-1"),
      { params: Promise.resolve({ id: "char-1" }) },
    );

    expect(response.status).toBe(200);
    expect(fileRefsToUrlsMock).toHaveBeenCalledWith({
      id: "char-1",
      avatarUrl: "file://char-1_avatar",
    });
    await expect(response.json()).resolves.toEqual({
      id: "char-1",
      avatarUrl: "/api/images/char-1_avatar",
    });
  });

  it("rejects updates when character.id does not match the route", async () => {
    const { PUT } = await import("@/app/api/characters/[id]/route");
    const request = new NextRequest("http://localhost:3000/api/characters/char-1", {
      method: "PUT",
      body: JSON.stringify({
        character: { id: "char-2", name: "Mismatch" },
      }),
    });

    const response = await PUT(request, {
      params: Promise.resolve({ id: "char-1" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "character.id 与路由不匹配" });
    expect(upsertCharacterMock).not.toHaveBeenCalled();
  });

  it("extracts images before upserting a matching character update", async () => {
    extractCharacterImagesAsyncMock.mockResolvedValue({
      id: "char-1",
      name: "Hero",
      avatarUrl: "file://char-1_avatar",
    });

    const { PUT } = await import("@/app/api/characters/[id]/route");
    const request = new NextRequest("http://localhost:3000/api/characters/char-1", {
      method: "PUT",
      body: JSON.stringify({
        character: { id: "char-1", name: "Hero", avatarUrl: "data:image/png;base64,avatar" },
      }),
    });

    const response = await PUT(request, {
      params: Promise.resolve({ id: "char-1" }),
    });

    expect(response.status).toBe(200);
    expect(extractCharacterImagesAsyncMock).toHaveBeenCalledWith({
      id: "char-1",
      name: "Hero",
      avatarUrl: "data:image/png;base64,avatar",
    });
    expect(upsertCharacterMock).toHaveBeenCalledWith({
      id: "char-1",
      name: "Hero",
      avatarUrl: "file://char-1_avatar",
    });
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("soft deletes characters and trashes their images", async () => {
    const existingCharacter = { id: "char-1", name: "Hero" };
    getCharacterByIdMock.mockReturnValue(existingCharacter);
    deleteCharacterMock.mockReturnValue(true);

    const { DELETE } = await import("@/app/api/characters/[id]/route");
    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/characters/char-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "char-1" }) },
    );

    expect(response.status).toBe(200);
    expect(trashCharacterImagesMock).toHaveBeenCalledWith("char-1", existingCharacter);
    await expect(response.json()).resolves.toEqual({ success: true, deleted: true });
  });
});
