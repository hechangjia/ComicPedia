import { NextRequest, NextResponse } from "next/server";
import { getRelationById, upsertRelation, deleteRelation } from "@/lib/server/db";
import type { CharacterRelation } from "@/lib/types";

const VALID_RELATION_TYPES = new Set([
  "friend", "rival", "mentor", "lover", "family", "ally", "enemy",
]);

const ALLOWED_UPDATE_FIELDS = new Set([
  "type", "label", "strength", "bidirectional", "evolution",
]);

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

    // Whitelist allowed fields
    const patch: Partial<CharacterRelation> = {};
    for (const key of Object.keys(body)) {
      if (ALLOWED_UPDATE_FIELDS.has(key)) {
        (patch as Record<string, unknown>)[key] = body[key];
      }
    }

    // Validate type if provided
    if (patch.type !== undefined && !VALID_RELATION_TYPES.has(patch.type)) {
      return NextResponse.json(
        { error: `无效的关系类型: ${patch.type}` },
        { status: 400 },
      );
    }

    // Clamp strength if provided
    if (patch.strength !== undefined) {
      patch.strength = Math.max(0, Math.min(1, patch.strength));
    }

    const updated: CharacterRelation = {
      ...existing,
      ...patch,
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
