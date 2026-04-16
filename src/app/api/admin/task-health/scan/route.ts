import { NextResponse } from "next/server";
import { scanTaskHealth } from "@/lib/server/taskMaintenance";

export async function POST() {
  try {
    return NextResponse.json(scanTaskHealth());
  } catch (error) {
    console.error("[API /admin/task-health/scan]", error);
    return NextResponse.json({ error: "扫描任务健康状态失败" }, { status: 500 });
  }
}
