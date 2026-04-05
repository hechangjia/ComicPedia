import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getTasksPaginated, upsertTask, clearAllTasks, getAllTaskIds } from "@/lib/server/db";
import { extractTaskImagesAsync, fileRefsToUrls, trashTaskImages } from "@/lib/server/imageExtractor";
import { getTaskRuntime } from "@/lib/server/taskOrchestrator/runtime";
import { listTaskJobsByTaskId, summarizeTaskJobs } from "@/lib/server/taskOrchestrator/store";
import type { GenerateRequest, GenerateTask } from "@/lib/types";

/** 将 task 精简为列表所需的最小字段集，再转换 file:// 引用 */
async function toListItem(task: GenerateTask) {
  const queueSummary = task.queueSummary ?? summarizeTaskJobs(await listTaskJobsByTaskId(task.id));
  const stripped = {
    id: task.id,
    status: task.status,
    progress: task.progress,
    queueSummary,
    reviewStatus: task.reviewStatus,
    lastReviewAt: task.lastReviewAt,
    visualQualityScore: task.visualQualityScore ? {
      overall: task.visualQualityScore.overall,
      retryRecommendations: task.visualQualityScore.retryRecommendations,
    } : undefined,
    visualRetrySummary: task.visualRetrySummary ? {
      status: task.visualRetrySummary.status,
      finalOverallScore: task.visualRetrySummary.finalOverallScore,
    } : undefined,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    script: task.script ? {
      title: task.script.title,
      topic: task.script.topic,
      style: task.script.style,
      panels: task.script.panels.map(p => ({
        id: p.id,
        status: p.status,
        imageUrl: p.imageUrl,
        scene: p.scene,
        dialogue: p.dialogue,
      })),
    } : undefined,
  };
  return fileRefsToUrls(stripped);
}

/** GET /api/tasks — 获取任务列表（支持分页，轻量返回） */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(Math.max(1, parseInt(searchParams.get("pageSize") || "100")), 200);

    const { tasks, total } = getTasksPaginated(page, pageSize);
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
      const now = new Date();
      const serverTask: GenerateTask = {
        id: randomUUID(),
        status: "created",
        progress: 0,
        presetSnapshot: createRequest.presetSnapshot,
        requestSnapshot: createRequest,
        createdAt: now,
        updatedAt: now,
      };
      upsertTask(serverTask);
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

/** DELETE /api/tasks — 批量清空所有任务（软删除，图片移到 .trash/） */
export async function DELETE() {
  try {
    // 先获取所有任务 ID 用于图片清理
    const taskIds = getAllTaskIds();
    // 逐个软删除图片到回收站
    for (const id of taskIds) {
      trashTaskImages(id);
    }
    // 批量删除数据库记录
    const count = clearAllTasks();
    return NextResponse.json({ success: true, deleted: count });
  } catch (error) {
    console.error("[API /tasks DELETE]", error);
    return NextResponse.json(
      { error: "批量删除任务失败" },
      { status: 500 },
    );
  }
}
