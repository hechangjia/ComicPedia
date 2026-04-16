import { NextRequest, NextResponse } from "next/server";
import { executeTaskHealthCleanup } from "@/lib/server/taskMaintenance";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const snapshot = Array.isArray(body.snapshot) ? body.snapshot : [];
    const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor : "settings";

    if (snapshot.length === 0) {
      return NextResponse.json({ error: "缺少 cleanup snapshot" }, { status: 400 });
    }

    return NextResponse.json(executeTaskHealthCleanup(snapshot, actor));
  } catch (error) {
    console.error("[API /admin/task-health/execute]", error);
    return NextResponse.json({ error: "执行任务清理失败" }, { status: 500 });
  }
}
