"use client";

import type { GenerateTask } from "@/lib/types";

interface CompositeScoreProps {
  task: GenerateTask;
}

/**
 * Derive an accuracy score from the review result.
 * AccuracyReviewResult has no `overallScore`, so we synthesize one:
 * - passed: 9
 * - repair_required: 5 (minus 0.5 per repairable issue, floor 3)
 * - blocked: 2
 */
function deriveAccuracyScore(task: GenerateTask): number | null {
  const review = task.accuracyReview;
  if (!review) return null;
  if (review.status === "passed") return 9;
  if (review.status === "blocked") return 2;
  // repair_required
  return Math.max(3, 5 - (review.repairableIssueCount ?? 0) * 0.5);
}

/** Compute weighted composite score with redistribution for missing dimensions */
function computeComposite(task: GenerateTask): {
  score: number;
  qualityScore: number | null;
  accuracyScore: number | null;
  vlmScore: number | null;
  issueCount: number;
} {
  const qs = task.qualityScore?.overall ?? null;
  const as_ = deriveAccuracyScore(task);
  const vs = task.visualQualityScore?.overall ?? null;

  const weights = { quality: 0.4, accuracy: 0.3, vlm: 0.3 };
  const entries: { key: string; value: number; weight: number }[] = [];
  if (qs !== null) entries.push({ key: "quality", value: qs, weight: weights.quality });
  if (as_ !== null) entries.push({ key: "accuracy", value: as_, weight: weights.accuracy });
  if (vs !== null) entries.push({ key: "vlm", value: vs, weight: weights.vlm });

  let score = 0;
  if (entries.length > 0) {
    const totalWeight = entries.reduce((s, e) => s + e.weight, 0);
    score = entries.reduce((s, e) => s + (e.value * e.weight) / totalWeight, 0);
  }

  // Count issues
  let issueCount = 0;
  if (task.scriptValidation?.warnings) {
    issueCount += task.scriptValidation.warnings.filter(w => w.severity === "critical" || w.severity === "warning").length;
  }
  if (task.accuracyReview?.status === "repair_required" || task.accuracyReview?.status === "blocked") {
    issueCount += task.accuracyReview.repairableIssueCount ?? 0;
  }
  if (task.visualDiagnosisReport?.summary) {
    issueCount += task.visualDiagnosisReport.summary.highSeverityCount;
  }

  return {
    score: Math.round(score * 10) / 10,
    qualityScore: qs,
    accuracyScore: as_,
    vlmScore: vs,
    issueCount,
  };
}

function scoreColor(score: number): string {
  if (score >= 8) return "text-green-600 dark:text-green-400";
  if (score >= 6) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function dotColor(score: number | null): string {
  if (score === null) return "bg-gray-300 dark:bg-gray-600";
  if (score >= 8) return "bg-green-500";
  if (score >= 6) return "bg-yellow-500";
  return "bg-red-500";
}

function barColor(score: number): string {
  if (score >= 8) return "bg-green-500";
  if (score >= 6) return "bg-yellow-500";
  return "bg-red-500";
}

export { computeComposite };

export function CompositeScore({ task }: CompositeScoreProps) {
  const { score, qualityScore, accuracyScore, vlmScore, issueCount } = computeComposite(task);

  // Don't show if no scores available at all
  if (qualityScore === null && accuracyScore === null && vlmScore === null) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 justify-center no-print">
      {/* Score number */}
      <span className={`text-lg font-bold tabular-nums ${scoreColor(score)}`}>
        {score.toFixed(1)}/10
      </span>

      {/* Progress bar */}
      <div className="w-32 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor(score)}`}
          style={{ width: `${Math.min(score * 10, 100)}%` }}
        />
      </div>

      {/* Dimension dots */}
      <div className="flex items-center gap-1.5" title="文本质量 / 准确性 / 视觉质量">
        <span className={`w-2 h-2 rounded-full ${dotColor(qualityScore)}`} />
        <span className={`w-2 h-2 rounded-full ${dotColor(accuracyScore)}`} />
        <span className={`w-2 h-2 rounded-full ${dotColor(vlmScore)}`} />
      </div>

      {/* Issue badge */}
      {issueCount > 0 && (
        <span className="px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-[10px] font-medium">
          {issueCount} 项问题
        </span>
      )}
    </div>
  );
}
