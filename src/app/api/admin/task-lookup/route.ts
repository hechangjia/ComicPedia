import { NextRequest, NextResponse } from "next/server";
import { lookupTaskRecords } from "@/lib/server/taskMaintenance";

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("q") ?? "";
    if (!query.trim()) {
      return NextResponse.json({ active: [], trash: [] });
    }

    return NextResponse.json(lookupTaskRecords(query));
  } catch (error) {
    console.error("[API /admin/task-lookup]", error);
    return NextResponse.json({ error: "查找作品失败" }, { status: 500 });
  }
}
