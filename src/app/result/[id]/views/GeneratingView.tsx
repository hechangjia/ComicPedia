"use client";

import { GenerateTask } from "@/lib/types";
import { cancelGeneration } from "@/lib/client/generator";
import { GeneratingAnimation } from "@/components/GeneratingAnimation";
import { PanelGrid } from "@/components/result/PanelGrid";
import { X } from "lucide-react";

interface GeneratingViewProps {
  task: GenerateTask;
  taskId: string;
  isSimpleMode: boolean;
  onPanelUpdate: (index: number, updatedPanel: import("@/lib/types").ComicPanel) => void;
  onRegenerate: (index: number, seedOverride?: number) => void;
  onCancel: (index: number) => void;
  onVersionChange: (panelIndex: number, versionIndex: number) => void;
  llmConfig?: import("@/lib/types").PartialLLMConfig;
}

export function GeneratingView({
  task,
  taskId,
  isSimpleMode,
  onPanelUpdate,
  onRegenerate,
  onCancel,
  onVersionChange,
  llmConfig,
}: GeneratingViewProps) {
  const totalPanels = task.script?.panels.length ?? 0;
  const completedPanels = task.script?.panels.filter(p => p.status === "completed").length ?? 0;
  const isLegacyGenerating = task.status === "generating";

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="text-center space-y-2">
        <h1 className="text-xl sm:text-2xl font-bold text-teal">
          {task.script?.title || "生成中..."}
        </h1>
        {task.script?.topic && (
          <p className="text-muted-foreground text-sm">{task.script.topic}</p>
        )}
      </div>

      {/* 进度动画 */}
      <div className="no-print space-y-3">
        <GeneratingAnimation
          status="generating"
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

      {/* 实时面板预览 */}
      {task.script?.panels && (
        <PanelGrid
          panels={task.script.panels}
          title={task.script.title}
          taskId={taskId}
          taskStatus={task.status}
          viewMode="edit"
          globalStyle={task.script.style}
          script={task.script}
          llmConfig={llmConfig}
          onPanelUpdate={onPanelUpdate}
          onRegenerate={onRegenerate}
          onCancel={onCancel}
          onVersionChange={onVersionChange}
        />
      )}
    </div>
  );
}
