import { NextRequest, NextResponse } from "next/server";
import { getAllSeriesList, upsertSeries } from "@/lib/server/db";
import type { Series } from "@/lib/series";

/** GET /api/series — 获取所有连载 */
export async function GET() {
  try {
    const seriesList = getAllSeriesList();
    return NextResponse.json(seriesList);
  } catch (error) {
    console.error("[API /series GET]", error);
    return NextResponse.json(
      { error: "获取连载列表失败" },
      { status: 500 },
    );
  }
}

/** POST /api/series — 创建/同步连载 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const series = body.series as Series;

    if (!series?.id) {
      return NextResponse.json(
        { error: "缺少 series.id" },
        { status: 400 },
      );
    }

    upsertSeries(series);

    return NextResponse.json({ success: true, id: series.id });
  } catch (error) {
    console.error("[API /series POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存连载失败" },
      { status: 500 },
    );
  }
}
