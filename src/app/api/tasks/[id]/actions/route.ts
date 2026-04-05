import { NextRequest, NextResponse } from "next/server";
import { getTaskById } from "@/lib/server/db";
import { approveTaskCalibration, enqueuePanelImageJobs } from "@/lib/server/taskOrchestrator/imageRunner";
import { getTaskRuntime } from "@/lib/server/taskOrchestrator/runtime";
import type { PartialImageGenConfig, PartialLLMConfig } from "@/lib/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface TaskActionRequestBody {
  action?: string;
  panelIndices?: number[];
  forceAll?: boolean;
  imageConfig?: PartialImageGenConfig;
  llmConfig?: PartialLLMConfig;
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

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const task = getTaskById(id);
    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    const body = await request.json() as TaskActionRequestBody;
    const action = body.action;

    if (action === "approve_image_calibration") {
      const updatedTask = await approveTaskCalibration(id);
      getTaskRuntime().enqueueImageQueue(id, {
        imageConfig: body.imageConfig,
        llmConfig: body.llmConfig,
      });
      return NextResponse.json({
        success: true,
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
    } else {
      return NextResponse.json({ error: "不支持的任务操作" }, { status: 400 });
    }

    const result = await enqueuePanelImageJobs(id, {
      panelIndices,
      imageConfig: body.imageConfig,
      llmConfig: body.llmConfig,
    });

    if (result.enqueuedPanelIndices.length > 0) {
      getTaskRuntime().enqueueImageQueue(id, {
        imageConfig: body.imageConfig,
        llmConfig: body.llmConfig,
      });
    }

    return NextResponse.json({
      success: true,
      enqueuedPanelIndices: result.enqueuedPanelIndices,
      queueSummary: result.queueSummary,
    }, { status: 202 });
  } catch (error) {
    console.error("[API /tasks/[id]/actions POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "任务操作失败" },
      { status: 500 },
    );
  }
}
