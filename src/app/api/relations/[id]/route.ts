import { NextRequest, NextResponse } from "next/server";
import { getRelationById, upsertRelation, deleteRelation } from "@/lib/server/db";
import type { CharacterRelation } from "@/lib/types";

/** GET /api/relations/[id] — 获取单个关系 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const relation = getRelationById(id);
    if (!relation) {
      return NextResponse.json({ error: "关系不存在" }, { status: 404 });
    }
    return NextResponse.json(relation);
  } catch (error) {
    console.error("[API /relations/[id] GET]", error);
    return NextResponse.json({ error: "获取关系失败" }, { status: 500 });
  }
}

/** PUT /api/relations/[id] — 更新关系 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = getRelationById(id);
    if (!existing) {
      return NextResponse.json({ error: "关系不存在" }, { status: 404 });
    }

    const body = await request.json();
    const updated: CharacterRelation = {
      ...existing,
      ...body,
      id, // prevent ID change
      updatedAt: Date.now(),
    };

    upsertRelation(updated);
    return NextResponse.json({ success: true, relation: updated });
  } catch (error) {
    console.error("[API /relations/[id] PUT]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "更新关系失败" },
      { status: 500 },
    );
  }
}

/** DELETE /api/relations/[id] — 删除关系 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const deleted = deleteRelation(id);
    if (!deleted) {
      return NextResponse.json({ error: "关系不存在" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /relations/[id] DELETE]", error);
    return NextResponse.json({ error: "删除关系失败" }, { status: 500 });
  }
}
