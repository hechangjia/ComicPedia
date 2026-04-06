"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ComicStyle, GenerateTaskStatus, QuizQuestion, RelatedTopic } from "@/lib/types";
import { cancelGeneration } from "@/lib/client/generator";
import { saveTask } from "@/lib/client/db";
import { downloadTextFile } from "@/lib/downloadUtils";
import { GeneratingAnimation } from "@/components/GeneratingAnimation";
import { TitleSkeleton, ComicGridSkeleton } from "@/components/Skeleton";
import { useTaskSubscription } from "@/hooks/useTaskSubscription";
import { resumeTaskLifecycle, useTaskPageLifecycle } from "@/hooks/useTaskPageLifecycle";
import { useTaskActions } from "@/hooks/useTaskActions";
import { getStoredConfigs, getStoredRequestConfigs } from "@/hooks/useAPIConfig";
import { useUIMode } from "@/hooks/useUIMode";
import { StyleSwitcher } from "@/components/result/StyleSwitcher";
import { ScriptReadyWorkspace } from "@/components/result/ScriptReadyWorkspace";
import { ScriptValidationPanel } from "@/components/result/ScriptValidationPanel";
import { CompletedActions } from "@/components/result/CompletedActions";
import { PanelGrid } from "@/components/result/PanelGrid";
import { QualityScorePanel } from "@/components/result/QualityScorePanel";
import { PipelineSummary } from "@/components/result/PipelineSummary";
import { PipelineTimeline } from "@/components/result/PipelineTimeline";
import { AccuracySummary } from "@/components/result/AccuracySummary";
import { CompositeScore } from "@/components/result/CompositeScore";
import { DetailTabs } from "@/components/result/DetailTabs";
import { StickyActionBar } from "@/components/result/StickyActionBar";
import { ScriptEditor } from "@/components/editor/ScriptEditor";
import { DirectorSidebar } from "@/components/result/DirectorSidebar";
import "@/app/result/print.css";
import { resolveResultBackHref } from "@/app/history/historyNavigation";
import { AlertTriangle, ChevronLeft, RefreshCw, X, Settings, Sparkles } from "lucide-react";


const QuizPanel = dynamic(() =>
  import("@/components/result/QuizPanel").then((m) => ({ default: m.QuizPanel }))
);
const RelatedTopicsPanel = dynamic(() =>
  import("@/components/result/RelatedTopicsPanel").then((m) => ({ default: m.RelatedTopicsPanel }))
);
const ShareCardButton = dynamic(() =>
  import("@/components/result/ShareCardButton").then((m) => ({ default: m.ShareCardButton }))
);

const ReferenceImagePanel = dynamic(() =>
  import("@/components/ReferenceImagePanel").then((m) => ({ default: m.ReferenceImagePanel }))
);
const DynamicPlayer = dynamic(() =>
  import("@/components/DynamicPlayer").then((m) => ({ default: m.DynamicPlayer }))
);

const SCRIPT_IN_PROGRESS_STATUSES = new Set<GenerateTaskStatus>([
  "pending",
  "scripting",
  "created",
  "research_running",
  "script_running",
]);

export default function ResultPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const taskId = params.id as string;
  const backHref = useMemo(
    () => resolveResultBackHref(searchParams.get("returnTo")),
    [searchParams],
  );

  const { task, setTask, error } = useTaskSubscription(taskId);
  useTaskPageLifecycle(task);
  const { isSimpleMode, toggleMode } = useUIMode();

  // --- Model selection ---
  const storedConfigs = useMemo(() => getStoredConfigs(), []);
  const [selectedImageId, setSelectedImageId] = useState(storedConfigs.activeImageId ?? "");
  const [selectedLLMId, setSelectedLLMId] = useState(storedConfigs.activeLLMId ?? "");
  const selectedLLMConfig = useMemo(
    () => getStoredRequestConfigs(selectedLLMId || undefined).llmConfig,
    [selectedLLMId],
  );

  const {
    handleSaveQualityScore,
    handleSaveVisualQualityScore,
    handleSaveVisualDiagnosisReport,
    handleSaveVisualDiagnosisFailure,
    handleBeginVisualRepairExecution,
    handleCompleteVisualRepairExecution,
    handleFailVisualRepairExecution,
    handlePanelUpdate,
    handleRegenerate,
    handleCancel,
    handleVersionChange,
    handleQueuePanel,
    handleQueueSelectedPanels,
    handleContinueRemaining,
    handlePauseQueue,
    handleResumeQueue,
    handleStartDeepReview,
    handleRetryFailed,
    handleReferenceImageChange,
    handleReferenceImagesChange,
    handleControlModeChange,
    handleRegenerateRef,
    handleImg2Img,
    handleRefVersionChange,
    handleRefEntriesChange,
    handleRegenerateScript,
    handleChangeStyle,
    handleReorder,
    handleVlmRetry,
    handleRunDiagnosisRepair,
    generatingAll,
    actionError,
    clearActionError,
  } = useTaskActions(taskId, setTask, selectedImageId, selectedLLMId);

  const [viewMode, setViewMode] = useState<"edit" | "read" | "play">(
    task?.status === "completed" || task?.status === "image_queue_paused" || task?.status === "deep_review_paused" ? "read" : "edit"
  );
  const [selectedPanelIds, setSelectedPanelIds] = useState<number[]>([]);
  const taskPanels = task?.script?.panels;

  const handleResumePausedTask = useCallback(async () => {
    if (task?.status === "image_queue_paused" || task?.status === "deep_review_paused") {
      const resumedTask = await resumeTaskLifecycle(taskId);
      if (resumedTask) {
        setTask(resumedTask);
      }
    }
  }, [setTask, task?.status, taskId]);

  useEffect(() => {
    if ((task?.status === "completed" || task?.status === "image_queue_paused" || task?.status === "deep_review_paused") && viewMode === "edit") {
      setViewMode("read");
    }
  }, [task?.status, viewMode]);

  const validSelectedPanelIds = useMemo(() => (
    taskPanels
      ? selectedPanelIds.filter((panelId) => taskPanels.some((panel) => panel.id === panelId))
      : []
  ), [selectedPanelIds, taskPanels]);
  const selectedPanelIndices = useMemo(() => {
    if (!taskPanels) {
      return [];
    }
    return taskPanels.flatMap((panel, panelIndex) => (
      validSelectedPanelIds.includes(panel.id) ? [panelIndex] : []
    ));
  }, [taskPanels, validSelectedPanelIds]);

  const handleTogglePanelSelection = useCallback((panelId: number, checked: boolean) => {
    setSelectedPanelIds((prev) => {
      if (checked) {
        if (prev.includes(panelId)) return prev;
        return [...prev, panelId];
      }
      return prev.filter((value) => value !== panelId);
    });
  }, []);

  const handleQueueSelected = useCallback(async () => {
    const queued = await handleQueueSelectedPanels(selectedPanelIndices);
    if (queued) {
      setSelectedPanelIds([]);
    }
  }, [handleQueueSelectedPanels, selectedPanelIndices]);

  // Script editor save handler
  const handleScriptEditorSave = useCallback((panels: import("@/lib/types").ComicPanel[]) => {
    setTask((prev) => {
      if (!prev?.script) return prev;
      const updated = { ...prev, script: { ...prev.script, panels }, updatedAt: new Date() };
      saveTask(updated).catch(console.error);
      return updated;
    });
  }, [setTask]);

  // 持久化测验/延伸阅读结果
  const handleQuizGenerated = useCallback((questions: QuizQuestion[]) => {
    setTask((prev) => {
      if (!prev?.script) return prev;
      const updated = { ...prev, script: { ...prev.script, quiz: questions }, updatedAt: new Date() };
      saveTask(updated).catch(console.error);
      return updated;
    });
  }, [setTask]);

  const handleRelatedTopicsGenerated = useCallback((topics: RelatedTopic[]) => {
    setTask((prev) => {
      if (!prev?.script) return prev;
      const updated = { ...prev, script: { ...prev.script, relatedTopics: topics }, updatedAt: new Date() };
      saveTask(updated).catch(console.error);
      return updated;
    });
  }, [setTask]);

  // 导出 Markdown
  const handleExportMarkdown = () => {
    if (!task?.script) return;
    const lines: string[] = [];

    lines.push(`# ${task.script.title}`);
    lines.push("");
    lines.push(`> 主题：${task.script.topic}`);
    lines.push(`> 风格：${task.script.style}`);
    lines.push(`> 生成时间：${new Date().toLocaleString("zh-CN")}`);
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("> **提示**：图片请配合 ZIP 打包下载使用，或使用「合成大图」功能导出。");
    lines.push("");

    task.script.panels.forEach((panel, index) => {
      lines.push(`## 第 ${index + 1} 格`);
      lines.push("");
      lines.push(`**场景描述：** ${panel.scene}`);
      lines.push("");
      lines.push(`**对话/旁白：** ${panel.dialogue}`);
      lines.push("");
      lines.push(`**图片提示词：**`);
      lines.push("```");
      lines.push(panel.imagePrompt);
      lines.push("```");
      lines.push("");
      if (panel.imageUrl && !panel.imageUrl.startsWith("data:")) {
        lines.push(`**图片：** ![第${index + 1}格](${panel.imageUrl})`);
        lines.push("");
      } else if (panel.imageUrl && !panel.imageUrl.startsWith("data:text/plain")) {
        lines.push(`**图片：** \`panel_${String(index + 1).padStart(2, "0")}.png\` (请使用 ZIP 打包下载)`);
        lines.push("");
      }
      lines.push("---");
      lines.push("");
    });

    const markdown = lines.join("\n");
    const filename = `${task.script.title || "comic"}_${new Date().toISOString().slice(0, 10)}.md`;
    downloadTextFile(markdown, filename, "text/markdown;charset=utf-8");
  };

  // ── 渲染：错误 ──
  if (error) {
    return (
      <div className="max-w-2xl mx-auto text-center space-y-4">
        <div className="p-6 rounded-xl border bg-error/10">
          <p className="text-error">{error}</p>
        </div>
        <Link
          href={backHref}
          className="inline-block px-6 py-2 rounded-lg bg-primary text-primary-foreground min-h-[44px]"
        >
          {backHref === "/" ? "返回首页" : "返回历史"}
        </Link>
      </div>
    );
  }

  // ── 渲染：加载中 ──
  if (!task) {
    return (
      <div className="max-w-4xl mx-auto space-y-8">
        <TitleSkeleton />
        <ComicGridSkeleton count={4} />
      </div>
    );
  }

  const isScripting = SCRIPT_IN_PROGRESS_STATUSES.has(task.status);
  const isScriptReady = task.status === "script_ready";
  const isLegacyGenerating = task.status === "generating";
  const isQueueRunning = task.status === "image_queue_running" || task.status === "calibrating";
  const isImageQueuePaused = task.status === "image_queue_paused";
  const isDeepReviewRunning = task.status === "deep_review_running";
  const isDeepReviewPaused = task.status === "deep_review_paused";
  const isGenerating = isLegacyGenerating || isQueueRunning;
  const isCompleted = task.status === "completed";
  const showPausedResume = isImageQueuePaused || isDeepReviewPaused;
  const showScriptReadyWorkspace = !!task.script && (
    task.status === "script_ready"
    || task.status === "image_queue_running"
    || task.status === "image_queue_paused"
  );
  const showAnimation = isScripting || isGenerating;
  const animationStatus = isGenerating
    ? "generating"
    : task.status === "created"
    ? "pending"
    : "scripting";

  const totalPanels = task.script?.panels.length ?? 0;
  const completedPanels = task.script?.panels.filter(p => p.status === "completed").length ?? 0;
  const failedPanels = task.script?.panels.filter(p => p.status === "failed" || p.status === "pending").length ?? 0;
  const pendingPanels = totalPanels - completedPanels;

  // ── 渲染：主页面 ──
  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8 pb-20 print-container">
      {/* 返回按钮 + 模式切换 */}
      <div className="flex items-center justify-between">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground no-print min-h-[44px]"
        >
          <ChevronLeft className="w-4 h-4" />
          {backHref === "/" ? "返回" : "返回历史"}
        </Link>

        {/* 模式切换按钮 */}
        <button
          type="button"
          onClick={toggleMode}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border hover:bg-muted transition-colors no-print min-h-[36px]"
          aria-label={isSimpleMode ? "切换到高级模式" : "切换到极简模式"}
        >
          {isSimpleMode ? (
            <>
              <Settings className="w-3.5 h-3.5" />
              <span>高级模式</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              <span>极简模式</span>
            </>
          )}
        </button>
      </div>

      {/* 标题 */}
      <div className="text-center space-y-2 print-title">
        <h1 className="text-xl sm:text-2xl font-bold text-teal">
          {task.script?.title || "生成中..."}
        </h1>
        {task.script?.topic && (
          <p className="text-muted-foreground text-sm sm:text-base no-print">{task.script.topic}</p>
        )}

        {/* 生成配置快照 */}
        {task.generationConfig && (isCompleted || isScriptReady) && (
          <div className="flex flex-wrap justify-center gap-2 text-[11px] text-muted-foreground no-print">
            {task.generationConfig.llmModel && (
              <span className="px-2 py-0.5 rounded-full bg-muted/60">
                LLM: {task.generationConfig.llmModel}
              </span>
            )}
            {task.generationConfig.imageModel && (
              <span className="px-2 py-0.5 rounded-full bg-muted/60">
                图片: {task.generationConfig.imageModel}
              </span>
            )}
            {task.generationConfig.quality && (
              <span className="px-2 py-0.5 rounded-full bg-muted/60">
                质量: {task.generationConfig.quality === "fast" ? "快速" : task.generationConfig.quality === "fine" ? "精细" : "标准"}
              </span>
            )}
          </div>
        )}

        {/* Composite score bar */}
        {isCompleted && <CompositeScore task={task} />}

        {/* Agent Pipeline Timeline / Summary */}
        {task.pipelineTrace && task.pipelineTrace.length > 0 ? (
          <PipelineTimeline trace={task.pipelineTrace} />
        ) : (
          (isCompleted || isScriptReady) && <PipelineSummary task={task} />
        )}

        {/* Topic research result */}
        {task.topicResearch && (
          <details className="text-left mx-auto max-w-lg no-print">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              AI Topic Research
              {task.topicResearch.knowledgeMap && (
                <span className="ml-1 opacity-60">
                  ({task.topicResearch.knowledgeMap.core.length} core + {task.topicResearch.knowledgeMap.sub.length} sub)
                </span>
              )}
            </summary>
            <div className="mt-2 p-3 rounded-lg bg-muted/50 text-xs space-y-2">
              <p className="text-foreground/80">{task.topicResearch.expandedDescription}</p>
              {task.topicResearch.keyFacts.length > 0 && (
                <ul className="list-disc pl-4 text-muted-foreground space-y-0.5">
                  {task.topicResearch.keyFacts.map((fact, i) => (
                    <li key={i}>{fact}</li>
                  ))}
                </ul>
              )}
              {/* P2: Knowledge Map */}
              {task.topicResearch.knowledgeMap && (
                <div className="space-y-1 pt-1 border-t border-border/50">
                  <p className="font-medium text-foreground/70">Knowledge Map:</p>
                  <div className="flex flex-wrap gap-1">
                    {task.topicResearch.knowledgeMap.core.map((c, i) => (
                      <span key={`c-${i}`} className="px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[10px] font-medium">{c}</span>
                    ))}
                    {task.topicResearch.knowledgeMap.sub.map((s, i) => (
                      <span key={`s-${i}`} className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px]">{s}</span>
                    ))}
                    {task.topicResearch.knowledgeMap.related.map((r, i) => (
                      <span key={`r-${i}`} className="px-1.5 py-0.5 rounded border border-border text-muted-foreground/60 text-[10px]">{r}</span>
                    ))}
                  </div>
                </div>
              )}
              {/* P2: Multi-angle narrative candidates */}
              {task.topicResearch.narrativeAngles && task.topicResearch.narrativeAngles.length > 0 ? (
                <div className="space-y-1 pt-1 border-t border-border/50">
                  <p className="font-medium text-foreground/70">Narrative Angles:</p>
                  {task.topicResearch.narrativeAngles.map((a, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className={`shrink-0 px-1 py-0.5 rounded text-[10px] font-medium ${
                        i === 0 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                      }`}>
                        {a.relevance}/10
                      </span>
                      <div className="flex-1">
                        <span className="text-foreground/80">{a.angle}</span>
                        {a.rationale && <span className="text-muted-foreground/60 ml-1">({a.rationale})</span>}
                      </div>
                      {i === 0 && (
                        <span className="shrink-0 px-1 py-0.5 rounded bg-success/10 text-success text-[10px]">
                          已采用
                        </span>
                      )}
                    </div>
                  ))}
                  {isScriptReady && task.topicResearch.narrativeAngles.length > 1 && (
                    <p className="text-[10px] text-muted-foreground/50 italic">
                      点击「重新生成脚本」可自动使用最高相关度角度
                    </p>
                  )}
                </div>
              ) : task.topicResearch.narrativeAngle && (
                <p className="text-muted-foreground italic">
                  Narrative: {task.topicResearch.narrativeAngle}
                </p>
              )}
            </div>
          </details>
        )}

        {/* Director outline */}
        {task.narrativeOutline && (
          <details className="text-left mx-auto max-w-lg no-print">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              Director Outline ({task.narrativeOutline.totalPanels} panels / {task.narrativeOutline.templateType})
            </summary>
            <div className="mt-2 p-3 rounded-lg bg-muted/50 text-xs space-y-2">
              {task.narrativeOutline.narrativeArc && (
                <p className="text-foreground/80 italic">{task.narrativeOutline.narrativeArc}</p>
              )}
              <p className="text-muted-foreground">
                Info distribution: {task.narrativeOutline.infoDistribution}
              </p>
              <p className="text-muted-foreground">
                Source: {task.narrativeOutline.source ?? "legacy"}
              </p>
              {task.narrativeOutline.characterList.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {task.narrativeOutline.characterList.map((c, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]">
                      {c.name} ({c.role})
                    </span>
                  ))}
                </div>
              )}
              <ol className="list-decimal pl-4 text-muted-foreground space-y-0.5">
                {task.narrativeOutline.panels.map((p, i) => (
                  <li key={i}>
                    <span className="font-medium">[{p.narrativeFunction} / {p.beatRole}]</span>{" "}
                    {p.keyInfo}{" "}
                    <span className="text-[10px] opacity-60">
                      ({p.shotIntent}, {p.suggestedComposition}, {p.infoDensity}, goal: {p.knowledgeGoal})
                    </span>
                  </li>
                ))}
              </ol>
              {isScriptReady && (
                <button
                  onClick={handleRegenerateScript}
                  className="text-[10px] text-primary hover:underline"
                >
                  重新生成大纲和脚本
                </button>
              )}
            </div>
          </details>
        )}

        {/* 阅读/编辑模式切换 - 仅在高级模式显示 */}
        {!isSimpleMode && (isCompleted || isScriptReady || isImageQueuePaused || isDeepReviewPaused) && task.script?.panels && (
          <div className="flex justify-center gap-1 p-1 rounded-lg bg-muted/50 w-fit mx-auto no-print">
            {isScriptReady && (
              <button
                onClick={() => setViewMode("edit")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === "edit"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                编辑模式
              </button>
            )}
            <button
              onClick={() => setViewMode("read")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === "read"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              阅读模式
            </button>
            <button
              onClick={() => setViewMode("play")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === "play"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              播放模式
            </button>
          </div>
        )}
      </div>

      {/* 风格切换条 - 仅在高级模式显示 */}
      {!isSimpleMode && isScriptReady && task.script && (
        <StyleSwitcher
          currentStyle={task.script.style}
          generatingAll={generatingAll}
          onChangeStyle={handleChangeStyle}
        />
      )}

      {/* 生成动画 */}
      {showAnimation && (
        <div className="no-print space-y-3">
          <GeneratingAnimation
            status={animationStatus}
            progress={task.progress}
            taskId={taskId}
            totalPanels={totalPanels}
            completedPanels={completedPanels}
            qualityLevel={(task.generationConfig?.quality as "fast" | "standard" | "fine") || "standard"}
          />
          {isLegacyGenerating && (
            <div className="flex justify-center">
              <button
                onClick={() => cancelGeneration(taskId, -1)}
                className="px-4 py-2 text-sm border border-error/30 text-error rounded-lg hover:bg-error/5 transition-colors flex items-center gap-2 min-h-[40px]"
              >
                <X className="w-4 h-4" />
                取消生成
              </button>
            </div>
          )}
        </div>
      )}

      {showPausedResume && (
        <div className="p-4 rounded-xl border bg-warning/5 no-print">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-warning">
              {isImageQueuePaused ? "离页后图片生成已暂停。" : "离页后深度评审已暂停。"}
            </p>
            <button
              onClick={handleResumePausedTask}
              className="px-4 py-2 text-sm bg-warning text-white rounded-lg hover:bg-warning/90 transition-colors min-h-[40px] shrink-0"
            >
              {isImageQueuePaused ? "继续生成" : "继续评审"}
            </button>
          </div>
        </div>
      )}

      {showScriptReadyWorkspace && task.script && !isSimpleMode && (
        <ScriptReadyWorkspace
          taskStatus={task.status}
          panels={task.script.panels}
          selectedPanelIds={validSelectedPanelIds}
          queueSummary={task.queueSummary}
          comfyuiRemotePendingCount={task.comfyuiRemotePendingCount}
          generatingAll={generatingAll}
          llmConfigs={storedConfigs.llmConfigs}
          imageConfigs={storedConfigs.imageConfigs}
          activeLLMId={storedConfigs.activeLLMId ?? ""}
          activeImageId={storedConfigs.activeImageId ?? ""}
          selectedLLMId={selectedLLMId}
          selectedImageId={selectedImageId}
          onSelectedLLMIdChange={setSelectedLLMId}
          onSelectedImageIdChange={setSelectedImageId}
          onRegenerateScript={handleRegenerateScript}
          onTogglePanelSelection={handleTogglePanelSelection}
          onQueuePanel={handleQueuePanel}
          onQueueSelected={handleQueueSelected}
          onContinueRemaining={handleContinueRemaining}
          onPauseQueue={handlePauseQueue}
          onResumeQueue={handleResumeQueue}
        />
      )}

      {/* Detail tabs: Accuracy / Script Validation / Quality Score - 仅在高级模式显示 */}
      {!isSimpleMode && (isScriptReady || isCompleted || isDeepReviewRunning || isDeepReviewPaused) && (
        <DetailTabs tabs={[
          {
            id: "accuracy",
            label: "准确性",
            badge: (task.accuracyReview?.status === "repair_required" || task.accuracyReview?.status === "blocked")
              ? (task.accuracyReview.repairableIssueCount ?? 0) + (task.accuracyReview.blockingIssueCount ?? 0)
              : undefined,
            content: <AccuracySummary task={task} />,
            visible: !!(task.researchBrief || task.accuracyReview || task.accuracyErrorSummary || task.factPack?.sourceEntries?.length),
          },
          {
            id: "validation",
            label: "脚本校验",
            badge: task.scriptValidation?.warnings.filter(w => w.severity === "critical" || w.severity === "warning").length,
            content: task.scriptValidation ? (
              <ScriptValidationPanel validation={task.scriptValidation} repairRounds={task.scriptRepairRounds} />
            ) : null,
            visible: !!(task.scriptValidation && task.scriptValidation.warnings.length > 0),
          },
          {
            id: "quality",
            label: "质量评分",
            badge: task.visualDiagnosisReport?.summary.highSeverityCount,
            content: (isCompleted || isDeepReviewRunning || isDeepReviewPaused) && task.script ? (
              <QualityScorePanel
                script={task.script}
                cachedScore={task.qualityScore}
                cachedVisualScore={task.visualQualityScore}
                cachedVisualDiagnosisReport={task.visualDiagnosisReport}
                cachedVisualDiagnosisState={task.visualDiagnosisState}
                cachedVisualDiagnosisStale={task.visualDiagnosisStale}
                onSaveQualityScore={handleSaveQualityScore}
                onSaveVisualQualityScore={handleSaveVisualQualityScore}
                onSaveVisualDiagnosisReport={handleSaveVisualDiagnosisReport}
                onSaveVisualDiagnosisFailure={handleSaveVisualDiagnosisFailure}
                onBeginVisualRepairExecution={handleBeginVisualRepairExecution}
                onCompleteVisualRepairExecution={handleCompleteVisualRepairExecution}
                onFailVisualRepairExecution={handleFailVisualRepairExecution}
                onStartDeepReview={handleStartDeepReview}
                onRetryPanels={handleVlmRetry}
                onRunDiagnosisRepair={handleRunDiagnosisRepair}
              />
            ) : null,
            visible: !!task.script && (
              !!task.qualityScore
              || !!task.visualQualityScore
              || !!task.visualDiagnosisReport
              || !!task.visualDiagnosisState
              || !!task.visualRetrySummary
            ),
          },
          {
            id: "director",
            label: "AI 导演",
            content: task.script ? (
              <DirectorSidebar task={task} />
            ) : null,
            visible: !!task.script && !!task.narrativeOutline,
          },
        ]} />
      )}

      {/* 失败面板重试提示 */}
      {isScriptReady && failedPanels > 0 && completedPanels > 0 && (
        <div className="p-4 rounded-xl border bg-warning/5 no-print">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
              <p className="text-sm text-warning">
                {failedPanels} 个面板未完成（已完成 {completedPanels}/{totalPanels}）
              </p>
            </div>
            <button
              onClick={handleRetryFailed}
              disabled={generatingAll}
              className="px-4 py-2 text-sm bg-warning text-white rounded-lg hover:bg-warning/90 transition-colors disabled:opacity-50 flex items-center gap-1.5 min-h-[40px] shrink-0"
            >
              <RefreshCw className="w-4 h-4" />
              {generatingAll ? "重试中..." : `重试失败面板 (${failedPanels})`}
            </button>
          </div>
        </div>
      )}

      {/* 参考图设置 - 仅在高级模式显示 */}
      {!isSimpleMode && isScriptReady && task.script && (
        <ReferenceImagePanel
          referenceImage={task.script.referenceImage}
          referenceImages={task.script.referenceImages}
          controlMode={task.script.controlMode}
          onImageChange={handleReferenceImageChange}
          onImagesChange={handleReferenceImagesChange}
          onControlModeChange={handleControlModeChange}
          title={task.script.title}
          referenceEntries={task.script.referenceEntries}
          onEntriesChange={handleRefEntriesChange}
          onRegenerateRef={handleRegenerateRef}
          onImg2Img={handleImg2Img}
          onRefVersionChange={handleRefVersionChange}
        />
      )}

      {/* 错误状态 */}
      {task.status === "failed" && (
        <div className="p-4 rounded-xl border bg-error/10 text-error no-print">
          {task.accuracyErrorSummary
            ? `高风险事实冲突，脚本未通过准确性校验（${task.accuracyErrorSummary.blockingIssueCount} 项）`
            : `生成失败：${task.error || "未知错误"}`}
        </div>
      )}

      {/* 操作错误提示（瞬态） */}
      {actionError && (
        <div className="p-3 rounded-xl border bg-warning/5 text-warning text-sm flex items-center justify-between no-print">
          <span>{actionError}</span>
          <button
            onClick={clearActionError}
            className="ml-2 p-1 rounded hover:bg-warning/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 漫画面板 */}
      {task.script?.panels && viewMode === "play" ? (
        <DynamicPlayer panels={task.script.panels} title={task.script.title} />
      ) : task.script?.panels && isScriptReady && viewMode === "edit" ? (
        <ScriptEditor script={task.script} onSave={handleScriptEditorSave} />
      ) : task.script?.panels && (
        <PanelGrid
          panels={task.script.panels}
          title={task.script.title}
          taskId={taskId}
          taskStatus={task.status}
          viewMode={viewMode === "read" ? "read" : "edit"}
          globalStyle={task.script.style}
          script={task.script}
          llmConfig={selectedLLMConfig}
          reviewStatus={task.reviewStatus}
          panelReview={task.panelReview}
          visualRetrySummary={task.visualRetrySummary}
          onPanelUpdate={handlePanelUpdate}
          onRegenerate={handleRegenerate}
          onCancel={handleCancel}
          onVersionChange={handleVersionChange}
          onReorder={handleReorder}
        />
      )}

      {/* VLM 评审进行中提示 */}

      {/* 知识测验 */}
      {isCompleted && task.script?.quiz && (
        <QuizPanel
          script={task.script}
          llmConfig={selectedLLMConfig}
          onQuizGenerated={handleQuizGenerated}
        />
      )}

      {/* 延伸阅读（仅 wikipedia/science 类型） */}
      {isCompleted && !!task.script?.relatedTopics?.length && (
        <RelatedTopicsPanel
          script={task.script}
          llmConfig={selectedLLMConfig}
          onRelatedTopicsGenerated={handleRelatedTopicsGenerated}
        />
      )}

      {/* 操作按钮 */}
      {isCompleted && task.script && (
        <CompletedActions
          script={task.script}
          taskId={taskId}
          llmConfigs={storedConfigs.llmConfigs}
          imageConfigs={storedConfigs.imageConfigs}
          activeLLMId={storedConfigs.activeLLMId ?? ""}
          activeImageId={storedConfigs.activeImageId ?? ""}
          selectedLLMId={selectedLLMId}
          selectedImageId={selectedImageId}
          onSelectedLLMIdChange={setSelectedLLMId}
          onSelectedImageIdChange={setSelectedImageId}
          onExportMarkdown={handleExportMarkdown}
        />
      )}

      {/* Sticky bottom action bar */}
      <StickyActionBar
        task={task}
        onExportMarkdown={handleExportMarkdown}
        onRegenerateScript={handleRegenerateScript}
        onContinueRemaining={handleContinueRemaining}
        generatingAll={generatingAll}
      />
    </div>
  );
}
