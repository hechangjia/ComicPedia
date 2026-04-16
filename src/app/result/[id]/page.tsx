"use client";

import { useState, useMemo, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { GenerateTaskStatus } from "@/lib/types";
import { TitleSkeleton, ComicGridSkeleton } from "@/components/Skeleton";
import { useTaskSubscription } from "@/hooks/useTaskSubscription";
import { resumeTaskLifecycle, useTaskPageLifecycle } from "@/hooks/useTaskPageLifecycle";
import { useTaskActions } from "@/hooks/useTaskActions";
import { getStoredConfigs, getStoredRequestConfigs } from "@/hooks/useAPIConfig";
import { useUIMode } from "@/hooks/useUIMode";
import { resolveResultBackHref } from "@/app/history/historyNavigation";
import { ScriptingView, ScriptReadyView, GeneratingView, CompletedView, FailedView } from "./views";
import { StickyActionBar } from "@/components/result/StickyActionBar";
import "@/app/result/print.css";
import { ChevronLeft, X } from "lucide-react";

const SCRIPTING_STATUSES = new Set<GenerateTaskStatus>([
  "pending", "scripting", "created", "research_running", "script_running",
]);

const SCRIPT_READY_STATUSES = new Set<GenerateTaskStatus>([
  "script_ready", "image_queue_running", "image_queue_paused",
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

  // Model selection
  const storedConfigs = useMemo(() => getStoredConfigs(), []);
  const [selectedImageId, setSelectedImageId] = useState(storedConfigs.activeImageId ?? "");
  const [selectedLLMId, setSelectedLLMId] = useState(storedConfigs.activeLLMId ?? "");
  const selectedLLMConfig = useMemo(
    () => getStoredRequestConfigs(selectedLLMId || undefined).llmConfig,
    [selectedLLMId],
  );

  const actions = useTaskActions(taskId, setTask, selectedImageId, selectedLLMId);

  // Resume paused tasks
  const handleResumePausedTask = useCallback(async () => {
    if (task?.status === "image_queue_paused" || task?.status === "deep_review_paused") {
      const resumedTask = await resumeTaskLifecycle(taskId);
      if (resumedTask) setTask(resumedTask);
    }
  }, [setTask, task?.status, taskId]);

  // ── Error state ──
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

  // ── Loading state ──
  if (!task) {
    return (
      <div className="max-w-4xl mx-auto space-y-8">
        <TitleSkeleton />
        <ComicGridSkeleton count={4} />
      </div>
    );
  }

  // ── Route to the right view ──
  const status = task.status;

  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8 pb-20 print-container">
      {/* 返回按钮 */}
      <div className="flex items-center justify-between no-print">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[44px]"
        >
          <ChevronLeft className="w-4 h-4" />
          {backHref === "/" ? "返回" : "返回历史"}
        </Link>
      </div>

      {/* 操作错误提示 */}
      {actions.actionError && (
        <div className="p-3 rounded-xl border bg-warning/5 text-warning text-sm flex items-center justify-between no-print">
          <span>{actions.actionError}</span>
          <button
            onClick={actions.clearActionError}
            className="ml-2 p-1 rounded hover:bg-warning/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 暂停恢复提示 */}
      {(status === "image_queue_paused" || status === "deep_review_paused") && (
        <div className="p-4 rounded-xl border bg-warning/5 no-print">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-warning">
              {status === "image_queue_paused" ? "离页后图片生成已暂停。" : "离页后深度评审已暂停。"}
            </p>
            <button
              onClick={handleResumePausedTask}
              className="px-4 py-2 text-sm bg-warning text-white rounded-lg hover:bg-warning/90 transition-colors min-h-[40px] shrink-0"
            >
              {status === "image_queue_paused" ? "继续生成" : "继续评审"}
            </button>
          </div>
        </div>
      )}

      {/* 阶段视图路由 */}
      {status === "failed" ? (
        <FailedView task={task} backHref={backHref} />
      ) : SCRIPTING_STATUSES.has(status) ? (
        <ScriptingView task={task} />
      ) : status === "generating" || status === "calibrating" ? (
        <GeneratingView
          task={task}
          taskId={taskId}
          isSimpleMode={isSimpleMode}
          onPanelUpdate={actions.handlePanelUpdate}
          onRegenerate={actions.handleRegenerate}
          onCancel={actions.handleCancel}
          onVersionChange={actions.handleVersionChange}
          llmConfig={selectedLLMConfig}
        />
      ) : SCRIPT_READY_STATUSES.has(status) ? (
        <ScriptReadyView
          task={task}
          taskId={taskId}
          setTask={setTask}
          isSimpleMode={isSimpleMode}
          toggleMode={toggleMode}
          storedConfigs={storedConfigs}
          selectedLLMId={selectedLLMId}
          selectedImageId={selectedImageId}
          onSelectedLLMIdChange={setSelectedLLMId}
          onSelectedImageIdChange={setSelectedImageId}
          selectedLLMConfig={selectedLLMConfig}
          actions={actions}
        />
      ) : (
        <CompletedView
          task={task}
          taskId={taskId}
          setTask={setTask}
          isSimpleMode={isSimpleMode}
          toggleMode={toggleMode}
          storedConfigs={storedConfigs}
          selectedLLMId={selectedLLMId}
          selectedImageId={selectedImageId}
          onSelectedLLMIdChange={setSelectedLLMId}
          onSelectedImageIdChange={setSelectedImageId}
          selectedLLMConfig={selectedLLMConfig}
          actions={actions}
        />
      )}

      {/* Sticky bottom action bar — always at top level for script_ready */}
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
