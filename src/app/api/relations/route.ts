import { NextRequest, NextResponse } from "next/server";
import { getAllRelations, upsertRelation } from "@/lib/server/db";
import type { CharacterRelation } from "@/lib/types";

const VALID_RELATION_TYPES = new Set([
  "friend", "rival", "mentor", "lover", "family", "ally", "enemy",
]);

/** GET /api/relations — 获取所有角色关系 */
export async function GET() {
  try {
    const relations = getAllRelations();
    return NextResponse.json(relations);
  } catch (error) {
    console.error("[API /relations GET]", error);
    return NextResponse.json({ error: "获取关系列表失败" }, { status: 500 });
  }
}

/** POST /api/relations — 创建/更新角色关系 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const relation = body as Partial<CharacterRelation>;

    if (
      !relation.fromId ||
      typeof relation.fromId !== "string" ||
      !relation.toId ||
      typeof relation.toId !== "string" ||
      !relation.type
    ) {
      return NextResponse.json(
        { error: "缺少必要字段: fromId, toId, type" },
        { status: 400 },
      );
    }

    if (!VALID_RELATION_TYPES.has(relation.type)) {
      return NextResponse.json(
        { error: `无效的关系类型: ${relation.type}` },
        { status: 400 },
      );
    }

    const now = Date.now();
    const full: CharacterRelation = {
      id: relation.id || `rel_${now}_${Math.random().toString(36).slice(2, 8)}`,
      fromId: relation.fromId,
      toId: relation.toId,
      type: relation.type,
      label: relation.label ?? "",
      strength: Math.max(0, Math.min(1, relation.strength ?? 0.5)),
      bidirectional: relation.bidirectional ?? true,
      evolution: relation.evolution ?? [],
      createdAt: relation.createdAt ?? now,
      updatedAt: now,
    };

    upsertRelation(full);
    return NextResponse.json({ success: true, id: full.id, relation: full });
  } catch (error) {
    console.error("[API /relations POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存关系失败" },
      { status: 500 },
    );
  }
}
