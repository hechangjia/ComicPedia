"use client";

import { useEffect, useState } from "react";
import type {
  ComicScript,
  GenerateTask,
  PartialLLMConfig,
  UserLLMConfig,
  VisualDiagnosisPanel,
  VisualDiagnosisReport,
  VisualDiagnosisState,
  VisualQualityScore,
  VisualRepairExecutionMode,
  VisualRepairExecutionOutcome,
} from "@/lib/types";
import { evaluateQuality, type QualityScore } from "@/lib/qualityScore";
import { evaluateVisualQuality } from "@/lib/vlmScorer";
import { buildDiagnosisRepairExecution, classifyRepairOutcome, runVisualDiagnosisFlow } from "@/lib/vlmDiagnosis";
import { getStoredConfigs } from "@/hooks/useAPIConfig";
import { type PromptPatch } from "@/lib/vlmRetry";
import { TextScoreSection } from "./score/TextScoreSection";
import { VisualScoreSection } from "./score/VisualScoreSection";

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
  onSaveVisualDiagnosisFailure?: () => Promise<void> | void;
  onBeginVisualRepairExecution?: (params: { panelIndices: number[]; mode: VisualRepairExecutionMode; startedAt: string }) => Promise<void> | void;
  onCompleteVisualRepairExecution?: (score: VisualQualityScore, outcome: VisualRepairExecutionOutcome, finishedAt: string) => Promise<void> | void;
  onFailVisualRepairExecution?: (finishedAt: string) => Promise<void> | void;
  /** Callback to trigger targeted regeneration of specific panels */
  onRetryPanels?: (panelIndices: number[], patchedPrompts: Map<number, string>, patches?: Map<number, PromptPatch>) => Promise<void> | void;
  onRunDiagnosisRepair?: (
    panelIndices: number[],
    promptUpdates: Map<number, string>,
    negativeTermsByPanel?: Map<number, string[]>,
  ) => Promise<GenerateTask> | GenerateTask;
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
  onSaveVisualDiagnosisFailure,
  onBeginVisualRepairExecution,
  onCompleteVisualRepairExecution,
  onFailVisualRepairExecution,
  onRetryPanels,
  onRunDiagnosisRepair,
}: QualityScorePanelProps) {
  const [score, setScore] = useState<QualityScore | null>(cachedScore ?? null);
  const [visualScore, setVisualScore] = useState<VisualQualityScore | null>(cachedVisualScore ?? null);
  const [visualDiagnosisReport, setVisualDiagnosisReport] = useState<VisualDiagnosisReport | null>(cachedVisualDiagnosisReport ?? null);
  const [visualDiagnosisState, setVisualDiagnosisState] = useState<VisualDiagnosisState | undefined>(cachedVisualDiagnosisState);
  const [visualDiagnosisStale, setVisualDiagnosisStale] = useState(Boolean(cachedVisualDiagnosisStale));
  const [loadingText, setLoadingText] = useState(false);
  const [loadingVisual, setLoadingVisual] = useState(false);
  const [loadingDiagnosis, setLoadingDiagnosis] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [errorVisual, setErrorVisual] = useState("");
  const [errorDiagnosis, setErrorDiagnosis] = useState("");
  const [selectedVLMOption, setSelectedVLMOption] = useState("");

  useEffect(() => { setScore(cachedScore ?? null); }, [cachedScore]);
  useEffect(() => { setVisualScore(cachedVisualScore ?? null); }, [cachedVisualScore]);
  useEffect(() => { setVisualDiagnosisReport(cachedVisualDiagnosisReport ?? null); }, [cachedVisualDiagnosisReport]);
  useEffect(() => { setVisualDiagnosisState(cachedVisualDiagnosisState); }, [cachedVisualDiagnosisState]);
  useEffect(() => { setVisualDiagnosisStale(Boolean(cachedVisualDiagnosisStale)); }, [cachedVisualDiagnosisStale]);

  const getActiveLLM = () => {
    const configs = getStoredConfigs();
    const activeLLM = configs.llmConfigs.find((c) => c.id === configs.activeLLMId) || configs.llmConfigs[0];
    if (!activeLLM) throw new Error("未配置 LLM");
    return { apiUrl: activeLLM.apiUrl, apiKey: activeLLM.apiKey, model: activeLLM.model, provider: activeLLM.protocolType };
  };

  const getActiveVLM = (): PartialLLMConfig => {
    const configs = getStoredConfigs();
    const vlmConfigs = configs.vlmConfigs || [];
    const activeVLM = vlmConfigs.find((c) => c.id === configs.activeVLMId) || vlmConfigs[0];
    if (activeVLM) {
      return { apiUrl: activeVLM.apiUrl, apiKey: activeVLM.apiKey, model: activeVLM.model, provider: activeVLM.protocolType };
    }
    return getActiveLLM();
  };

  const getVLMOptions = (): Array<{ id: string; label: string }> => {
    const configs = getStoredConfigs();
    const vlmConfigs = configs.vlmConfigs || [];
    const options: Array<{ id: string; label: string }> = [];
    for (const c of vlmConfigs) {
      options.push({ id: `vlm:${c.id}`, label: `${c.name}` });
    }
    for (const c of configs.llmConfigs) {
      options.push({ id: `llm:${c.id}`, label: `${c.name} (LLM)` });
    }
    return options;
  };

  const resolveSelectedVLM = (): PartialLLMConfig => {
    if (selectedVLMOption) {
      const configs = getStoredConfigs();
      const [type, id] = selectedVLMOption.split(":");
      let found: UserLLMConfig | undefined;
      if (type === "vlm") {
        found = (configs.vlmConfigs || []).find((c) => c.id === id);
      } else {
        found = configs.llmConfigs.find((c) => c.id === id);
      }
      if (!found) throw new Error("所选配置不存在");
      return { apiUrl: found.apiUrl, apiKey: found.apiKey, model: found.model, provider: found.protocolType };
    }
    return getActiveVLM();
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
      const vlm = resolveSelectedVLM();
      const result = await evaluateVisualQuality(script, vlm);
      setVisualScore(result);
      await onSaveVisualQualityScore?.(result);
    } catch (err) {
      setErrorVisual(err instanceof Error ? err.message : "视觉评分失败");
    } finally {
      setLoadingVisual(false);
    }
  };

  const handleRunDiagnosis = async () => {
    if (!visualScore || !onSaveVisualDiagnosisReport) return;
    setLoadingDiagnosis(true);
    setErrorDiagnosis("");
    setVisualDiagnosisState("running");
    try {
      const vlm = resolveSelectedVLM();
      const report = await runVisualDiagnosisFlow({
        script, visualScore, vlmConfig: vlm,
        saveReport: onSaveVisualDiagnosisReport,
        saveFailure: onSaveVisualDiagnosisFailure,
      });
      setVisualDiagnosisReport(report);
      setVisualDiagnosisState("succeeded");
      setVisualDiagnosisStale(false);
    } catch (err) {
      setVisualDiagnosisState("failed");
      setErrorDiagnosis(err instanceof Error ? err.message : "深入诊断失败");
    } finally {
      setLoadingDiagnosis(false);
    }
  };

  const executeDiagnosisRepair = async (
    panel: VisualDiagnosisPanel,
    params: { mode: "patch" | "rewrite"; confirmedPrompt?: string; includeSuggestedNegativePrompt?: boolean },
  ): Promise<{ outcome: VisualRepairExecutionOutcome }> => {
    if (!visualScore) throw new Error("视觉评分尚未完成");
    if (!onRunDiagnosisRepair || !onBeginVisualRepairExecution || !onCompleteVisualRepairExecution || !onFailVisualRepairExecution) {
      throw new Error("诊断修复执行链路尚未配置");
    }
    const currentPanel = script.panels[panel.panelIndex];
    if (!currentPanel) throw new Error(`Panel ${panel.panelIndex + 1} 不存在`);

    const execution = buildDiagnosisRepairExecution({
      panel, currentPrompt: currentPanel.imagePrompt, mode: params.mode,
      confirmedPrompt: params.confirmedPrompt, includeSuggestedNegativePrompt: params.includeSuggestedNegativePrompt,
    });

    const startedAt = new Date().toISOString();
    await onBeginVisualRepairExecution({ panelIndices: [panel.panelIndex], mode: execution.mode, startedAt });

    try {
      const promptUpdates = new Map<number, string>([[panel.panelIndex, execution.prompt]]);
      const negativeTermsByPanel = execution.negativeTerms.length > 0
        ? new Map<number, string[]>([[panel.panelIndex, execution.negativeTerms]]) : undefined;
      const refreshedTask = await onRunDiagnosisRepair([panel.panelIndex], promptUpdates, negativeTermsByPanel);
      if (!refreshedTask?.script) throw new Error("修复后的任务不存在");

      const vlm = resolveSelectedVLM();
      const reevaluatedScore = await evaluateVisualQuality(refreshedTask.script, vlm);
      const outcome = classifyRepairOutcome(visualScore.overall, reevaluatedScore.overall);
      await onCompleteVisualRepairExecution(reevaluatedScore, outcome, new Date().toISOString());
      setVisualScore(reevaluatedScore);
      setVisualDiagnosisStale(true);
      return { outcome };
    } catch (err) {
      try { await Promise.resolve(onFailVisualRepairExecution(new Date().toISOString())); } catch {}
      throw err;
    }
  };

  const executeBatchDiagnosisPatch = async (
    panels: VisualDiagnosisPanel[],
  ): Promise<{ outcome: VisualRepairExecutionOutcome; partialFailure?: boolean }> => {
    if (!visualScore) throw new Error("视觉评分尚未完成");
    if (!onRunDiagnosisRepair || !onBeginVisualRepairExecution || !onCompleteVisualRepairExecution || !onFailVisualRepairExecution) {
      throw new Error("诊断修复执行链路尚未配置");
    }
    if (panels.length === 0) throw new Error("没有可批量修复的面板");

    const startedAt = new Date().toISOString();
    const panelIndices = panels.map((panel) => panel.panelIndex);
    await onBeginVisualRepairExecution({ panelIndices, mode: "batch_patch", startedAt });

    let failedCount = 0;
    let latestTask: GenerateTask | null = null;

    try {
      for (const panel of panels) {
        const currentPanel = script.panels[panel.panelIndex];
        if (!currentPanel) { failedCount += 1; continue; }
        const execution = buildDiagnosisRepairExecution({ panel, currentPrompt: currentPanel.imagePrompt, mode: "patch" });
        try {
          latestTask = await onRunDiagnosisRepair(
            [panel.panelIndex],
            new Map<number, string>([[panel.panelIndex, execution.prompt]]),
            execution.negativeTerms.length > 0
              ? new Map<number, string[]>([[panel.panelIndex, execution.negativeTerms]]) : undefined,
          );
        } catch { failedCount += 1; }
      }
      if (!latestTask?.script) throw new Error("批量修复后未能获取最新任务");

      const vlm = resolveSelectedVLM();
      const reevaluatedScore = await evaluateVisualQuality(latestTask.script, vlm);
      const outcome = classifyRepairOutcome(visualScore.overall, reevaluatedScore.overall);
      await onCompleteVisualRepairExecution(reevaluatedScore, outcome, new Date().toISOString());
      setVisualScore(reevaluatedScore);
      setVisualDiagnosisStale(true);
      return { outcome, partialFailure: failedCount > 0 };
    } catch (err) {
      try { await Promise.resolve(onFailVisualRepairExecution(new Date().toISOString())); } catch {}
      throw err;
    }
  };

  const hasAnyScore = score || visualScore;
  const vlmOptions = getVLMOptions();

  const visualSectionProps = {
    score: visualScore, loading: loadingVisual, error: errorVisual, onEvaluate: handleVisualEvaluate,
    onRetryLowPanels: onRetryPanels, script, vlmOptions, selectedVLMOption, onVLMOptionChange: setSelectedVLMOption,
    diagnosisReport: visualDiagnosisReport, diagnosisState: visualDiagnosisState, diagnosisStale: visualDiagnosisStale,
    diagnosisLoading: loadingDiagnosis, diagnosisError: errorDiagnosis, onRunDiagnosis: handleRunDiagnosis,
    onExecuteDiagnosisRepair: executeDiagnosisRepair, onExecuteBatchDiagnosisPatch: executeBatchDiagnosisPatch,
  };

  if (!hasAnyScore) {
    return (
      <div className="flex flex-wrap justify-center gap-2 no-print">
        <TextScoreSection score={null} loading={loadingText} error={errorText} onEvaluate={handleTextEvaluate} />
        <VisualScoreSection {...visualSectionProps} />
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
        <TextScoreSection score={score} loading={loadingText} error={errorText} onEvaluate={handleTextEvaluate} />
        <VisualScoreSection {...visualSectionProps} />
      </div>
    </div>
  );
}
