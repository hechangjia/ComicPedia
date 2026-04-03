"use client";

import { ScoreBar } from "./ScoreBar";
import { DIMENSION_LABELS } from "./constants";
import type { QualityScore } from "@/lib/qualityScore";

interface TextScoreSectionProps {
  score: QualityScore | null;
  loading: boolean;
  error: string;
  onEvaluate: () => void;
}

export function TextScoreSection({ score, loading, error, onEvaluate }: TextScoreSectionProps) {
  if (!score) {
    return (
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={onEvaluate}
          disabled={loading}
          className="px-4 py-2 text-sm border rounded-lg hover:bg-accent transition-colors flex items-center gap-2 min-h-[40px] disabled:opacity-50"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              AI 评分中...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              AI 质量评分
            </>
          )}
        </button>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground">脚本评分</h4>
        <div className="flex items-center gap-1">
          <span className="text-lg font-bold text-primary">{score.overall}</span>
          <span className="text-xs text-muted-foreground">/10</span>
        </div>
      </div>

      <div className="space-y-2">
        {(["knowledge", "visualConsistency", "narrativeCoherence", "compositionDiversity"] as const).map((key) => (
          <ScoreBar key={key} label={DIMENSION_LABELS[key]} score={score[key]} />
        ))}
      </div>

      {score.suggestions.length > 0 && (
        <div className="pt-2 border-t space-y-1">
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {score.suggestions.map((s, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-primary shrink-0">-</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={onEvaluate}
        disabled={loading}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        {loading ? "重新评分中..." : "重新评分"}
      </button>
    </div>
  );
}
