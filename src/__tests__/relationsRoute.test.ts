import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getAllRelationsMock = vi.fn();
const upsertRelationMock = vi.fn();

vi.mock("@/lib/server/db", () => ({
  getAllRelations: getAllRelationsMock,
  upsertRelation: upsertRelationMock,
}));

describe("/api/relations route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getAllRelationsMock.mockReset();
    upsertRelationMock.mockReset();
  });

  it("returns all relations from the database", async () => {
    getAllRelationsMock.mockReturnValue([
      { id: "rel-1", fromId: "char-1", toId: "char-2", type: "friend" },
    ]);

    const { GET } = await import("@/app/api/relations/route");
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { id: "rel-1", fromId: "char-1", toId: "char-2", type: "friend" },
    ]);
  });

  it("rejects relation creation when required fields are missing", async () => {
    const { POST } = await import("@/app/api/relations/route");
    const request = new NextRequest("http://localhost:3000/api/relations", {
      method: "POST",
      body: JSON.stringify({ fromId: "char-1", type: "friend" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "缺少必要字段: fromId, toId, type",
    });
    expect(upsertRelationMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported relation types", async () => {
    const { POST } = await import("@/app/api/relations/route");
    const request = new NextRequest("http://localhost:3000/api/relations", {
      method: "POST",
      body: JSON.stringify({ fromId: "char-1", toId: "char-2", type: "coworker" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "无效的关系类型: coworker",
    });
    expect(upsertRelationMock).not.toHaveBeenCalled();
  });

  it("creates a normalized relation payload", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);
    vi.spyOn(Math, "random").mockReturnValue(0.123456789);

    const { POST } = await import("@/app/api/relations/route");
    const request = new NextRequest("http://localhost:3000/api/relations", {
      method: "POST",
      body: JSON.stringify({
        fromId: "char-1",
        toId: "char-2",
        type: "ally",
        strength: 3,
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(upsertRelationMock).toHaveBeenCalledWith(expect.objectContaining({
      id: expect.stringMatching(/^rel_1700000000000_/),
      fromId: "char-1",
      toId: "char-2",
      type: "ally",
      label: "",
      strength: 1,
      bidirectional: true,
      evolution: [],
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    }));
    expect(body).toEqual({
      success: true,
      id: expect.stringMatching(/^rel_1700000000000_/),
      relation: expect.objectContaining({
        fromId: "char-1",
        toId: "char-2",
        type: "ally",
        strength: 1,
      }),
    });
  });
});
