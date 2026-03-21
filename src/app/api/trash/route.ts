import { NextResponse } from "next/server";
import { getAllTrash, clearTrash } from "@/lib/server/db";
import { purgeAllTrash } from "@/lib/server/imageStorage";

/** GET /api/trash — 获取回收站列表 */
export async function GET() {
  try {
    const items = getAllTrash();
    // 不返回完整 data 字段（太大），只返回摘要
    const summary = items.map((item) => ({
      id: item.id,
      type: item.type,
      name: item.name,
      deletedAt: item.deletedAt,
    }));
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[API /trash GET]", error);
    return NextResponse.json({ error: "获取回收站失败" }, { status: 500 });
  }
}

/** DELETE /api/trash — 清空回收站（永久删除所有） */
export async function DELETE() {
  try {
    const count = clearTrash();
    const { dirs, files } = purgeAllTrash();
    return NextResponse.json({
      success: true,
      deletedRecords: count,
      deletedDirs: dirs,
      deletedFiles: files,
    });
  } catch (error) {
    console.error("[API /trash DELETE]", error);
    return NextResponse.json({ error: "清空回收站失败" }, { status: 500 });
  }
}
