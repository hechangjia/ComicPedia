import { NextRequest, NextResponse } from "next/server";
import { upsertTask, upsertCharacter } from "@/lib/server/db";
import {
  restoreFromTrash,
  permanentlyDeleteTrashItem,
  extractTaskImages,
  extractCharacterImages,
} from "@/lib/server/imageExtractor";
import type { GenerateTask, Character } from "@/lib/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** POST /api/trash/[id] — 恢复回收站中的某条记录 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const restored = restoreFromTrash(id);
    if (!restored) {
      return NextResponse.json({ error: "回收站中未找到该记录" }, { status: 404 });
    }

    // 将恢复的数据写回对应表
    if (restored.type === "task") {
      const task = restored.data as GenerateTask;
      // 重新提取图片引用以重建 images 表记录
      const processed = extractTaskImages(task);
      upsertTask(processed);
    } else {
      const char = restored.data as Character;
      const processed = extractCharacterImages(char);
      upsertCharacter(processed);
    }

    return NextResponse.json({
      success: true,
      type: restored.type,
    });
  } catch (error) {
    console.error("[API /trash/[id] POST]", error);
    return NextResponse.json({ error: "恢复失败" }, { status: 500 });
  }
}

/** DELETE /api/trash/[id] — 永久删除回收站中的某条记录 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const deleted = permanentlyDeleteTrashItem(id);
    if (!deleted) {
      return NextResponse.json({ error: "回收站中未找到该记录" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /trash/[id] DELETE]", error);
    return NextResponse.json({ error: "永久删除失败" }, { status: 500 });
  }
}
