import { NextRequest, NextResponse } from "next/server";
import { getTaskById } from "@/lib/server/db";
import { startDeepReview } from "@/lib/server/taskOrchestrator/deepReviewRunner";
import { approveTaskCalibration, enqueuePanelImageJobs } from "@/lib/server/taskOrchestrator/imageRunner";
import { pauseTaskJobs, reconcileTaskJobs, resumeTaskJobs } from "@/lib/server/taskOrchestrator/reconcile";
import { getTaskRuntime } from "@/lib/server/taskOrchestrator/runtime";
import type { PartialImageGenConfig, PartialLLMConfig } from "@/lib/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface TaskActionRequestBody {
  action?: string;
  panelIndices?: number[];
  forceAll?: boolean;
  imageConfigId?: string;
  imageConfig?: PartialImageGenConfig;
  llmConfig?: PartialLLMConfig;
  vlmConfig?: PartialLLMConfig;
}

function getQueueablePanelIndices(taskId: string, forceAll: boolean): number[] {
  const task = getTaskById(taskId);
  if (!task?.script) {
    throw new Error("任务不存在或脚本尚未生成");
  }

  return task.script.panels
    .map((panel, panelIndex) => ({ panel, panelIndex }))
    .filter(({ panel }) => forceAll || panel.status !== "completed")
    .map(({ panelIndex }) => panelIndex);
}

function sanitizePanelIndices(panelIndices: number[] | undefined, panelCount: number): number[] {
  return [...new Set(panelIndices ?? [])]
    .filter((panelIndex) => Number.isInteger(panelIndex) && panelIndex >= 0 && panelIndex < panelCount)
    .sort((left, right) => left - right);
}

function getActionErrorStatus(error: unknown): number {
  const message = error instanceof Error ? error.message : "";
  if (
    message.includes("缺少可重放的图片配置")
    || message.includes("无有效面板")
    || message.includes("缺少视觉评审配置")
    || message.includes("缺少可重放的视觉评审配置")
    || message.includes("没有可用于深度复审的已生成面板")
  ) {
    return 400;
  }
  if (message.includes("任务脚本尚未生成")) {
    return 409;
  }
  if (message.includes("任务不存在")) {
    return 404;
  }
  return 500;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const task = getTaskById(id);
    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    const body = await request.json() as TaskActionRequestBody;
    const action = body.action;

    if (action === "pause") {
      const updatedTask = await pauseTaskJobs(id);
      return NextResponse.json({
        success: true,
        task: updatedTask,
        queueSummary: updatedTask.queueSummary,
      });
    }

    if (action === "resume") {
      const updatedTask = await resumeTaskJobs(id);
      if (
        updatedTask.status === "image_queue_running"
        || updatedTask.status === "calibrating"
      ) {
        getTaskRuntime().enqueueImageQueue(id);
      }
      if (updatedTask.status === "deep_review_running") {
        getTaskRuntime().enqueueDeepReview(id);
      }
      return NextResponse.json({
        success: true,
        task: updatedTask,
        queueSummary: updatedTask.queueSummary,
      }, { status: 202 });
    }

    if (action === "reconcile") {
      const updatedTask = await reconcileTaskJobs(id);
      if (
        updatedTask.status === "image_queue_running"
        || updatedTask.status === "calibrating"
      ) {
        getTaskRuntime().enqueueImageQueue(id);
      }
      if (updatedTask.status === "deep_review_running") {
        getTaskRuntime().enqueueDeepReview(id);
      }
      return NextResponse.json({
        success: true,
        task: updatedTask,
        queueSummary: updatedTask.queueSummary,
      });
    }

    if (action === "start_deep_review") {
      if (!body.vlmConfig) {
        return NextResponse.json({ error: "缺少视觉评审配置" }, { status: 400 });
      }
      const updatedTask = await startDeepReview(id, {
        panelIndices: body.panelIndices,
        vlmConfig: body.vlmConfig,
      });
      getTaskRuntime().enqueueDeepReview(id);
      return NextResponse.json({
        success: true,
        task: updatedTask,
        queueSummary: updatedTask.queueSummary,
      }, { status: 202 });
    }

    if (action === "approve_image_calibration") {
      const updatedTask = await approveTaskCalibration(id);
      getTaskRuntime().enqueueImageQueue(id);
      return NextResponse.json({
        success: true,
        task: updatedTask,
        enqueuedPanelIndices: [],
        queueSummary: updatedTask.queueSummary,
      }, { status: 202 });
    }

    if (!task.script) {
      return NextResponse.json({ error: "任务脚本尚未生成" }, { status: 409 });
    }

    let panelIndices: number[] = [];
    if (action === "generate_all_images") {
      panelIndices = getQueueablePanelIndices(id, body.forceAll === true);
    } else if (action === "queue_panel_images") {
      panelIndices = sanitizePanelIndices(body.panelIndices, task.script.panels.length);
      if (panelIndices.length === 0) {
        return NextResponse.json({ error: "无有效面板" }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: "不支持的任务操作" }, { status: 400 });
    }

    const result = await enqueuePanelImageJobs(id, {
      panelIndices,
      imageConfigId: body.imageConfigId,
      imageConfig: body.imageConfig,
      llmConfig: body.llmConfig,
    });

    if (result.enqueuedPanelIndices.length > 0) {
      getTaskRuntime().enqueueImageQueue(id);
    }

    return NextResponse.json({
      success: true,
      task: result.task,
      enqueuedPanelIndices: result.enqueuedPanelIndices,
      queueSummary: result.queueSummary,
    }, { status: 202 });
  } catch (error) {
    console.error("[API /tasks/[id]/actions POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "任务操作失败" },
      { status: getActionErrorStatus(error) },
    );
  }
}
