import { NextRequest, NextResponse } from "next/server";
import { getTaskById, upsertTask, deleteTask, patchTask } from "@/lib/server/db";
import { extractTaskImagesAsync, trashTaskImages, restoreFileRefs, fileRefsToUrls } from "@/lib/server/imageExtractor";
import { getTaskRuntime } from "@/lib/server/taskOrchestrator/runtime";
import { countRecoverableComfyJobs } from "@/lib/server/taskOrchestrator/queueMeta";
import { listTaskJobsByTaskId, summarizeTaskJobs } from "@/lib/server/taskOrchestrator/store";
import type { GenerateTask, TaskJobRecord } from "@/lib/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/tasks/[id] — 获取单个任务 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    getTaskRuntime();
    const { id } = await params;
    const task = getTaskById(id);
    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }
    const {
      serverScriptReplay: _serverScriptReplay,
      requestSnapshot: _requestSnapshot,
      ...taskForClient
    } = task as GenerateTask & {
      serverScriptReplay?: unknown;
      requestSnapshot?: unknown;
    };
    const taskJobs = await listTaskJobsByTaskId(task.id);
    const enrichedTask: GenerateTask & {
      queueJobs: Array<Omit<TaskJobRecord, "payload">>;
    } = {
      ...taskForClient,
      queueSummary: task.queueSummary ?? summarizeTaskJobs(taskJobs),
      comfyuiRemotePendingCount: task.comfyuiRemotePendingCount ?? countRecoverableComfyJobs(taskJobs),
      queueJobs: taskJobs.map(({ payload: _payload, ...job }) => job),
    };

    // withImages=base64 时还原为 base64（导出等场景），默认返回 /api/images/ URL
    const withImages = request.nextUrl.searchParams.get("withImages");
    let result: unknown = enrichedTask;
    if (withImages === "base64") {
      result = restoreFileRefs(enrichedTask);
    } else if (withImages !== "false") {
      result = fileRefsToUrls(enrichedTask);
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

/** PATCH /api/tasks/[id] — 部分更新任务（tags, favorited） */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const patch: { tags?: string[]; favorited?: boolean } = {};

    if (Array.isArray(body.tags)) {
      patch.tags = body.tags.filter((t: unknown) => typeof t === "string");
    }
    if (typeof body.favorited === "boolean") {
      patch.favorited = body.favorited;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "无有效更新字段" }, { status: 400 });
    }

    const updated = patchTask(id, patch);
    if (!updated) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /tasks/[id] PATCH]", error);
    return NextResponse.json({ error: "更新任务失败" }, { status: 500 });
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
