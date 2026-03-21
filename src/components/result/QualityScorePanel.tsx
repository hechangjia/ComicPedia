"use client";

import { useState } from "react";
import type { ComicScript } from "@/lib/types";
import { evaluateQuality, QualityScore } from "@/lib/qualityScore";
import { getStoredConfigs } from "@/hooks/useAPIConfig";

interface QualityScorePanelProps {
  script: ComicScript;
}

const DIMENSION_LABELS: Record<string, string> = {
  knowledge: "知识准确性",
  visualConsistency: "视觉一致性",
  narrativeCoherence: "叙事连贯性",
};

function ScoreBar({ label, score }: { label: string; score: number }) {
  const pct = score * 10;
  const color = score >= 8 ? "bg-green-500" : score >= 6 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{score}/10</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function QualityScorePanel({ script }: QualityScorePanelProps) {
  const [score, setScore] = useState<QualityScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleEvaluate = async () => {
    setLoading(true);
    setError("");
    try {
      const configs = getStoredConfigs();
      const activeLLM = configs.llmConfigs.find((c) => c.id === configs.activeLLMId) || configs.llmConfigs[0];
      if (!activeLLM) throw new Error("未配置 LLM");

      const result = await evaluateQuality(script, {
        apiUrl: activeLLM.apiUrl,
        apiKey: activeLLM.apiKey,
        model: activeLLM.model,
      });
      setScore(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "评分失败");
    } finally {
      setLoading(false);
    }
  };

  if (!score) {
    return (
      <div className="flex justify-center no-print">
        <button
          onClick={handleEvaluate}
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
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl border bg-card space-y-3 no-print">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">AI 质量评分</h3>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-primary">{score.overall}</span>
          <span className="text-xs text-muted-foreground">/10</span>
        </div>
      </div>

      <div className="space-y-2">
        {(["knowledge", "visualConsistency", "narrativeCoherence"] as const).map((key) => (
          <ScoreBar key={key} label={DIMENSION_LABELS[key]} score={score[key]} />
        ))}
      </div>

      {score.suggestions.length > 0 && (
        <div className="pt-2 border-t space-y-1">
          <p className="text-xs font-medium text-muted-foreground">改进建议：</p>
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
        onClick={handleEvaluate}
        disabled={loading}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        {loading ? "重新评分中..." : "重新评分"}
      </button>
    </div>
  );
}
