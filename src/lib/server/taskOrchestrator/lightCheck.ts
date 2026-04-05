import type { GenerateTask, PanelReview, PartialLLMConfig } from "@/lib/types";
import { invalidateDiagnosis } from "@/lib/vlmDiagnosisState";
import { evaluateSinglePanelVisualQuality } from "@/lib/vlmScorer";

function buildLightCheckTaskReviewStatus(task: GenerateTask, panelReview: PanelReview[]): GenerateTask["reviewStatus"] {
  if (panelReview.some((panel) => panel.status !== "reviewed")) {
    return "needs_repair";
  }

  const totalPanels = task.script?.panels.length ?? 0;
  return panelReview.length >= totalPanels ? "reviewed" : "unreviewed";
}

export async function runPanelLightCheck(
  task: GenerateTask,
  panelIndex: number,
  vlmConfig: PartialLLMConfig,
): Promise<GenerateTask> {
  if (!task.script) {
    throw new Error("Task script missing");
  }

  const score = await evaluateSinglePanelVisualQuality(task.script, panelIndex, vlmConfig);
  const nextReview: PanelReview = {
    panelIndex,
    score: score.overall,
    status: score.overall < 6 ? "needs_repair" : "reviewed",
    issues: score.issues,
  };
  const existingReview = (task.panelReview ?? []).filter((review) => review.panelIndex !== panelIndex);

  task.panelReview = [...existingReview, nextReview].sort((left, right) => left.panelIndex - right.panelIndex);
  task.reviewStatus = buildLightCheckTaskReviewStatus(task, task.panelReview);
  task.lastReviewAt = new Date().toISOString();
  invalidateDiagnosis(task);
  return task;
}
