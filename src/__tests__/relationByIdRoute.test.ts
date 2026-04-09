import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getRelationByIdMock = vi.fn();
const upsertRelationMock = vi.fn();
const deleteRelationMock = vi.fn();

vi.mock("@/lib/server/db", () => ({
  getRelationById: getRelationByIdMock,
  upsertRelation: upsertRelationMock,
  deleteRelation: deleteRelationMock,
}));

describe("/api/relations/[id] route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getRelationByIdMock.mockReset();
    upsertRelationMock.mockReset();
    deleteRelationMock.mockReset();
  });

  it("returns 404 when the relation does not exist", async () => {
    getRelationByIdMock.mockReturnValue(null);

    const { GET } = await import("@/app/api/relations/[id]/route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/relations/missing"),
      { params: Promise.resolve({ id: "missing" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "关系不存在" });
  });

  it("updates only allowed fields and clamps strength", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000001234);
    getRelationByIdMock.mockReturnValue({
      id: "rel-1",
      fromId: "char-1",
      toId: "char-2",
      type: "friend",
      label: "Old",
      strength: 0.4,
      bidirectional: true,
      evolution: [],
      createdAt: 1,
      updatedAt: 1,
    });

    const { PUT } = await import("@/app/api/relations/[id]/route");
    const request = new NextRequest("http://localhost:3000/api/relations/rel-1", {
      method: "PUT",
      body: JSON.stringify({
        fromId: "char-x",
        label: "Updated",
        strength: 9,
        type: "ally",
      }),
    });

    const response = await PUT(request, {
      params: Promise.resolve({ id: "rel-1" }),
    });

    expect(response.status).toBe(200);
    expect(upsertRelationMock).toHaveBeenCalledWith({
      id: "rel-1",
      fromId: "char-1",
      toId: "char-2",
      type: "ally",
      label: "Updated",
      strength: 1,
      bidirectional: true,
      evolution: [],
      createdAt: 1,
      updatedAt: 1700000001234,
    });
  });

  it("rejects invalid relation types during updates", async () => {
    getRelationByIdMock.mockReturnValue({
      id: "rel-1",
      fromId: "char-1",
      toId: "char-2",
      type: "friend",
      label: "",
      strength: 0.5,
      bidirectional: true,
      evolution: [],
      createdAt: 1,
      updatedAt: 1,
    });

    const { PUT } = await import("@/app/api/relations/[id]/route");
    const request = new NextRequest("http://localhost:3000/api/relations/rel-1", {
      method: "PUT",
      body: JSON.stringify({ type: "coworker" }),
    });

    const response = await PUT(request, {
      params: Promise.resolve({ id: "rel-1" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "无效的关系类型: coworker",
    });
    expect(upsertRelationMock).not.toHaveBeenCalled();
  });

  it("returns success when deleting an existing relation", async () => {
    deleteRelationMock.mockReturnValue(true);

    const { DELETE } = await import("@/app/api/relations/[id]/route");
    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/relations/rel-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "rel-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });
});
