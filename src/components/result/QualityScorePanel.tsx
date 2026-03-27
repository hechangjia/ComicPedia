"use client";

import { useEffect, useState } from "react";
import type { ComicScript, VisualDiagnosisReport, VisualDiagnosisState, VisualQualityScore, PartialLLMConfig, UserLLMConfig } from "@/lib/types";
import { evaluateQuality, type QualityScore } from "@/lib/qualityScore";
import { evaluateVisualQuality } from "@/lib/vlmScorer";
import { getStoredConfigs } from "@/hooks/useAPIConfig";
import { generatePromptPatch, applyPromptPatch, shouldAutoRetry, type PromptPatch } from "@/lib/vlmRetry";
import { VisualDiagnosisWorkbench } from "./VisualDiagnosisWorkbench";

interface QualityScorePanelProps {
  script: ComicScript;
  cachedScore?: QualityScore | null;
  cachedVisualScore?: VisualQualityScore | null;
  cachedVisualDiagnosisReport?: VisualDiagnosisReport | null;
  cachedVisualDiagnosisState?: VisualDiagnosisState;
  cachedVisualDiagnosisStale?: boolean;
  onSaveQualityScore?: (score: QualityScore) => Promise<void> | void;
  onSaveVisualQualityScore?: (score: VisualQualityScore) => Promise<void> | void;
  onSaveVisualDiagnosisReport?: (report: VisualDiagnosisReport) => Promise<void> | void;
  /** Callback to trigger targeted regeneration of specific panels */
  onRetryPanels?: (panelIndices: number[], patchedPrompts: Map<number, string>, patches?: Map<number, PromptPatch>) => Promise<void> | void;
}

const DIMENSION_LABELS: Record<string, string> = {
  knowledge: "知识准确性",
  visualConsistency: "视觉一致性",
  narrativeCoherence: "叙事连贯性",
  compositionDiversity: "构图多样性",
};

const VISUAL_DIMENSION_LABELS: Record<string, string> = {
  textImageAlignment: "图文匹配度",
  styleAdherence: "风格一致性",
  artifactScore: "画面完整度",
  compositionQuality: "构图质量",
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

/** 文本质量评分区块 */
function TextScoreSection({
  score,
  loading,
  error,
  onEvaluate,
}: {
  score: QualityScore | null;
  loading: boolean;
  error: string;
  onEvaluate: () => void;
}) {
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

/** VLM 视觉评分区块 */
function VisualScoreSection({
  score,
  loading,
  error,
  onEvaluate,
  onRetryLowPanels,
  script,
  vlmOptions,
  selectedVLMOption,
  onVLMOptionChange,
  diagnosisReport,
  diagnosisState,
  diagnosisStale,
}: {
  score: VisualQualityScore | null;
  loading: boolean;
  error: string;
  onEvaluate: () => void;
  onRetryLowPanels?: (panelIndices: number[], patchedPrompts: Map<number, string>, patches?: Map<number, PromptPatch>) => Promise<void> | void;
  script?: ComicScript;
  vlmOptions?: Array<{ id: string; label: string }>;
  selectedVLMOption?: string;
  onVLMOptionChange?: (id: string) => void;
  diagnosisReport?: VisualDiagnosisReport | null;
  diagnosisState?: VisualDiagnosisState;
  diagnosisStale?: boolean;
}) {
  const [expandedPanel, setExpandedPanel] = useState<number | null>(null);
  const [retrying, setRetrying] = useState(false);

  if (!score) {
    return (
      <div className="flex flex-col items-center gap-1">
        {/* VLM model selector */}
        {vlmOptions && vlmOptions.length > 0 && onVLMOptionChange && (
          <select
            value={selectedVLMOption || ""}
            onChange={(e) => onVLMOptionChange(e.target.value)}
            className="px-2 py-1 text-xs border rounded-lg bg-background mb-1 max-w-[200px]"
          >
            <option value="">默认 VLM</option>
            {vlmOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        )}
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
              VLM 视觉评分中...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              VLM 视觉评分
            </>
          )}
        </button>
        <p className="text-[10px] text-muted-foreground/60">需要视觉模型（GPT-4o / Qwen-VL / Claude）</p>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  // 计算各维度的平均分
  const avgScores = {
    textImageAlignment: avg(score.panels.map(p => p.textImageAlignment)),
    styleAdherence: avg(score.panels.map(p => p.styleAdherence)),
    artifactScore: avg(score.panels.map(p => p.artifactScore)),
    compositionQuality: avg(score.panels.map(p => p.compositionQuality)),
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground">视觉评分 (VLM)</h4>
        <div className="flex items-center gap-1">
          <span className="text-lg font-bold text-primary">{score.overall}</span>
          <span className="text-xs text-muted-foreground">/10</span>
        </div>
      </div>

      {/* 总维度评分 */}
      <div className="space-y-2">
        {(Object.keys(VISUAL_DIMENSION_LABELS) as Array<keyof typeof VISUAL_DIMENSION_LABELS>).map((key) => (
          <ScoreBar key={key} label={VISUAL_DIMENSION_LABELS[key]} score={avgScores[key as keyof typeof avgScores]} />
        ))}
      </div>

      <div className="pt-2 border-t space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">深入诊断</p>
          <button
            type="button"
            disabled
            className="px-2 py-1 text-[10px] rounded border opacity-50 cursor-not-allowed"
          >
            运行深入诊断
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {diagnosisState === "failed"
            ? "深入诊断失败，可稍后重试"
            : diagnosisStale
              ? "当前诊断已过期，建议重新运行"
              : diagnosisReport
                ? "已生成结构化审计卡"
                : "可针对低分格生成结构化审计卡"}
        </p>
      </div>

      {/* 每面板评分（可折叠） */}
      {score.panels.length > 0 && (
        <div className="pt-2 border-t space-y-1">
          <p className="text-xs font-medium text-muted-foreground">面板详情：</p>
          <div className="flex flex-wrap gap-1">
            {score.panels.map((p) => {
              const color = p.overall >= 8 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : p.overall >= 6 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
              return (
                <button
                  key={p.panelIndex}
                  onClick={() => setExpandedPanel(expandedPanel === p.panelIndex ? null : p.panelIndex)}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${color} ${
                    expandedPanel === p.panelIndex ? "ring-2 ring-primary" : ""
                  }`}
                >
                  P{p.panelIndex + 1}: {p.overall}
                </button>
              );
            })}
          </div>

          {/* 展开的面板详情 */}
          {expandedPanel !== null && (() => {
            const panel = score.panels.find(p => p.panelIndex === expandedPanel);
            if (!panel) return null;
            return (
              <div className="mt-2 p-2 rounded bg-muted/50 text-xs space-y-1.5">
                <div className="grid grid-cols-2 gap-1">
                  {(Object.keys(VISUAL_DIMENSION_LABELS) as Array<keyof typeof VISUAL_DIMENSION_LABELS>).map((key) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-muted-foreground">{VISUAL_DIMENSION_LABELS[key]}</span>
                      <span className="font-medium">{panel[key as keyof typeof panel] as number}/10</span>
                    </div>
                  ))}
                </div>
                {panel.issues.length > 0 && (
                  <ul className="text-muted-foreground space-y-0.5">
                    {panel.issues.map((issue, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span className="text-orange-500 shrink-0">!</span>
                        {issue}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* 重试建议 + 一键修复 */}
      {score.retryRecommendations.length > 0 && (
        <div className="pt-2 border-t space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-orange-600 dark:text-orange-400">
              建议重新生成 {score.retryRecommendations.length} 个面板：
            </p>
            {onRetryLowPanels && script && (
              <button
                disabled={retrying}
                onClick={async () => {
                  const retryable = score.panels.filter(shouldAutoRetry);
                  if (retryable.length === 0) return;
                  const patchedPrompts = new Map<number, string>();
                  const patchMap = new Map<number, PromptPatch>();
                  for (const ps of retryable) {
                    const panel = script.panels[ps.panelIndex];
                    if (!panel) continue;
                    const patch = generatePromptPatch(ps);
                    const refined = applyPromptPatch(panel.imagePrompt, patch);
                    if (refined !== panel.imagePrompt || patch.negative.length > 0) {
                      patchedPrompts.set(ps.panelIndex, refined);
                      patchMap.set(ps.panelIndex, patch);
                    }
                  }
                  if (patchedPrompts.size > 0) {
                    setRetrying(true);
                    try {
                      await onRetryLowPanels(Array.from(patchedPrompts.keys()), patchedPrompts, patchMap);
                    } finally {
                      setRetrying(false);
                    }
                  }
                }}
                className="px-2 py-1 text-[10px] rounded border border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors disabled:opacity-50"
              >
                {retrying ? "修复中..." : "一键修复"}
              </button>
            )}
          </div>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {score.retryRecommendations.map((r, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-orange-500 shrink-0">P{r.panelIndex + 1}</span>
                {r.reason} — {r.suggestedFix}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* P3: 跨面板一致性 */}
      {score.crossPanelDetail && (
        <div className="pt-2 border-t space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">跨面板一致性</p>
            <span className="text-xs font-medium">{score.crossPanelConsistency}/10</span>
          </div>
          <div className="space-y-1.5">
            <ScoreBar label="角色一致性" score={score.crossPanelDetail.characterConsistency} />
            <ScoreBar label="风格稳定性" score={score.crossPanelDetail.styleDrift} />
            <ScoreBar label="色调统一性" score={score.crossPanelDetail.colorPaletteCoherence} />
          </div>
          {score.crossPanelDetail.issues.length > 0 && (
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {score.crossPanelDetail.issues.map((iss, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-orange-500 shrink-0">
                    P{iss.panelIndices.map(idx => idx + 1).join(",")}
                  </span>
                  {iss.description}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {diagnosisReport && (
        <VisualDiagnosisWorkbench
          visualScoreOverall={score.overall}
          report={diagnosisReport}
          stale={diagnosisStale}
        />
      )}

      <button
        onClick={onEvaluate}
        disabled={loading}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        {loading ? "重新评分中..." : "重新视觉评分"}
      </button>
    </div>
  );
}

function avg(values: number[]): number {
  if (values.length === 0) return 5;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length * 10) / 10;
}

export function QualityScorePanel({
  script,
  cachedScore,
  cachedVisualScore,
  cachedVisualDiagnosisReport,
  cachedVisualDiagnosisState,
  cachedVisualDiagnosisStale,
  onSaveQualityScore,
  onSaveVisualQualityScore,
  onSaveVisualDiagnosisReport,
  onRetryPanels,
}: QualityScorePanelProps) {
  const [score, setScore] = useState<QualityScore | null>(cachedScore ?? null);
  const [visualScore, setVisualScore] = useState<VisualQualityScore | null>(cachedVisualScore ?? null);
  const [visualDiagnosisReport, setVisualDiagnosisReport] = useState<VisualDiagnosisReport | null>(cachedVisualDiagnosisReport ?? null);
  const [visualDiagnosisState, setVisualDiagnosisState] = useState<VisualDiagnosisState | undefined>(cachedVisualDiagnosisState);
  const [visualDiagnosisStale, setVisualDiagnosisStale] = useState(Boolean(cachedVisualDiagnosisStale));
  const [loadingText, setLoadingText] = useState(false);
  const [loadingVisual, setLoadingVisual] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [errorVisual, setErrorVisual] = useState("");
  const [selectedVLMOption, setSelectedVLMOption] = useState("");

  useEffect(() => {
    setScore(cachedScore ?? null);
  }, [cachedScore]);

  useEffect(() => {
    setVisualScore(cachedVisualScore ?? null);
  }, [cachedVisualScore]);

  useEffect(() => {
    setVisualDiagnosisReport(cachedVisualDiagnosisReport ?? null);
  }, [cachedVisualDiagnosisReport]);

  useEffect(() => {
    setVisualDiagnosisState(cachedVisualDiagnosisState);
  }, [cachedVisualDiagnosisState]);

  useEffect(() => {
    setVisualDiagnosisStale(Boolean(cachedVisualDiagnosisStale));
  }, [cachedVisualDiagnosisStale]);

  const getActiveLLM = () => {
    const configs = getStoredConfigs();
    const activeLLM = configs.llmConfigs.find((c) => c.id === configs.activeLLMId) || configs.llmConfigs[0];
    if (!activeLLM) throw new Error("未配置 LLM");
    return { apiUrl: activeLLM.apiUrl, apiKey: activeLLM.apiKey, model: activeLLM.model, provider: activeLLM.protocolType };
  };

  /** Get VLM config: dedicated VLM if configured, otherwise fall back to active LLM */
  const getActiveVLM = (): PartialLLMConfig => {
    const configs = getStoredConfigs();
    const vlmConfigs = configs.vlmConfigs || [];
    const activeVLM = vlmConfigs.find((c) => c.id === configs.activeVLMId) || vlmConfigs[0];
    if (activeVLM) {
      return { apiUrl: activeVLM.apiUrl, apiKey: activeVLM.apiKey, model: activeVLM.model, provider: activeVLM.protocolType };
    }
    // Fall back to LLM
    return getActiveLLM();
  };

  /** Get available VLM options for selector */
  const getVLMOptions = (): Array<{ id: string; label: string }> => {
    const configs = getStoredConfigs();
    const vlmConfigs = configs.vlmConfigs || [];
    const options: Array<{ id: string; label: string }> = [];
    for (const c of vlmConfigs) {
      options.push({ id: `vlm:${c.id}`, label: `${c.name}` });
    }
    // Also offer LLM configs as fallback
    for (const c of configs.llmConfigs) {
      options.push({ id: `llm:${c.id}`, label: `${c.name} (LLM)` });
    }
    return options;
  };

  const handleTextEvaluate = async () => {
    setLoadingText(true);
    setErrorText("");
    try {
      const llm = getActiveLLM();
      const result = await evaluateQuality(script, llm);
      setScore(result);
      await onSaveQualityScore?.(result);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "评分失败");
    } finally {
      setLoadingText(false);
    }
  };

  const handleVisualEvaluate = async () => {
    setLoadingVisual(true);
    setErrorVisual("");
    try {
      let vlm: PartialLLMConfig;
      if (selectedVLMOption) {
        // Resolve from selected option
        const configs = getStoredConfigs();
        const [type, id] = selectedVLMOption.split(":");
        let found: UserLLMConfig | undefined;
        if (type === "vlm") {
          found = (configs.vlmConfigs || []).find((c) => c.id === id);
        } else {
          found = configs.llmConfigs.find((c) => c.id === id);
        }
        if (!found) throw new Error("所选配置不存在");
        vlm = { apiUrl: found.apiUrl, apiKey: found.apiKey, model: found.model, provider: found.protocolType };
      } else {
        vlm = getActiveVLM();
      }
      const result = await evaluateVisualQuality(script, vlm);
      setVisualScore(result);
      await onSaveVisualQualityScore?.(result);
    } catch (err) {
      setErrorVisual(err instanceof Error ? err.message : "视觉评分失败");
    } finally {
      setLoadingVisual(false);
    }
  };

  const hasAnyScore = score || visualScore;
  const vlmOptions = getVLMOptions();

  if (!hasAnyScore) {
    return (
      <div className="flex flex-wrap justify-center gap-2 no-print">
        <TextScoreSection score={null} loading={loadingText} error={errorText} onEvaluate={handleTextEvaluate} />
        <VisualScoreSection score={null} loading={loadingVisual} error={errorVisual} onEvaluate={handleVisualEvaluate} onRetryLowPanels={onRetryPanels} script={script} vlmOptions={vlmOptions} selectedVLMOption={selectedVLMOption} onVLMOptionChange={setSelectedVLMOption} diagnosisReport={visualDiagnosisReport} diagnosisState={visualDiagnosisState} diagnosisStale={visualDiagnosisStale} />
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl border bg-card space-y-4 no-print">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">AI 质量评分</h3>
        {score && visualScore && (
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-primary">
              {Math.round((score.overall + visualScore.overall) / 2 * 10) / 10}
            </span>
            <span className="text-xs text-muted-foreground">/10</span>
          </div>
        )}
      </div>

      <div className={`grid gap-4 ${score && visualScore ? "md:grid-cols-2" : ""}`}>
        {/* 文本质量评分 */}
        <TextScoreSection score={score} loading={loadingText} error={errorText} onEvaluate={handleTextEvaluate} />

        {/* VLM 视觉评分 */}
        <VisualScoreSection score={visualScore} loading={loadingVisual} error={errorVisual} onEvaluate={handleVisualEvaluate} onRetryLowPanels={onRetryPanels} script={script} vlmOptions={vlmOptions} selectedVLMOption={selectedVLMOption} onVLMOptionChange={setSelectedVLMOption} diagnosisReport={visualDiagnosisReport} diagnosisState={visualDiagnosisState} diagnosisStale={visualDiagnosisStale} />
      </div>
    </div>
  );
}
