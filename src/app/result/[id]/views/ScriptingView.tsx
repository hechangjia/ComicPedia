"use client";

import { GenerateTask, GenerateTaskStatus } from "@/lib/types";
import { cancelGeneration } from "@/lib/client/generator";
import { GeneratingAnimation } from "@/components/GeneratingAnimation";
import { X } from "lucide-react";

interface ScriptingViewProps {
  task: GenerateTask;
}

const animationStatusMap: Record<string, "pending" | "scripting"> = {
  created: "pending",
};

export function ScriptingView({ task }: ScriptingViewProps) {
  const totalPanels = task.script?.panels.length ?? 0;
  const completedPanels = task.script?.panels.filter(p => p.status === "completed").length ?? 0;
  const animationStatus = animationStatusMap[task.status] ?? "scripting";

  return (
    <div className="space-y-6">
      {/* 标题（可能还没生成） */}
      <div className="text-center space-y-2">
        <h1 className="text-xl sm:text-2xl font-bold text-teal">
          {task.script?.title || "生成中..."}
        </h1>
        {task.script?.topic && (
          <p className="text-muted-foreground text-sm">{task.script.topic}</p>
        )}
      </div>

      {/* 生成动画 */}
      <div className="no-print space-y-3">
        <GeneratingAnimation
          status={animationStatus}
          progress={task.progress}
          taskId={task.id}
          totalPanels={totalPanels}
          completedPanels={completedPanels}
          qualityLevel={(task.generationConfig?.quality as "fast" | "standard" | "fine") || "standard"}
        />
      </div>
    </div>
  );
}
