"use client";

import Link from "next/link";
import { GenerateTask } from "@/lib/types";
import { AlertTriangle } from "lucide-react";

interface FailedViewProps {
  task: GenerateTask;
  backHref: string;
}

export function FailedView({ task, backHref }: FailedViewProps) {
  const errorMessage = task.accuracyErrorSummary
    ? `高风险事实冲突，脚本未通过准确性校验（${task.accuracyErrorSummary.blockingIssueCount} 项）`
    : task.error || "未知错误";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-xl sm:text-2xl font-bold text-teal">
          {task.script?.title || "生成失败"}
        </h1>
      </div>

      <div className="p-6 rounded-xl border bg-error/10">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-error shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="text-error font-medium">生成失败</p>
            <p className="text-error/80 text-sm">{errorMessage}</p>
          </div>
        </div>
      </div>

      <div className="text-center">
        <Link
          href={backHref}
          className="inline-block px-6 py-2 rounded-lg bg-primary text-primary-foreground min-h-[44px]"
        >
          {backHref === "/" ? "返回首页" : "返回历史"}
        </Link>
      </div>
    </div>
  );
}
