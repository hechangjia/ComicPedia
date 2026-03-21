"use client";

import dynamic from "next/dynamic";
import { ComicPanel, GenerateTask } from "@/lib/types";
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
  onPanelUpdate: (index: number, updatedPanel: ComicPanel) => void;
  onRegenerate: (index: number) => void;
  onCancel: (index: number) => void;
  onVersionChange: (panelIndex: number, versionIndex: number) => void;
}

export function PanelGrid({
  panels,
  title,
  taskId,
  taskStatus,
  viewMode,
  onPanelUpdate,
  onRegenerate,
  onCancel,
  onVersionChange,
}: PanelGridProps) {
  return (
    <>
      {viewMode === "read" ? (
        <ComicReader panels={panels} title={title} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 print-grid">
          {panels.map((panel: ComicPanel, index: number) => (
            <EditablePanel
              key={panel.id}
              panel={panel}
              index={index}
              taskId={taskId}
              taskStatus={taskStatus}
              onUpdate={onPanelUpdate}
              onRegenerate={onRegenerate}
              onCancel={onCancel}
              onVersionChange={onVersionChange}
            />
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
