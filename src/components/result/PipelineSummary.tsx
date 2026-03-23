"use client";

import type { GenerateTask } from "@/lib/types";
import { QUALITY_LABEL_MAP } from "@/lib/config/quality";

interface PipelineSummaryProps {
  task: GenerateTask;
}

interface PhaseInfo {
  name: string;
  status: "done" | "skipped" | "failed";
  detail?: string;
}

function getPhases(task: GenerateTask): PhaseInfo[] {
  const phases: PhaseInfo[] = [];
  const quality = task.generationConfig?.quality || "standard";
  const isFast = quality === "fast";

  // Phase 0: Research
  if (!isFast) {
    const hasResearch = !!task.topicResearch;
    const wikiUsed = task.topicResearch?.keyFacts?.some(f => f.startsWith("[Wikipedia]"));
    phases.push({
      name: "主题研究",
      status: hasResearch ? "done" : "skipped",
      detail: hasResearch
        ? `${task.topicResearch!.keyFacts.length} 个知识点${wikiUsed ? " + Wikipedia" : ""}`
        : undefined,
    });
  }

  // Phase 0.5: Director
  if (!isFast) {
    const hasOutline = !!task.narrativeOutline;
    phases.push({
      name: "叙事大纲",
      status: hasOutline ? "done" : "skipped",
      detail: hasOutline
        ? `${task.narrativeOutline!.totalPanels} 格 / ${task.narrativeOutline!.narrativeArc?.slice(0, 30) || ""}...`
        : undefined,
    });
  }

  // Phase 1: Script
  phases.push({
    name: "脚本生成",
    status: task.script ? "done" : "failed",
    detail: task.script ? `${task.script.panels.length} 格 / ${task.script.style}` : undefined,
  });

  // Validator + Repair
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

  // Phase 2: Images
  if (task.script) {
    const completed = task.script.panels.filter(p => p.status === "completed").length;
    const failed = task.script.panels.filter(p => p.status === "failed").length;
    phases.push({
      name: "图片生成",
      status: failed > 0 ? "failed" : completed === task.script.panels.length ? "done" : "skipped",
      detail: `${completed}/${task.script.panels.length} 完成${failed > 0 ? ` / ${failed} 失败` : ""}`,
    });
  }

  // Phase 3: Quality scores
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

export function PipelineSummary({ task }: PipelineSummaryProps) {
  const phases = getPhases(task);
  const quality = task.generationConfig?.quality || "standard";
  const qualityLabel = QUALITY_LABEL_MAP[quality] || quality;

  if (phases.length === 0) return null;

  return (
    <details className="text-left mx-auto max-w-lg no-print">
      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
        Agent 管线摘要 ({qualityLabel}模式 / {phases.filter(p => p.status === "done").length}/{phases.length} 阶段)
      </summary>
      <div className="mt-2 p-3 rounded-lg bg-muted/50 text-xs space-y-1.5">
        {phases.map((phase, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] shrink-0 ${
              phase.status === "done" ? "bg-green-500 text-white" :
              phase.status === "failed" ? "bg-red-500 text-white" :
              "bg-muted-foreground/20 text-muted-foreground"
            }`}>
              {phase.status === "done" ? (
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : phase.status === "failed" ? "!" : "-"}
            </span>
            <span className={`font-medium ${phase.status === "done" ? "text-foreground/80" : "text-muted-foreground/60"}`}>
              {phase.name}
            </span>
            {phase.detail && (
              <span className="text-muted-foreground/50 ml-auto text-[10px]">{phase.detail}</span>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
