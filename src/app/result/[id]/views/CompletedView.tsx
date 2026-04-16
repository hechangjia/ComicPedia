"use client";

import { useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import type {
  GenerateTask,
  ComicPanel,
  QuizQuestion,
  RelatedTopic,
  PartialLLMConfig,
} from "@/lib/types";
import type { TaskActions } from "@/hooks/useTaskActions";
import { saveTask } from "@/lib/client/db";
import { downloadTextFile } from "@/lib/downloadUtils";
import { SectionErrorBoundary } from "@/components/ui/SectionErrorBoundary";
import { PanelGrid } from "@/components/result/PanelGrid";
import { CompositeScore } from "@/components/result/CompositeScore";
import { PipelineSummary } from "@/components/result/PipelineSummary";
import { PipelineTimeline } from "@/components/result/PipelineTimeline";
import { AccuracySummary } from "@/components/result/AccuracySummary";
import { ScriptValidationPanel } from "@/components/result/ScriptValidationPanel";
import { QualityScorePanel } from "@/components/result/QualityScorePanel";
import { DirectorSidebar } from "@/components/result/DirectorSidebar";
import { DetailTabs } from "@/components/result/DetailTabs";
import { CompletedActions } from "@/components/result/CompletedActions";
import { ScriptEditor } from "@/components/editor/ScriptEditor";
import { resolveResultViewMode, getResultContentSurface, type ResultViewMode } from "@/app/result/viewMode";
import { Settings, Sparkles } from "lucide-react";

const QuizPanel = dynamic(() =>
  import("@/components/result/QuizPanel").then((m) => ({ default: m.QuizPanel }))
);
const RelatedTopicsPanel = dynamic(() =>
  import("@/components/result/RelatedTopicsPanel").then((m) => ({ default: m.RelatedTopicsPanel }))
);
const DynamicPlayer = dynamic(() =>
  import("@/components/DynamicPlayer").then((m) => ({ default: m.DynamicPlayer }))
);

interface CompletedViewProps {
  task: GenerateTask;
  taskId: string;
  setTask: (updater: (prev: GenerateTask | null) => GenerateTask | null) => void;
  isSimpleMode: boolean;
  toggleMode: () => void;
  storedConfigs: {
    llmConfigs: { id: string; name?: string; model: string }[];
    imageConfigs: { id: string; name?: string; model: string }[];
    activeLLMId: string | null;
    activeImageId: string | null;
  };
  selectedLLMId: string;
  selectedImageId: string;
  onSelectedLLMIdChange: (id: string) => void;
  onSelectedImageIdChange: (id: string) => void;
  selectedLLMConfig?: PartialLLMConfig;
  actions: TaskActions;
}

export function CompletedView({
  task,
  taskId,
  setTask,
  isSimpleMode,
  toggleMode,
  storedConfigs,
  selectedLLMId,
  selectedImageId,
  onSelectedLLMIdChange,
  onSelectedImageIdChange,
  selectedLLMConfig,
  actions,
}: CompletedViewProps) {
  const [viewMode, setViewMode] = useState<ResultViewMode>("read");
  const resolvedViewMode = resolveResultViewMode(viewMode, task.status);
  const contentSurface = getResultContentSurface(resolvedViewMode, task.status);

  // Script editor save handler
  const handleScriptEditorSave = useCallback((panels: ComicPanel[]) => {
    setTask((prev) => {
      if (!prev?.script) return prev;
      const updated = { ...prev, script: { ...prev.script, panels }, updatedAt: new Date() };
      saveTask(updated).catch(console.error);
      return updated;
    });
  }, [setTask]);

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

  const handleExportMarkdown = useCallback(() => {
    if (!task.script) return;
    const lines: string[] = [];
    lines.push(`# ${task.script.title}`);
    lines.push("");
    lines.push(`> 主题：${task.script.topic}`);
    lines.push(`> 风格：${task.script.style}`);
    lines.push(`> 生成时间：${new Date().toLocaleString("zh-CN")}`);
    lines.push("");
    lines.push("---");
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
  }, [task.script]);

  if (!task.script) return null;

  const isDeepReviewRunning = task.status === "deep_review_running";
  const isDeepReviewPaused = task.status === "deep_review_paused";
  const showViewToggle = !isSimpleMode && (task.status === "completed" || isDeepReviewPaused);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* 标题 + 配置快照 */}
      <div className="text-center space-y-2 print-title">
        <h1 className="text-xl sm:text-2xl font-bold text-teal">
          {task.script.title}
        </h1>
        {task.script.topic && (
          <p className="text-muted-foreground text-sm no-print">{task.script.topic}</p>
        )}

        {task.generationConfig && (
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
          </div>
        )}

        <CompositeScore task={task} />

        {task.pipelineTrace && task.pipelineTrace.length > 0 ? (
          <PipelineTimeline trace={task.pipelineTrace} />
        ) : (
          <PipelineSummary task={task} />
        )}
      </div>

      {/* 模式切换条 */}
      <div className="flex items-center justify-center gap-3 no-print">
        {/* 阅读/编辑/播放切换 */}
        {showViewToggle && (
          <div className="flex gap-1 p-1 rounded-lg bg-muted/50">
            <button
              onClick={() => setViewMode("edit")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                resolvedViewMode === "edit"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              编辑
            </button>
            <button
              onClick={() => setViewMode("read")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                resolvedViewMode === "read"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              阅读
            </button>
            <button
              onClick={() => setViewMode("play")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                resolvedViewMode === "play"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              播放
            </button>
          </div>
        )}

        {/* 极简/高级模式切换 */}
        <button
          type="button"
          onClick={toggleMode}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border hover:bg-muted transition-colors min-h-[32px]"
        >
          {isSimpleMode ? (
            <>
              <Settings className="w-3.5 h-3.5" />
              <span>高级</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              <span>极简</span>
            </>
          )}
        </button>
      </div>

      {/* 高级模式: 详情标签页 */}
      {!isSimpleMode && (
        <SectionErrorBoundary name="质量详情">
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
            content: (
              <QualityScorePanel
                script={task.script}
                cachedScore={task.qualityScore}
                cachedVisualScore={task.visualQualityScore}
                cachedVisualDiagnosisReport={task.visualDiagnosisReport}
                cachedVisualDiagnosisState={task.visualDiagnosisState}
                cachedVisualDiagnosisStale={task.visualDiagnosisStale}
                onSaveQualityScore={actions.handleSaveQualityScore}
                onSaveVisualQualityScore={actions.handleSaveVisualQualityScore}
                onSaveVisualDiagnosisReport={actions.handleSaveVisualDiagnosisReport}
                onSaveVisualDiagnosisFailure={actions.handleSaveVisualDiagnosisFailure}
                onBeginVisualRepairExecution={actions.handleBeginVisualRepairExecution}
                onCompleteVisualRepairExecution={actions.handleCompleteVisualRepairExecution}
                onFailVisualRepairExecution={actions.handleFailVisualRepairExecution}
                onStartDeepReview={actions.handleStartDeepReview}
                onRetryPanels={actions.handleVlmRetry}
                onRunDiagnosisRepair={actions.handleRunDiagnosisRepair}
              />
            ),
            visible: !!(
              task.qualityScore
              || task.visualQualityScore
              || task.visualDiagnosisReport
              || task.visualDiagnosisState
              || task.visualRetrySummary
            ),
          },
          {
            id: "director",
            label: "AI 导演",
            content: <DirectorSidebar task={task} />,
            visible: !!task.narrativeOutline,
          },
        ]} />
        </SectionErrorBoundary>
      )}

      {/* 主内容区 */}
      <SectionErrorBoundary name="漫画面板">
      {contentSurface === "play" ? (
        <DynamicPlayer panels={task.script.panels} title={task.script.title} />
      ) : contentSurface === "script-editor" ? (
        <ScriptEditor script={task.script} onSave={handleScriptEditorSave} />
      ) : (
        <PanelGrid
          panels={task.script.panels}
          title={task.script.title}
          taskId={taskId}
          taskStatus={task.status}
          viewMode={resolvedViewMode === "read" ? "read" : "edit"}
          defaultEditing={resolvedViewMode === "edit"}
          globalStyle={task.script.style}
          script={task.script}
          llmConfig={selectedLLMConfig}
          reviewStatus={task.reviewStatus}
          panelReview={task.panelReview}
          visualRetrySummary={task.visualRetrySummary}
          onPanelUpdate={actions.handlePanelUpdate}
          onRegenerate={actions.handleRegenerate}
          onCancel={actions.handleCancel}
          onVersionChange={actions.handleVersionChange}
          onReorder={actions.handleReorder}
        />
      )}
      </SectionErrorBoundary>

      {/* 知识测验 */}
      {task.script.quiz && (
        <QuizPanel
          script={task.script}
          llmConfig={selectedLLMConfig}
          onQuizGenerated={handleQuizGenerated}
        />
      )}

      {/* 延伸阅读 */}
      {!!task.script.relatedTopics?.length && (
        <RelatedTopicsPanel
          script={task.script}
          llmConfig={selectedLLMConfig}
          onRelatedTopicsGenerated={handleRelatedTopicsGenerated}
        />
      )}

      {/* 操作按钮区 */}
      <CompletedActions
        script={task.script}
        taskId={taskId}
        llmConfigs={storedConfigs.llmConfigs}
        imageConfigs={storedConfigs.imageConfigs}
        activeLLMId={storedConfigs.activeLLMId ?? ""}
        activeImageId={storedConfigs.activeImageId ?? ""}
        selectedLLMId={selectedLLMId}
        selectedImageId={selectedImageId}
        onSelectedLLMIdChange={onSelectedLLMIdChange}
        onSelectedImageIdChange={onSelectedImageIdChange}
        onExportMarkdown={handleExportMarkdown}
      />
    </div>
  );
}
