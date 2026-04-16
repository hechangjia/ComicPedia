"use client";

import { useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import type {
  GenerateTask,
  ComicPanel,
  PartialLLMConfig,
} from "@/lib/types";
import type { TaskActions } from "@/hooks/useTaskActions";
import { saveTask } from "@/lib/client/db";
import { PanelGrid } from "@/components/result/PanelGrid";
import { StyleSwitcher } from "@/components/result/StyleSwitcher";
import { ScriptReadyWorkspace } from "@/components/result/ScriptReadyWorkspace";
import { ScriptValidationPanel } from "@/components/result/ScriptValidationPanel";
import { AccuracySummary } from "@/components/result/AccuracySummary";
import { DetailTabs } from "@/components/result/DetailTabs";
import { StickyActionBar } from "@/components/result/StickyActionBar";
import { ScriptEditor } from "@/components/editor/ScriptEditor";
import { getResultContentSurface, resolveResultViewMode, type ResultViewMode } from "@/app/result/viewMode";
import { AlertTriangle, RefreshCw, Settings, Sparkles } from "lucide-react";

const DynamicPlayer = dynamic(() =>
  import("@/components/DynamicPlayer").then((m) => ({ default: m.DynamicPlayer }))
);

const ReferenceImagePanel = dynamic(() =>
  import("@/components/ReferenceImagePanel").then((m) => ({ default: m.ReferenceImagePanel }))
);

interface ScriptReadyViewProps {
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

export function ScriptReadyView({
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
}: ScriptReadyViewProps) {
  const [viewMode, setViewMode] = useState<ResultViewMode>("edit");
  const [selectedPanelIds, setSelectedPanelIds] = useState<number[]>([]);

  const resolvedViewMode = resolveResultViewMode(viewMode, task.status);
  const contentSurface = getResultContentSurface(resolvedViewMode, task.status);

  const panels = useMemo(() => task.script?.panels ?? [], [task.script?.panels]);
  const totalPanels = panels.length;
  const completedPanels = panels.filter(p => p.status === "completed").length;
  const failedPanels = panels.filter(p => p.status === "failed" || p.status === "pending").length;

  const validSelectedPanelIds = useMemo(() =>
    selectedPanelIds.filter((id) => panels.some((p) => p.id === id)),
    [selectedPanelIds, panels],
  );
  const selectedPanelIndices = useMemo(() =>
    panels.flatMap((panel, i) => validSelectedPanelIds.includes(panel.id) ? [i] : []),
    [panels, validSelectedPanelIds],
  );

  const handleTogglePanelSelection = useCallback((panelId: number, checked: boolean) => {
    setSelectedPanelIds((prev) =>
      checked ? (prev.includes(panelId) ? prev : [...prev, panelId]) : prev.filter((v) => v !== panelId),
    );
  }, []);

  const handleQueueSelected = useCallback(async () => {
    const queued = await actions.handleQueueSelectedPanels(selectedPanelIndices);
    if (queued) setSelectedPanelIds([]);
  }, [actions, selectedPanelIndices]);

  const handleScriptEditorSave = useCallback((updatedPanels: ComicPanel[]) => {
    setTask((prev) => {
      if (!prev?.script) return prev;
      const updated = { ...prev, script: { ...prev.script, panels: updatedPanels }, updatedAt: new Date() };
      saveTask(updated).catch(console.error);
      return updated;
    });
  }, [setTask]);

  if (!task.script) return null;

  const isQueueActive = task.status === "image_queue_running" || task.status === "calibrating" || task.status === "image_queue_paused";

  const showViewToggle = !isSimpleMode && (task.status === "script_ready" || task.status === "image_queue_paused");

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* 标题 */}
      <div className="text-center space-y-2">
        <h1 className="text-xl sm:text-2xl font-bold text-teal">
          {task.script.title}
        </h1>
        {task.script.topic && (
          <p className="text-muted-foreground text-sm no-print">{task.script.topic}</p>
        )}

        {/* 模式切换 */}
        <div className="flex items-center justify-center gap-3 no-print">
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
          <button
            type="button"
            onClick={toggleMode}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border hover:bg-muted transition-colors min-h-[32px]"
          >
            {isSimpleMode ? <><Settings className="w-3.5 h-3.5" /><span>高级</span></> : <><Sparkles className="w-3.5 h-3.5" /><span>极简</span></>}
          </button>
        </div>
      </div>

      {/* 风格切换 */}
      {!isSimpleMode && task.status === "script_ready" && (
        <StyleSwitcher
          currentStyle={task.script.style}
          generatingAll={actions.generatingAll}
          onChangeStyle={actions.handleChangeStyle}
        />
      )}

      {/* 队列工作区 */}
      {!isSimpleMode && (
        <ScriptReadyWorkspace
          taskStatus={task.status}
          panels={task.script.panels}
          selectedPanelIds={validSelectedPanelIds}
          queueSummary={task.queueSummary}
          comfyuiRemotePendingCount={task.comfyuiRemotePendingCount}
          generatingAll={actions.generatingAll}
          llmConfigs={storedConfigs.llmConfigs}
          imageConfigs={storedConfigs.imageConfigs}
          activeLLMId={storedConfigs.activeLLMId ?? ""}
          activeImageId={storedConfigs.activeImageId ?? ""}
          selectedLLMId={selectedLLMId}
          selectedImageId={selectedImageId}
          onSelectedLLMIdChange={onSelectedLLMIdChange}
          onSelectedImageIdChange={onSelectedImageIdChange}
          onRegenerateScript={actions.handleRegenerateScript}
          onTogglePanelSelection={handleTogglePanelSelection}
          onQueuePanel={actions.handleQueuePanel}
          onQueueSelected={handleQueueSelected}
          onContinueRemaining={actions.handleContinueRemaining}
          onPauseQueue={actions.handlePauseQueue}
          onResumeQueue={actions.handleResumeQueue}
        />
      )}

      {/* 高级详情标签 */}
      {!isSimpleMode && (
        <DetailTabs tabs={[
          {
            id: "accuracy",
            label: "准确性",
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
        ]} />
      )}

      {/* 失败面板重试提示 */}
      {failedPanels > 0 && completedPanels > 0 && (
        <div className="p-4 rounded-xl border bg-warning/5 no-print">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
              <p className="text-sm text-warning">
                {failedPanels} 个面板未完成（已完成 {completedPanels}/{totalPanels}）
              </p>
            </div>
            <button
              onClick={actions.handleRetryFailed}
              disabled={actions.generatingAll}
              className="px-4 py-2 text-sm bg-warning text-white rounded-lg hover:bg-warning/90 transition-colors disabled:opacity-50 flex items-center gap-1.5 min-h-[40px] shrink-0"
            >
              <RefreshCw className="w-4 h-4" />
              重试失败面板
            </button>
          </div>
        </div>
      )}

      {/* 参考图 */}
      {!isSimpleMode && task.status === "script_ready" && (
        <ReferenceImagePanel
          referenceImage={task.script.referenceImage}
          referenceImages={task.script.referenceImages}
          controlMode={task.script.controlMode}
          onImageChange={actions.handleReferenceImageChange}
          onImagesChange={actions.handleReferenceImagesChange}
          onControlModeChange={actions.handleControlModeChange}
          title={task.script.title}
          referenceEntries={task.script.referenceEntries}
          onEntriesChange={actions.handleRefEntriesChange}
          onRegenerateRef={actions.handleRegenerateRef}
          onImg2Img={actions.handleImg2Img}
          onRefVersionChange={actions.handleRefVersionChange}
        />
      )}

      {/* 主内容 */}
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
          globalStyle={task.script.style}
          script={task.script}
          llmConfig={selectedLLMConfig}
          onPanelUpdate={actions.handlePanelUpdate}
          onRegenerate={actions.handleRegenerate}
          onCancel={actions.handleCancel}
          onVersionChange={actions.handleVersionChange}
          onReorder={actions.handleReorder}
        />
      )}

      {/* 底部固定操作栏 */}
      <StickyActionBar
        task={task}
        onExportMarkdown={() => {}}
        onRegenerateScript={actions.handleRegenerateScript}
        onContinueRemaining={actions.handleContinueRemaining}
        generatingAll={actions.generatingAll}
      />
    </div>
  );
}
