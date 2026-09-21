"use client";
import { useId } from "react";
import Link from "next/link";
import type { CreationPreflight } from "@/lib/creation/preflight";

export function CreationReview({ plan }: { plan: CreationPreflight }) {
  const heading = useId();
  return <section aria-labelledby={heading} className="border-t pt-5 space-y-4 text-sm">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 id={heading} className="font-semibold text-foreground">生成前检查</h3>
      <Link href="/settings" className="min-h-[44px] inline-flex items-center underline underline-offset-4 text-foreground focus-visible:outline focus-visible:outline-2">管理模型与能力测试</Link>
    </div>
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      <div><dt className="text-foreground/80">分镜模型</dt><dd className="mt-1 font-medium break-words">{plan.roles.llm ? `${plan.roles.llm.name} · ${plan.roles.llm.model}` : "尚未选择"}</dd></div>
      <div><dt className="text-foreground/80">画面模型</dt><dd className="mt-1 font-medium break-words">{plan.roles.image ? `${plan.roles.image.name} · ${plan.roles.image.model}` : "暂不出图"}</dd></div>
      <div><dt className="text-foreground/80">分镜数量</dt><dd className="mt-1">{plan.panelCount === null ? "自动规划" : Number.isFinite(plan.panelCount) ? `${plan.panelCount} 格` : "请修正数量"}</dd></div>
      <div><dt className="text-foreground/80">出图后轻量检查</dt><dd className="mt-1 break-words">{!plan.lightCheckEnabled ? "关闭" : plan.roles.review ? `${plan.roles.review.name} · 能力待单独验证` : "未配置"}</dd></div>
    </dl>
    <p className="text-foreground/80 leading-relaxed">{plan.pauseAfterScript ? "先生成分镜，停下来审核内容；确认后再生成画面。" : "提交后连续生成分镜和画面，不在分镜阶段等待确认。"} 完成后可整理作品并导出。</p>
    {plan.errors.length > 0 && <div role="status" className="rounded-lg border p-3 bg-background"><p className="font-medium">暂时无法开始</p><ul className="mt-2 list-disc pl-5 space-y-1">{plan.errors.map(error => <li key={error}>{error}</li>)}</ul></div>}
    <ul className="list-disc pl-5 space-y-1 text-xs leading-relaxed text-foreground/80">{plan.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
  </section>;
}
