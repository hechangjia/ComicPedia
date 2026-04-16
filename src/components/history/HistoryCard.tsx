"use client";

import { memo } from "react";
import Link from "next/link";
import { ComicStyle, TaskListItem } from "@/lib/types";
import { STYLE_DESCRIPTIONS } from "@/lib/config/styles";
import { formatDate } from "@/lib/utils";
import { getHistoryAuxStatusLabels } from "@/app/history/historyCardStatus";
import { buildResultHref } from "@/app/history/historyNavigation";
import type { HistoryFilterId } from "@/app/history/historyCardStatus";
import { X } from "lucide-react";

/** 从 STYLE_DESCRIPTIONS 提取简短中文名称 */
const styleNames: Record<string, string> = Object.fromEntries(
  (Object.keys(STYLE_DESCRIPTIONS) as ComicStyle[]).map((key) => [
    key,
    STYLE_DESCRIPTIONS[key].split("，")[0].replace(/风格$/, ""),
  ])
);

function getHistoryStatusBadgeClass(status: TaskListItem["status"]): string {
  switch (status) {
    case "completed":
      return "bg-success text-white";
    case "script_ready":
      return "bg-info text-white";
    case "generating":
    case "created":
    case "research_running":
    case "script_running":
    case "scripting":
    case "pending":
    case "image_queue_running":
    case "deep_review_running":
      return "bg-warning text-white";
    case "image_queue_paused":
    case "deep_review_paused":
    case "calibrating":
      return "bg-secondary text-secondary-foreground";
    default:
      return "bg-error text-white";
  }
}

function getHistoryStatusLabel(status: TaskListItem["status"]): string {
  switch (status) {
    case "completed":
      return "已完成";
    case "script_ready":
      return "待生成";
    case "generating":
      return "生成中";
    case "created":
      return "已创建";
    case "research_running":
      return "研究中";
    case "script_running":
    case "scripting":
      return "脚本生成中";
    case "pending":
      return "等待中";
    case "image_queue_running":
      return "图片队列中";
    case "image_queue_paused":
      return "图片队列已暂停";
    case "deep_review_running":
      return "深度评审中";
    case "deep_review_paused":
      return "深度评审已暂停";
    case "calibrating":
      return "校准中";
    default:
      return "失败";
  }
}

function getHistoryAuxBadgeClass(label: string): string {
  if (label.startsWith("ComfyUI 回收")) return "bg-primary/90 text-primary-foreground";
  if (label.startsWith("处理中")) return "bg-warning text-white";
  if (label.startsWith("排队")) return "bg-info text-white";
  if (label.startsWith("已暂停")) return "bg-secondary text-secondary-foreground";
  return "bg-muted text-muted-foreground";
}

const REVIEW_BADGE_STYLES: Record<string, string> = {
  reviewed: "bg-success/10 text-success",
  needs_repair: "bg-warning/10 text-warning",
};

function ReviewBadge({ item }: { item: TaskListItem }) {
  if (item.status !== "completed") return null;
  const rs = item.reviewStatus;
  if (!rs || rs === "unreviewed") return null;
  const score = item.visualQualityScore?.overall;
  const repairCount = item.visualQualityScore?.retryRecommendations?.length ?? 0;
  const label = rs === "reviewed"
    ? `已评审${score ? ` ${Math.round(score * 10) / 10}` : ""}`
    : `待修复${repairCount > 0 ? ` (${repairCount})` : ""}`;
  return (
    <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${REVIEW_BADGE_STYLES[rs]}`}>
      {label}
    </span>
  );
}

export { getHistoryAuxBadgeClass };

export interface HistoryCardProps {
  item: TaskListItem;
  activeFilter: HistoryFilterId;
  exportMode: boolean;
  deleteMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

export const HistoryCard = memo(function HistoryCard({
  item,
  activeFilter,
  exportMode,
  deleteMode,
  isSelected,
  onToggleSelect,
  onRemove,
}: HistoryCardProps) {
  const auxStatusLabels = getHistoryAuxStatusLabels(item);
  const selectMode = exportMode || deleteMode;
  return (
    <div
      className={`rounded-xl border overflow-hidden bg-card transition-shadow group ${
        selectMode ? "cursor-pointer" : "hover:shadow-lg"
      } ${selectMode && isSelected ? "ring-2 ring-primary" : ""}`}
      onClick={selectMode ? () => onToggleSelect(item.id) : undefined}
    >
      {/* 缩略图 */}
      <div className="aspect-video bg-muted relative">
        {item.scriptSummary?.coverImageUrl ? (
          <>
            <img
              src={item.scriptSummary.coverImageUrl}
              alt={item.scriptSummary?.title || "漫画缩略图"}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
          </div>
        )}
        {selectMode && (
          <div className="absolute top-2 left-2">
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
              isSelected ? "bg-primary border-primary text-primary-foreground" : "border-white/80 bg-black/30"
            }`}>
              {isSelected && (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          </div>
        )}
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          <div className={`px-2 py-0.5 text-xs rounded-full ${getHistoryStatusBadgeClass(item.status)}`}>
            {getHistoryStatusLabel(item.status)}
          </div>
          {auxStatusLabels.map((label) => (
            <div key={label} className={`px-2 py-0.5 text-[10px] rounded-full ${getHistoryAuxBadgeClass(label)}`}>
              {label}
            </div>
          ))}
        </div>
        {!selectMode && (
          <button
            onClick={(e) => {
              e.preventDefault();
              if (confirm(`确定删除「${item.scriptSummary?.title || "无标题"}」？`)) {
                onRemove(item.id);
              }
            }}
            className="absolute top-2 left-2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-black/70"
            title="删除"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 信息区 */}
      {selectMode ? (
        <div className="p-3 space-y-1">
          <h3 className="font-medium truncate">{item.scriptSummary?.title || "无标题"}</h3>
          <p className="text-sm text-muted-foreground truncate">{item.scriptSummary?.topic || "未知主题"}</p>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{item.scriptSummary?.style ? (styleNames[item.scriptSummary.style] || item.scriptSummary.style) : "未知风格"}</span>
            <span>{item.scriptSummary?.panelCount ?? 0} 格</span>
          </div>
          <p className="text-xs text-muted-foreground">{formatDate(item.createdAt, { style: "datetime" })}</p>
        </div>
      ) : (
        <Link href={buildResultHref(item.id, activeFilter)} className="block p-3 space-y-1">
          <div className="flex items-center gap-1.5">
            <h3 className="font-medium truncate flex-1">{item.scriptSummary?.title || "无标题"}</h3>
            <ReviewBadge item={item} />
          </div>
          <p className="text-sm text-muted-foreground truncate">{item.scriptSummary?.topic || "未知主题"}</p>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{item.scriptSummary?.style ? (styleNames[item.scriptSummary.style] || item.scriptSummary.style) : "未知风格"}</span>
            <span>{item.scriptSummary?.panelCount ?? 0} 格</span>
          </div>
          <p className="text-xs text-muted-foreground">{formatDate(item.createdAt, { style: "datetime" })}</p>
        </Link>
      )}
    </div>
  );
});
