import type { GenerateTask } from "@/lib/types";
import { QUALITY_LABEL_MAP } from "@/lib/config/quality";

export interface PhaseInfo {
  name: string;
  status: "done" | "skipped" | "failed";
  detail?: string;
}

export function getPipelinePhases(task: GenerateTask): PhaseInfo[] {
  const phases: PhaseInfo[] = [];
  const quality = task.generationConfig?.quality || "standard";
  const isFast = quality === "fast";

  if (!isFast) {
    const hasResearch = !!task.topicResearch;
    const wikiUsed = task.topicResearch?.keyFacts?.some((fact) => fact.startsWith("[Wikipedia]"));
    phases.push({
      name: "主题研究",
      status: hasResearch ? "done" : "skipped",
      detail: hasResearch
        ? `${task.topicResearch!.keyFacts.length} 个知识点${wikiUsed ? " + Wikipedia" : ""}`
        : undefined,
    });
  }

  if (!isFast && task.researchBrief) {
    phases.push({
      name: "准确性研究",
      status: task.researchBrief.safeToGenerate ? "done" : "failed",
      detail: `${task.researchBrief.verifiedHardFactCount} 个硬事实 / ${task.researchBrief.sourceTiersUsed.join(", ") || "无来源"}`,
    });
  }

  if (!isFast) {
    const hasOutline = !!task.narrativeOutline;
    const firstShotIntent = task.narrativeOutline?.panels.find((panel) => panel.shotIntent)?.shotIntent;
    phases.push({
      name: "叙事大纲",
      status: hasOutline ? "done" : "skipped",
      detail: hasOutline
        ? `${task.narrativeOutline!.totalPanels} 格 / ${task.narrativeOutline!.templateType}${firstShotIntent ? ` / ${firstShotIntent}` : ""}`
        : undefined,
    });
  }

  phases.push({
    name: "脚本生成",
    status: task.script ? "done" : "failed",
    detail: task.script ? `${task.script.panels.length} 格 / ${task.script.style}` : undefined,
  });

  if (task.scriptValidation) {
    const warnCount = task.scriptValidation.warnings.length;
    const repairRounds = task.scriptRepairRounds || 0;
    phases.push({
      name: "脚本校验",
      status: "done",
      detail: warnCount === 0
        ? "无问题"
        : `${warnCount} 个警告${repairRounds > 0 ? ` / 修复 ${repairRounds} 轮` : ""}`,
    });
  }

  if (task.accuracyReview || task.accuracyErrorSummary) {
    const review = task.accuracyReview;
    const blocked = task.accuracyErrorSummary;
    phases.push({
      name: "事实校验",
      status: blocked || review?.status === "blocked"
        ? "failed"
        : review?.status === "passed"
          ? "done"
          : "skipped",
      detail: blocked
        ? `${blocked.blockingIssueCount} 个阻塞问题`
        : review?.status === "passed"
          ? "通过"
          : review?.status === "repair_required"
            ? `${review.repairableIssueCount} 个待修复问题`
            : undefined,
    });
  }

  if (task.script) {
    const completed = task.script.panels.filter((panel) => panel.status === "completed").length;
    const failed = task.script.panels.filter((panel) => panel.status === "failed").length;
    phases.push({
      name: "图片生成",
      status: failed > 0 ? "failed" : completed === task.script.panels.length ? "done" : "skipped",
      detail: `${completed}/${task.script.panels.length} 完成${failed > 0 ? ` / ${failed} 失败` : ""}`,
    });
  }

  if (task.qualityScore) {
    phases.push({
      name: "文本评分",
      status: "done",
      detail: `${task.qualityScore.overall}/10`,
    });
  }

  if (task.visualQualityScore) {
    const retryCount = task.visualQualityScore.retryRecommendations.length;
    phases.push({
      name: "视觉评审",
      status: "done",
      detail: `${task.visualQualityScore.overall}/10${retryCount > 0 ? ` / ${retryCount} 面板建议修复` : ""}`,
    });
  }

  return phases;
}

export function getPipelineSummaryLabel(task: GenerateTask): string {
  const quality = task.generationConfig?.quality || "standard";
  const qualityLabel = QUALITY_LABEL_MAP[quality] || quality;
  const phases = getPipelinePhases(task);
  return `Agent 管线摘要 (${qualityLabel}模式 / ${phases.filter((phase) => phase.status === "done").length}/${phases.length} 阶段)`;
}
