"use client";

import type { GenerateTask } from "@/lib/types";

interface AccuracySummaryProps {
  task: GenerateTask;
}

export function AccuracySummary({ task }: AccuracySummaryProps) {
  if (!task.researchBrief && !task.accuracyReview && !task.accuracyErrorSummary) {
    return null;
  }

  const blocked = task.accuracyErrorSummary;
  const review = task.accuracyReview;
  const brief = task.researchBrief;
  const providerExecutions = task.factPack?.queryPlan.providerExecutions || [];

  return (
    <details className="text-left mx-auto max-w-lg no-print">
      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
        Accuracy Summary
        {brief ? (
          <span className="ml-1 opacity-60">
            ({brief.verifiedHardFactCount} hard facts / {brief.sourceTiersUsed.join(", ") || "no sources"})
          </span>
        ) : null}
      </summary>
      <div className="mt-2 p-3 rounded-lg bg-muted/50 text-xs space-y-2">
        {brief && (
          <>
            <p className="text-foreground/80">
              已验证硬事实：{brief.verifiedHardFactCount}
            </p>
            <p className="text-muted-foreground">
              来源层级：{brief.sourceTiersUsed.join(", ") || "无"}
            </p>
            {brief.majorRisks.length > 0 && (
              <ul className="list-disc pl-4 text-muted-foreground space-y-0.5">
                {brief.majorRisks.map((risk, index) => (
                  <li key={index}>{risk}</li>
                ))}
              </ul>
            )}
            {providerExecutions.length > 0 ? (
              <div className="space-y-1">
                <p className="text-foreground/80">命中链路</p>
                <ul className="list-disc pl-4 text-muted-foreground space-y-0.5">
                  {providerExecutions.map((execution, index) => {
                    const slotLabel = execution.slot
                      ? {
                          primarySearch: "主 Search",
                          fallbackSearch: "备 Search",
                          primaryFetch: "主 Fetch",
                          fallbackFetch: "备 Fetch",
                        }[execution.slot]
                      : null;
                    const phaseLabel = execution.phase === "whitelist_search"
                      ? "Whitelist Search"
                      : execution.phase === "whitelist_fetch"
                        ? "Whitelist Fetch"
                        : execution.phase === "open_web_search"
                          ? "Open Web Search"
                          : "Open Web Fetch";
                    const outcomeLabel = execution.outcome === "success"
                      ? execution.resultCount !== undefined
                        ? `命中 ${execution.resultCount} 条`
                        : "成功"
                      : execution.outcome === "empty"
                        ? "无结果"
                        : execution.outcome === "skipped"
                          ? "已跳过"
                          : `失败${execution.detail ? `：${execution.detail}` : ""}`;

                    return (
                      <li key={`${execution.phase}-${execution.providerId || execution.providerName || "trace"}-${index}`}>
                        {[phaseLabel, slotLabel, execution.providerName || execution.providerId, outcomeLabel]
                          .filter(Boolean)
                          .join(" / ")}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : !task.factPack?.queryPlan.fallbackUsed ? (
              <p className="text-muted-foreground">
                命中链路：本次仅使用 Wikipedia anchor，未触发外部 Search / Fetch provider。
              </p>
            ) : null}
          </>
        )}

        {review && !blocked && (
          <p className="text-muted-foreground">
            事实校验：{review.status === "passed" ? "通过" : review.status === "repair_required" ? `待修复 ${review.repairableIssueCount} 项` : "阻塞"}
          </p>
        )}

        {blocked && (
          <div className="p-2 rounded border border-error/20 bg-error/5 text-error">
            <p className="font-medium">高风险事实冲突：{blocked.blockingIssueCount} 项</p>
            <ul className="list-disc pl-4 mt-1 space-y-0.5">
              {blocked.panels.map((panel, index) => (
                <li key={index}>
                  第 {panel.panelIndex + 1} 格 / {panel.claimType} / {panel.rawText} / {panel.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
