import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getAllCharactersMock = vi.fn();
const upsertCharacterMock = vi.fn();
const extractCharacterImagesAsyncMock = vi.fn();
const fileRefsToUrlsMock = vi.fn((value) => value);

vi.mock("@/lib/server/db", () => ({
  getAllCharacters: getAllCharactersMock,
  upsertCharacter: upsertCharacterMock,
}));

vi.mock("@/lib/server/imageExtractor", () => ({
  extractCharacterImagesAsync: extractCharacterImagesAsyncMock,
  fileRefsToUrls: fileRefsToUrlsMock,
}));

describe("/api/characters route", () => {
  beforeEach(() => {
    getAllCharactersMock.mockReset();
    upsertCharacterMock.mockReset();
    extractCharacterImagesAsyncMock.mockReset();
    fileRefsToUrlsMock.mockReset();
    fileRefsToUrlsMock.mockImplementation((value) => value);
  });

  it("returns all characters after converting file refs to api image urls", async () => {
    getAllCharactersMock.mockReturnValue([
      { id: "char-1", avatarUrl: "file://char-1_avatar" },
    ]);
    fileRefsToUrlsMock.mockReturnValue({
      id: "char-1",
      avatarUrl: "/api/images/char-1_avatar",
    });

    const { GET } = await import("@/app/api/characters/route");
    const response = await GET();

    expect(response.status).toBe(200);
    expect(fileRefsToUrlsMock).toHaveBeenCalledWith({
      id: "char-1",
      avatarUrl: "file://char-1_avatar",
    });
    await expect(response.json()).resolves.toEqual([
      { id: "char-1", avatarUrl: "/api/images/char-1_avatar" },
    ]);
  });

  it("requires character.id when creating a character", async () => {
    const { POST } = await import("@/app/api/characters/route");
    const request = new NextRequest("http://localhost:3000/api/characters", {
      method: "POST",
      body: JSON.stringify({ character: { name: "Hero" } }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "缺少 character.id" });
    expect(extractCharacterImagesAsyncMock).not.toHaveBeenCalled();
  });

  it("extracts images before upserting a created character", async () => {
    extractCharacterImagesAsyncMock.mockResolvedValue({
      id: "char-1",
      name: "Hero",
      avatarUrl: "file://char-1_avatar",
    });

    const { POST } = await import("@/app/api/characters/route");
    const request = new NextRequest("http://localhost:3000/api/characters", {
      method: "POST",
      body: JSON.stringify({
        character: {
          id: "char-1",
          name: "Hero",
          avatarUrl: "data:image/png;base64,avatar",
        },
      }),
    });

    const response = await POST(request);

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
    await expect(response.json()).resolves.toEqual({ success: true, id: "char-1" });
  });
});
