import { NextRequest, NextResponse } from "next/server";
import { getSeriesById, upsertSeries, deleteSeries } from "@/lib/server/db";
import type { Series } from "@/lib/series";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/series/[id] — 获取单个连载 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const series = getSeriesById(id);
    if (!series) {
      return NextResponse.json({ error: "连载不存在" }, { status: 404 });
    }
    return NextResponse.json(series);
  } catch (error) {
    console.error("[API /series/[id] GET]", error);
    return NextResponse.json(
      { error: "获取连载失败" },
      { status: 500 },
    );
  }
}

/** PUT /api/series/[id] — 更新连载 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const series = body.series as Series;

    if (!series || series.id !== id) {
      return NextResponse.json(
        { error: "series.id 与路由不匹配" },
        { status: 400 },
      );
    }

    upsertSeries(series);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /series/[id] PUT]", error);
    return NextResponse.json(
      { error: "更新连载失败" },
      { status: 500 },
    );
  }
}

/** DELETE /api/series/[id] — 删除连载 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const existed = deleteSeries(id);
    return NextResponse.json({ success: true, deleted: existed });
  } catch (error) {
    console.error("[API /series/[id] DELETE]", error);
    return NextResponse.json(
      { error: "删除连载失败" },
      { status: 500 },
    );
  }
}
