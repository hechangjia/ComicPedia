"use client";

import { useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import type {
  ComicPanel,
  ComicStyle,
  ComicScript,
  GenerateTask,
  PanelReview,
  PanelReviewStatus,
  PartialLLMConfig,
  ReviewStatus,
  VisualRetryCycleStatus,
  VisualRetrySummary,
} from "@/lib/types";
import { EditablePanel } from "@/components/EditablePanel";

const ComicReader = dynamic(() =>
  import("@/components/ComicReader").then((m) => ({ default: m.ComicReader }))
);

interface PanelGridProps {
  panels: ComicPanel[];
  title: string;
  taskId: string;
  taskStatus: GenerateTask["status"];
  viewMode: "edit" | "read";
  defaultEditing?: boolean;
  globalStyle?: ComicStyle;
  script?: ComicScript;
  llmConfig?: PartialLLMConfig;
  reviewStatus?: ReviewStatus;
  panelReview?: PanelReview[] | null;
  visualRetrySummary?: VisualRetrySummary | null;
  onPanelUpdate: (index: number, updatedPanel: ComicPanel) => void;
  onRegenerate: (index: number, seedOverride?: number) => void;
  onCancel: (index: number) => void;
  onVersionChange: (panelIndex: number, versionIndex: number) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
}

const PANEL_REVIEW_LABELS: Record<PanelReviewStatus, string> = {
  reviewed: "已通过",
  needs_repair: "待修复",
  retrying: "修复中",
  failed: "修复失败",
};

const PANEL_REVIEW_BADGES: Record<PanelReviewStatus, string> = {
  reviewed: "bg-success/10 text-success",
  needs_repair: "bg-warning/10 text-warning",
  retrying: "bg-info/10 text-info",
  failed: "bg-error/10 text-error",
};

const TASK_REVIEW_LABELS: Record<ReviewStatus, string> = {
  unreviewed: "未评审",
  reviewed: "已评审",
  needs_repair: "需修复",
};

const TASK_REVIEW_BADGES: Record<ReviewStatus, string> = {
  unreviewed: "bg-muted text-muted-foreground",
  reviewed: "bg-success/10 text-success",
  needs_repair: "bg-warning/10 text-warning",
};

const RETRY_STATUS_LABELS: Record<VisualRetryCycleStatus, string> = {
  running: "自动修复中",
  completed: "自动修复完成",
  failed: "自动修复失败",
  skipped: "自动修复已跳过",
};

const RETRY_STATUS_BADGES: Record<VisualRetryCycleStatus, string> = {
  running: "bg-info/10 text-info",
  completed: "bg-success/10 text-success",
  failed: "bg-error/10 text-error",
  skipped: "bg-muted text-muted-foreground",
};

export function PanelGrid({
  panels,
  title,
  taskId,
  taskStatus,
  viewMode,
  defaultEditing = false,
  globalStyle,
  script,
  llmConfig,
  reviewStatus,
  panelReview,
  visualRetrySummary,
  onPanelUpdate,
  onRegenerate,
  onCancel,
  onVersionChange,
  onReorder,
}: PanelGridProps) {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragSourceIndex = useRef<number | null>(null);
  const canReorder = taskStatus === "script_ready" && !!onReorder;
  const reviews = panelReview ?? [];
  const reviewByIndex = new Map(reviews.map((item) => [item.panelIndex, item]));
  const reviewedCount = reviews.filter((item) => item.status === "reviewed").length;
  const needsRepairCount = reviews.filter((item) => item.status === "needs_repair").length;
  const retryingCount = reviews.filter((item) => item.status === "retrying").length;
  const failedCount = reviews.filter((item) => item.status === "failed").length;
  const showReviewSummary = !!reviewStatus || reviews.length > 0 || !!visualRetrySummary;

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    if (!canReorder) return;
    dragSourceIndex.current = index;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
    const el = e.currentTarget as HTMLElement;
    el.style.opacity = "0.5";
  }, [canReorder]);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = "1";
    setDragOverIndex(null);
    dragSourceIndex.current = null;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    if (!canReorder) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragSourceIndex.current !== null && dragSourceIndex.current !== index) {
      setDragOverIndex(index);
    }
  }, [canReorder]);

  const handleDrop = useCallback((e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    const fromIndex = dragSourceIndex.current;
    dragSourceIndex.current = null;
    if (fromIndex !== null && fromIndex !== toIndex && onReorder) {
      onReorder(fromIndex, toIndex);
    }
  }, [onReorder]);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  return (
    <>
      {showReviewSummary && (
        <div className="rounded-xl border bg-card p-4 space-y-3 no-print">
          <div className="flex flex-wrap items-center gap-2">
            {reviewStatus && (
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${TASK_REVIEW_BADGES[reviewStatus]}`}>
                任务评审：{TASK_REVIEW_LABELS[reviewStatus]}
              </span>
            )}
            {visualRetrySummary && (
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${RETRY_STATUS_BADGES[visualRetrySummary.status]}`}>
                {RETRY_STATUS_LABELS[visualRetrySummary.status]}
              </span>
            )}
            {visualRetrySummary && visualRetrySummary.attemptedPanels.length > 0 && (
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                已尝试修复 {visualRetrySummary.attemptedPanels.length} 格
              </span>
            )}
            {visualRetrySummary?.finalOverallScore !== undefined && (
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                总分 {visualRetrySummary.initialOverallScore} → {visualRetrySummary.finalOverallScore}
              </span>
            )}
          </div>

          {reviews.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="px-2 py-1 rounded-full bg-muted/70">已评审 {reviews.length}/{panels.length}</span>
              {reviewedCount > 0 && <span className="px-2 py-1 rounded-full bg-success/10 text-success">通过 {reviewedCount}</span>}
              {needsRepairCount > 0 && <span className="px-2 py-1 rounded-full bg-warning/10 text-warning">待修复 {needsRepairCount}</span>}
              {retryingCount > 0 && <span className="px-2 py-1 rounded-full bg-info/10 text-info">修复中 {retryingCount}</span>}
              {failedCount > 0 && <span className="px-2 py-1 rounded-full bg-error/10 text-error">失败 {failedCount}</span>}
            </div>
          )}

          {viewMode === "read" && reviews.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {panels.map((_, index) => {
                const review = reviewByIndex.get(index);
                if (!review) {
                  return (
                    <span key={index} className="px-2 py-0.5 rounded-full text-[11px] bg-muted text-muted-foreground">
                      P{index + 1} 未评审
                    </span>
                  );
                }
                return (
                  <span key={index} className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${PANEL_REVIEW_BADGES[review.status]}`}>
                    P{index + 1} {PANEL_REVIEW_LABELS[review.status]} · {review.score}/10
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {viewMode === "read" ? (
        <ComicReader panels={panels} title={title} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 print-grid">
          {panels.map((panel: ComicPanel, index: number) => {
            const review = reviewByIndex.get(index);
            return (
              <div
                key={panel.id}
                draggable={canReorder}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragLeave={handleDragLeave}
                className={`space-y-2 transition-all ${
                  canReorder ? "cursor-grab active:cursor-grabbing" : ""
                } ${
                  dragOverIndex === index
                    ? "ring-2 ring-primary ring-offset-2 scale-[1.02]"
                    : ""
                }`}
              >
                {review && (
                  <div className="flex items-center justify-between gap-2 px-1 no-print">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${PANEL_REVIEW_BADGES[review.status]}`}>
                      P{index + 1} {PANEL_REVIEW_LABELS[review.status]}
                    </span>
                    <div className="text-[11px] text-muted-foreground text-right">
                      <span className="font-medium text-foreground/80">{review.score}/10</span>
                      {review.issues.length > 0 && <span> · {review.issues.length} 项问题</span>}
                    </div>
                  </div>
                )}
                <EditablePanel
                  panel={panel}
                  index={index}
                  taskId={taskId}
                  taskStatus={taskStatus}
                  defaultEditing={defaultEditing}
                  globalStyle={globalStyle}
                  script={script}
                  llmConfig={llmConfig}
                  onUpdate={onPanelUpdate}
                  onRegenerate={onRegenerate}
                  onCancel={onCancel}
                  onVersionChange={onVersionChange}
                />
              </div>
            );
          })}
        </div>
      )}

      {viewMode === "read" && (
        <div className="hidden print:!block">
          <div className="print-grid">
            {panels.map((panel: ComicPanel, index: number) => (
              <div key={panel.id} className="print-panel">
                <div className="print-panel-image relative">
                  {panel.imageUrl && !panel.imageUrl.startsWith("data:text/plain") && (
                    <img src={panel.imageUrl} alt={panel.scene} />
                  )}
                  <div className="print-panel-number">{index + 1}</div>
                </div>
                <div className="print-panel-text">
                  {panel.dialogue && <p className="dialogue">{panel.dialogue}</p>}
                  {panel.scene && panel.scene !== panel.dialogue && (
                    <p className="scene-desc">{panel.scene}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
