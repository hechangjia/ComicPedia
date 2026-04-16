import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getTaskSummariesPaginated, getTasksPaginated, getTasksPaginatedByOrigins, upsertTask, clearAllTasks, getAllTaskIds, deleteTasksByIds } from "@/lib/server/db";
import { extractTaskImagesAsync, trashTaskImages } from "@/lib/server/imageExtractor";
import { buildTaskListItem, buildTaskSummaryItem } from "@/lib/server/taskClientView";
import { getTaskRuntime } from "@/lib/server/taskOrchestrator/runtime";
import { buildServerScriptReplayPayload, validateServerReplayPayload } from "@/lib/server/taskOrchestrator/replay";
import { listTaskJobsByTaskId } from "@/lib/server/taskOrchestrator/store";
import type { GenerateRequest, GenerateTask, TaskJobRecord, TaskListItem } from "@/lib/types";
import { getDefaultListOrigins, normalizeTaskOrigin } from "@/lib/taskOrigin";

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** 将 task 精简为列表所需的最小字段集，再转换 file:// 引用 */
async function toListItem(task: GenerateTask) {
  const needsJobFallback = !task.queueSummary || task.comfyuiRemotePendingCount === undefined;
  const taskJobs: TaskJobRecord[] = needsJobFallback ? await listTaskJobsByTaskId(task.id) : [];
  return buildTaskListItem(task, taskJobs);
}

async function toSummaryItem(task: TaskListItem) {
  const needsJobFallback = !task.queueSummary || task.comfyuiRemotePendingCount === undefined;
  const taskJobs: TaskJobRecord[] = needsJobFallback ? await listTaskJobsByTaskId(task.id) : [];
  return buildTaskSummaryItem(task, taskJobs);
}

/** GET /api/tasks — 获取任务列表（支持分页，轻量返回） */
export async function GET(request: NextRequest) {
  try {
    getTaskRuntime();
    const searchParams = request.nextUrl.searchParams;
    const page = parsePositiveInt(searchParams.get("page"), 1);
    const pageSize = Math.min(parsePositiveInt(searchParams.get("pageSize"), 100), 200);
    const view = searchParams.get("view");

    if (view !== "full") {
      const requestedOrigins = searchParams.getAll("origin");
      const origins = requestedOrigins.length > 0
        ? requestedOrigins.map((origin) => normalizeTaskOrigin(origin))
        : getDefaultListOrigins();
      const { items, total } = getTaskSummariesPaginated(page, pageSize, origins);
      const tasks = await Promise.all(items.map(toSummaryItem));
      return NextResponse.json({ tasks, total, page, pageSize });
    }

    const requestedOrigins = searchParams.getAll("origin");
    const { tasks, total } = requestedOrigins.length > 0
      ? getTasksPaginatedByOrigins(page, pageSize, requestedOrigins.map((origin) => normalizeTaskOrigin(origin)))
      : getTasksPaginated(page, pageSize);
    const items = await Promise.all(tasks.map(toListItem));

    return NextResponse.json({ tasks: items, total, page, pageSize });
  } catch (error) {
    console.error("[API /tasks GET]", error);
    return NextResponse.json(
      { error: "获取任务列表失败" },
      { status: 500 },
    );
  }
}

/** POST /api/tasks — 创建/同步任务 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const task = body.task as GenerateTask | undefined;
    const createRequest = body.request as GenerateRequest | undefined;

    if (createRequest) {
      const replayPayload = buildServerScriptReplayPayload(createRequest);
      const replayValidationError = validateServerReplayPayload(createRequest, replayPayload);
      if (replayValidationError) {
        return NextResponse.json(
          { error: replayValidationError },
          { status: 400 },
        );
      }

      const now = new Date();
      const serverTask: GenerateTask = {
        id: randomUUID(),
        origin: "user",
        status: "created",
        progress: 0,
        presetSnapshot: createRequest.presetSnapshot,
        createdAt: now,
        updatedAt: now,
      };
      const persistedTask: GenerateTask & {
        serverScriptReplay: typeof replayPayload;
      } = {
        ...serverTask,
        serverScriptReplay: replayPayload,
      };
      upsertTask(persistedTask);
      getTaskRuntime().enqueueScript(serverTask.id, createRequest);
      return NextResponse.json({ success: true, id: serverTask.id });
    }

    if (!task?.id) {
      return NextResponse.json(
        { error: "缺少 task.id 或 request" },
        { status: 400 },
      );
    }

    // 提取 base64 图片到文件系统（异步，不阻塞事件循环）
    const processed = await extractTaskImagesAsync(task);
    upsertTask(processed);

    return NextResponse.json({ success: true, id: processed.id });
  } catch (error) {
    console.error("[API /tasks POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存任务失败" },
      { status: 500 },
    );
  }
}

/** DELETE /api/tasks — 批量清空所有任务或删除指定任务（软删除，图片移到 .trash/） */
export async function DELETE(request: NextRequest) {
  try {
    let deletedCount = 0;
    let taskIds: string[] = [];
    let requestedExplicitIds = false;

    // 检查是否有请求体（批量删除指定任务）
    const contentType = request.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      try {
        const body = await request.json();
        const hasExplicitIdsContainer = typeof body === "object"
          && body !== null
          && !Array.isArray(body);
        if (!hasExplicitIdsContainer || !Object.prototype.hasOwnProperty.call(body, "ids")) {
          return NextResponse.json(
            { error: "删除请求体必须包含 ids 字符串数组" },
            { status: 400 },
          );
        }
        const hasExplicitIds = hasExplicitIdsContainer
          && Object.prototype.hasOwnProperty.call(body, "ids");
        if (hasExplicitIds) {
          requestedExplicitIds = true;
          if (!Array.isArray(body.ids) || !body.ids.every((id: unknown) => typeof id === "string")) {
            return NextResponse.json(
              { error: "删除请求体中的 ids 必须是字符串数组" },
              { status: 400 },
            );
          }
          taskIds = body.ids;
        }
      } catch {
        return NextResponse.json(
          { error: "删除请求体不是有效 JSON" },
          { status: 400 },
        );
      }
    }

    if (taskIds.length > 0) {
      // 批量删除指定任务
      for (const id of taskIds) {
        trashTaskImages(id);
      }
      deletedCount = deleteTasksByIds(taskIds);
    } else if (!requestedExplicitIds) {
      // 清空所有任务
      taskIds = getAllTaskIds();
      for (const id of taskIds) {
        trashTaskImages(id);
      }
      deletedCount = clearAllTasks();
    }

    return NextResponse.json({ success: true, deleted: deletedCount });
  } catch (error) {
    console.error("[API /tasks DELETE]", error);
    return NextResponse.json(
      { error: "批量删除任务失败" },
      { status: 500 },
    );
  }
}
