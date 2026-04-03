"use client";

import { useState } from "react";
import type {
  ComicScript,
  VisualDiagnosisPanel,
  VisualDiagnosisReport,
  VisualDiagnosisState,
  VisualQualityScore,
  VisualRepairExecutionOutcome,
} from "@/lib/types";
import { shouldAutoRetry, generatePromptPatch, applyPromptPatch, type PromptPatch } from "@/lib/vlmRetry";
import { VisualRewriteConfirmDialog } from "../VisualRewriteConfirmDialog";
import { VisualDiagnosisWorkbench } from "../VisualDiagnosisWorkbench";
import { ScoreBar } from "./ScoreBar";
import { VISUAL_DIMENSION_LABELS, avg } from "./constants";

type DiagnosisRepairViewStatus = {
  panelIndex?: number;
  mode: "patch" | "rewrite";
  status: "running" | "completed" | "failed";
  message: string;
};

export interface VisualScoreSectionProps {
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
  diagnosisLoading?: boolean;
  diagnosisError?: string;
  onRunDiagnosis?: () => void;
  onExecuteDiagnosisRepair?: (
    panel: VisualDiagnosisPanel,
    params: { mode: "patch" | "rewrite"; confirmedPrompt?: string; includeSuggestedNegativePrompt?: boolean },
  ) => Promise<{ outcome: VisualRepairExecutionOutcome }>;
  onExecuteBatchDiagnosisPatch?: (
    panels: VisualDiagnosisPanel[],
  ) => Promise<{ outcome: VisualRepairExecutionOutcome; partialFailure?: boolean }>;
}

export function VisualScoreSection({
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
  diagnosisLoading,
  diagnosisError,
  onRunDiagnosis,
  onExecuteDiagnosisRepair,
  onExecuteBatchDiagnosisPatch,
}: VisualScoreSectionProps) {
  const [expandedPanel, setExpandedPanel] = useState<number | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [repairStatus, setRepairStatus] = useState<DiagnosisRepairViewStatus | null>(null);
  const [rewriteDialogPanel, setRewriteDialogPanel] = useState<VisualDiagnosisPanel | null>(null);
  const [rewritePromptValue, setRewritePromptValue] = useState("");
  const [includeSuggestedNegativePrompt, setIncludeSuggestedNegativePrompt] = useState(false);
  const [repairingDiagnosisPanel, setRepairingDiagnosisPanel] = useState(false);

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

  const runDiagnosisRepair = async (
    panel: VisualDiagnosisPanel,
    params: { mode: "patch" | "rewrite"; confirmedPrompt?: string; includeSuggestedNegativePrompt?: boolean },
  ) => {
    if (!onExecuteDiagnosisRepair) return;

    setRepairStatus({
      panelIndex: panel.panelIndex,
      mode: params.mode,
      status: "running",
      message: params.mode === "patch" ? "正在修复该面板..." : "正在应用重写并重生图...",
    });
    setRepairingDiagnosisPanel(true);

    try {
      const result = await onExecuteDiagnosisRepair(panel, params);
      setRepairStatus({
        panelIndex: panel.panelIndex,
        mode: params.mode,
        status: "completed",
        message: result.outcome === "improved"
          ? "修复完成，视觉评分已更新"
          : "修复完成，但当前评分未改善",
      });
      setRewriteDialogPanel(null);
    } catch {
      setRepairStatus({
        panelIndex: panel.panelIndex,
        mode: params.mode,
        status: "failed",
        message: "修复失败，请重试",
      });
    } finally {
      setRepairingDiagnosisPanel(false);
    }
  };

  const handleOpenRewrite = (panel: VisualDiagnosisPanel) => {
    setRewriteDialogPanel(panel);
    setRewritePromptValue(panel.repair.suggestedPrompt ?? panel.promptSnapshot);
    setIncludeSuggestedNegativePrompt(Boolean(panel.repair.suggestedNegativePrompt));
  };

  const handleBatchPatch = async (panels: VisualDiagnosisPanel[]) => {
    if (!onExecuteBatchDiagnosisPatch || panels.length === 0) return;

    setRepairStatus({
      mode: "patch",
      status: "running",
      message: `正在修复 ${panels.length} 个面板...`,
    });
    setRepairingDiagnosisPanel(true);

    try {
      const result = await onExecuteBatchDiagnosisPatch(panels);
      setRepairStatus({
        mode: "patch",
        status: "completed",
        message: result.partialFailure
          ? "部分面板修复失败，请逐个检查"
          : result.outcome === "improved"
            ? "修复完成，视觉评分已更新"
            : "修复完成，但当前评分未改善",
      });
    } catch {
      setRepairStatus({
        mode: "patch",
        status: "failed",
        message: "修复失败，请重试",
      });
    } finally {
      setRepairingDiagnosisPanel(false);
    }
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
            disabled={!onRunDiagnosis || diagnosisLoading}
            onClick={() => onRunDiagnosis?.()}
            className="px-2 py-1 text-[10px] rounded border hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {diagnosisLoading ? "诊断中..." : "运行深入诊断"}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {diagnosisState === "running"
            ? "正在生成问题格审计卡..."
            : diagnosisState === "failed"
            ? "深入诊断失败，可稍后重试"
            : diagnosisStale
              ? "当前诊断已过期，建议重新运行"
              : diagnosisReport
                ? "已生成结构化审计卡"
                : "可针对低分格生成结构化审计卡"}
        </p>
        {diagnosisError && <p className="text-xs text-red-500">{diagnosisError}</p>}
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
          onApplyPatch={onExecuteDiagnosisRepair
            ? (panel) => {
                void runDiagnosisRepair(panel, { mode: "patch" });
              }
            : undefined}
          onApplyRewrite={onExecuteDiagnosisRepair ? handleOpenRewrite : undefined}
          onApplyBatchPatch={onExecuteBatchDiagnosisPatch
            ? (panels) => {
                void handleBatchPatch(panels);
              }
            : undefined}
          repairStatus={repairStatus}
        />
      )}

      {rewriteDialogPanel && (
        <VisualRewriteConfirmDialog
          open
          panel={rewriteDialogPanel}
          promptValue={rewritePromptValue}
          includeSuggestedNegativePrompt={includeSuggestedNegativePrompt}
          confirming={repairingDiagnosisPanel && repairStatus?.panelIndex === rewriteDialogPanel.panelIndex}
          onPromptValueChange={setRewritePromptValue}
          onIncludeSuggestedNegativePromptChange={setIncludeSuggestedNegativePrompt}
          onCancel={() => {
            if (!repairingDiagnosisPanel) {
              setRewriteDialogPanel(null);
            }
          }}
          onConfirm={({ prompt, includeSuggestedNegativePrompt: includeNegative }) => {
            void runDiagnosisRepair(rewriteDialogPanel, {
              mode: "rewrite",
              confirmedPrompt: prompt,
              includeSuggestedNegativePrompt: includeNegative,
            });
          }}
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
