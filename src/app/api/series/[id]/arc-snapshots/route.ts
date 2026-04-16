import { NextRequest, NextResponse } from "next/server";
import { getSeriesById, getEpisodeArcSnapshots } from "@/lib/server/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/series/[id]/arc-snapshots?characterNames=Alice,Bob */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const series = getSeriesById(id);
    if (!series) {
      return NextResponse.json({ error: "连载不存在" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const characterNames = searchParams.get("characterNames")?.split(",").filter(Boolean) ?? [];
    if (characterNames.length === 0) {
      return NextResponse.json({ error: "缺少 characterNames 参数" }, { status: 400 });
    }

    const taskIds = series.episodes.map(ep => ep.taskId);
    const snapshots = getEpisodeArcSnapshots(taskIds, characterNames);

    return NextResponse.json(snapshots);
  } catch (error) {
    console.error("[API /series/[id]/arc-snapshots GET]", error);
    return NextResponse.json({ error: "获取弧线快照失败" }, { status: 500 });
  }
}
