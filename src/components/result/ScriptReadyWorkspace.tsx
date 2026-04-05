"use client";

import type { ComicPanel, GenerateTask, TaskQueueSummary } from "@/lib/types";
import { ScriptReadyBar } from "@/components/result/ScriptReadyBar";
import { PanelQueueToolbar } from "@/components/result/PanelQueueToolbar";

interface LLMConfig {
  id: string;
  name?: string;
  model: string;
}

interface ImageConfig {
  id: string;
  name?: string;
  model: string;
}

interface ScriptReadyWorkspaceProps {
  taskStatus: GenerateTask["status"];
  panels: ComicPanel[];
  selectedPanelIds: number[];
  queueSummary?: TaskQueueSummary;
  generatingAll: boolean;
  llmConfigs: LLMConfig[];
  imageConfigs: ImageConfig[];
  activeLLMId: string;
  activeImageId: string;
  selectedLLMId: string;
  selectedImageId: string;
  onSelectedLLMIdChange: (id: string) => void;
  onSelectedImageIdChange: (id: string) => void;
  onRegenerateScript: () => void;
  onTogglePanelSelection: (panelId: number, checked: boolean) => void;
  onQueuePanel: (panelIndex: number) => void;
  onQueueSelected: () => void;
  onContinueRemaining: () => void;
  onPauseQueue: () => void;
  onResumeQueue: () => void;
}

function getPanelStatusLabel(panel: ComicPanel): string {
  if (panel.status === "completed") return "已生成";
  if (panel.status === "generating") return "生成中";
  if (panel.status === "failed") return "失败";
  return "待处理";
}

export function ScriptReadyWorkspace({
  taskStatus,
  panels,
  selectedPanelIds,
  queueSummary,
  generatingAll,
  llmConfigs,
  imageConfigs,
  activeLLMId,
  activeImageId,
  selectedLLMId,
  selectedImageId,
  onSelectedLLMIdChange,
  onSelectedImageIdChange,
  onRegenerateScript,
  onTogglePanelSelection,
  onQueuePanel,
  onQueueSelected,
  onContinueRemaining,
  onPauseQueue,
  onResumeQueue,
}: ScriptReadyWorkspaceProps) {
  const completedPanels = panels.filter((panel) => panel.status === "completed").length;
  const pendingPanels = panels.filter((panel) => panel.status !== "completed").length;

  return (
    <div className="space-y-4 no-print">
      <ScriptReadyBar
        completedPanels={completedPanels}
        totalPanels={panels.length}
        pendingPanels={pendingPanels}
        generatingAll={generatingAll}
        llmConfigs={llmConfigs}
        imageConfigs={imageConfigs}
        activeLLMId={activeLLMId}
        activeImageId={activeImageId}
        selectedLLMId={selectedLLMId}
        selectedImageId={selectedImageId}
        onSelectedLLMIdChange={onSelectedLLMIdChange}
        onSelectedImageIdChange={onSelectedImageIdChange}
        onRegenerateScript={onRegenerateScript}
      />

      <PanelQueueToolbar
        taskStatus={taskStatus}
        pendingPanels={pendingPanels}
        selectedCount={selectedPanelIds.length}
        queueSummary={queueSummary}
        actionPending={generatingAll}
        onQueueSelected={onQueueSelected}
        onContinueRemaining={onContinueRemaining}
        onPauseQueue={onPauseQueue}
        onResumeQueue={onResumeQueue}
      />

      <div className="rounded-xl border bg-card divide-y no-print">
        {panels.map((panel, index) => (
          <div key={panel.id} className="p-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                aria-label={`选择第 ${index + 1} 格`}
                checked={selectedPanelIds.includes(panel.id)}
                onChange={(event) => onTogglePanelSelection(panel.id, event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-border"
              />
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">第 {index + 1} 格</p>
                  <span className="px-2 py-0.5 rounded-full text-[11px] bg-muted text-muted-foreground">
                    {getPanelStatusLabel(panel)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{panel.scene}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{panel.imagePrompt}</p>
              </div>
            </div>
            <button
              type="button"
              aria-label={`生成本张-${index}`}
              onClick={() => onQueuePanel(index)}
              disabled={generatingAll}
              className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors disabled:opacity-50 min-h-[40px] shrink-0"
            >
              生成本张
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
