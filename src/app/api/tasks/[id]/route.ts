import { NextRequest, NextResponse } from "next/server";
import { getTaskById, upsertTask, deleteTask } from "@/lib/server/db";
import { extractTaskImagesAsync, trashTaskImages, restoreFileRefs, fileRefsToUrls } from "@/lib/server/imageExtractor";
import type { GenerateTask } from "@/lib/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/tasks/[id] — 获取单个任务 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const task = getTaskById(id);
    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    // withImages=base64 时还原为 base64（导出等场景），默认返回 /api/images/ URL
    const withImages = request.nextUrl.searchParams.get("withImages");
    let result: unknown = task;
    if (withImages === "base64") {
      result = restoreFileRefs(task);
    } else if (withImages !== "false") {
      result = fileRefsToUrls(task);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[API /tasks/[id] GET]", error);
    return NextResponse.json(
      { error: "获取任务失败" },
      { status: 500 },
    );
  }
}

/** PUT /api/tasks/[id] — 更新任务 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const task = body.task as GenerateTask;

    if (!task || task.id !== id) {
      return NextResponse.json(
        { error: "task.id 与路由不匹配" },
        { status: 400 },
      );
    }

    const processed = await extractTaskImagesAsync(task);
    upsertTask(processed);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /tasks/[id] PUT]", error);
    return NextResponse.json(
      { error: "更新任务失败" },
      { status: 500 },
    );
  }
}

/** DELETE /api/tasks/[id] — 删除任务（软删除，图片移到 .trash/） */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    // 先读取完整数据用于 trash 记录
    const task = getTaskById(id);
    const existed = deleteTask(id);
    if (existed) {
      trashTaskImages(id, task ?? undefined);
    }
    return NextResponse.json({ success: true, deleted: existed });
  } catch (error) {
    console.error("[API /tasks/[id] DELETE]", error);
    return NextResponse.json(
      { error: "删除任务失败" },
      { status: 500 },
    );
  }
}
