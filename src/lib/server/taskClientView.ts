import { fileRefsToUrls, restoreFileRefs } from "@/lib/server/imageExtractor";
import { countRecoverableComfyJobs } from "@/lib/server/taskOrchestrator/queueMeta";
import { summarizeTaskJobs } from "@/lib/server/taskOrchestrator/store";
import { attachTaskStateAuthority } from "@/lib/taskStateAuthority";
import type { GenerateTask, TaskJobRecord } from "@/lib/types";

function normalizeTaskJobs(taskJobs: TaskJobRecord[] | undefined): TaskJobRecord[] {
  return Array.isArray(taskJobs) ? taskJobs : [];
}

export function buildTaskListItem(task: GenerateTask, taskJobs: TaskJobRecord[] | undefined) {
  const jobs = normalizeTaskJobs(taskJobs);
  const stripped = attachTaskStateAuthority({
    id: task.id,
    status: task.status,
    progress: task.progress,
    queueSummary: task.queueSummary ?? summarizeTaskJobs(jobs),
    comfyuiRemotePendingCount: task.comfyuiRemotePendingCount ?? countRecoverableComfyJobs(jobs),
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
      panels: task.script.panels.map((panel) => ({
        id: panel.id,
        status: panel.status,
        imageUrl: panel.imageUrl,
        scene: panel.scene,
        dialogue: panel.dialogue,
      })),
    } : undefined,
  });

  return fileRefsToUrls(stripped);
}

export function buildTaskDetailResponse(
  task: GenerateTask,
  taskJobs: TaskJobRecord[] | undefined,
  withImages: string | null,
) {
  const jobs = normalizeTaskJobs(taskJobs);
  const enrichedTask = attachTaskStateAuthority({
    ...task,
    queueSummary: task.queueSummary ?? summarizeTaskJobs(jobs),
    comfyuiRemotePendingCount: task.comfyuiRemotePendingCount ?? countRecoverableComfyJobs(jobs),
    queueJobs: jobs.map(({ payload: _payload, ...job }) => job),
  });

  if (withImages === "base64") {
    return restoreFileRefs(enrichedTask);
  }
  if (withImages !== "false") {
    return fileRefsToUrls(enrichedTask);
  }
  return enrichedTask;
}
