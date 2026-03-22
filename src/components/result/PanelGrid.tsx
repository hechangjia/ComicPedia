"use client";

import { useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { ComicPanel, ComicStyle, ComicScript, GenerateTask, PartialLLMConfig } from "@/lib/types";
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
  globalStyle?: ComicStyle;
  script?: ComicScript;
  llmConfig?: PartialLLMConfig;
  onPanelUpdate: (index: number, updatedPanel: ComicPanel) => void;
  onRegenerate: (index: number, seedOverride?: number) => void;
  onCancel: (index: number) => void;
  onVersionChange: (panelIndex: number, versionIndex: number) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
}

export function PanelGrid({
  panels,
  title,
  taskId,
  taskStatus,
  viewMode,
  globalStyle,
  script,
  llmConfig,
  onPanelUpdate,
  onRegenerate,
  onCancel,
  onVersionChange,
  onReorder,
}: PanelGridProps) {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragSourceIndex = useRef<number | null>(null);
  const canReorder = (taskStatus === "script_ready" || taskStatus === "completed") && !!onReorder;

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    if (!canReorder) return;
    dragSourceIndex.current = index;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
    // 半透明拖拽预览
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
      {viewMode === "read" ? (
        <ComicReader panels={panels} title={title} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 print-grid">
          {panels.map((panel: ComicPanel, index: number) => (
            <div
              key={panel.id}
              draggable={canReorder}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragLeave={handleDragLeave}
              className={`transition-all ${
                canReorder ? "cursor-grab active:cursor-grabbing" : ""
              } ${
                dragOverIndex === index
                  ? "ring-2 ring-primary ring-offset-2 scale-[1.02]"
                  : ""
              }`}
            >
              <EditablePanel
                panel={panel}
                index={index}
                taskId={taskId}
                taskStatus={taskStatus}
                globalStyle={globalStyle}
                script={script}
                llmConfig={llmConfig}
                onUpdate={onPanelUpdate}
                onRegenerate={onRegenerate}
                onCancel={onCancel}
                onVersionChange={onVersionChange}
              />
            </div>
          ))}
        </div>
      )}

      {/* 打印专用 DOM */}
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
