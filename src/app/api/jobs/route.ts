import { NextRequest, NextResponse } from "next/server";
import {
  createJob,
  getJobsByTaskId,
  getJobById,
  claimNextJob,
  completeJob,
  failJob,
} from "@/lib/server/db";

/** GET /api/jobs?taskId=xxx — 获取任务关联的 jobs */
export async function GET(request: NextRequest) {
  try {
    const taskId = request.nextUrl.searchParams.get("taskId");
    const jobId = request.nextUrl.searchParams.get("id");

    if (jobId) {
      const job = getJobById(jobId);
      if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
      return NextResponse.json(job);
    }

    if (taskId) {
      const jobs = getJobsByTaskId(taskId);
      return NextResponse.json({ jobs });
    }

    // Claim next pending job (for worker polling)
    const next = claimNextJob();
    return NextResponse.json({ job: next });
  } catch (error) {
    console.error("[API /jobs GET]", error);
    return NextResponse.json({ error: "Failed to get jobs" }, { status: 500 });
  }
}

/** POST /api/jobs — 创建新 job */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, type, payload, priority, maxAttempts } = body;

    if (!taskId || !type || !payload) {
      return NextResponse.json(
        { error: "Missing required fields: taskId, type, payload" },
        { status: 400 }
      );
    }

    const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    createJob({ id, taskId, type, priority, payload: JSON.stringify(payload), maxAttempts });

    return NextResponse.json({ id, status: "pending" }, { status: 201 });
  } catch (error) {
    console.error("[API /jobs POST]", error);
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
  }
}

/** PUT /api/jobs — 更新 job 状态 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, result, error } = body;

    if (!id || !status) {
      return NextResponse.json({ error: "Missing id and status" }, { status: 400 });
    }

    if (status === "completed" && result !== undefined) {
      completeJob(id, JSON.stringify(result));
    } else if (status === "failed" && error) {
      failJob(id, error);
    } else {
      return NextResponse.json({ error: "Invalid status update" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /jobs PUT]", error);
    return NextResponse.json({ error: "Failed to update job" }, { status: 500 });
  }
}
