"use client";

import type { GenerateTask } from "@/lib/types";

interface StickyActionBarProps {
  task: GenerateTask;
  onExportMarkdown: () => void;
  onRegenerateScript: () => void;
  generatingAll: boolean;
}

export function StickyActionBar({ task, onExportMarkdown, onRegenerateScript, generatingAll }: StickyActionBarProps) {
  const status = task.status;
  if (status !== "completed" && status !== "script_ready") return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 no-print">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 px-4 py-2.5">
        <span className="text-xs text-muted-foreground truncate">
          {task.script?.title}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {status === "script_ready" && (
            <button
              onClick={onRegenerateScript}
              disabled={generatingAll}
              className="px-3 py-1.5 text-xs border rounded-lg hover:bg-muted transition-colors disabled:opacity-50 min-h-[36px]"
            >
              重新生成脚本
            </button>
          )}
          {task.script && (
            <button
              onClick={onExportMarkdown}
              className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors min-h-[36px]"
            >
              导出 Markdown
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
