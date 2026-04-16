"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ComicScript } from "@/lib/types";
import { copyComicImageToClipboard, shareComic } from "@/lib/downloadUtils";
import { saveCustomTemplate } from "@/lib/config/templates";
import { getAllSeries, saveSeries } from "@/lib/client/db";
import { addEpisode, type Series } from "@/lib/series";
import {
  Check,
  ClipboardCopy,
  Bookmark,
  Layers,
  FileDown,
  Plus,
  Share2,
  ChevronDown,
  Settings,
} from "lucide-react";

const DownloadMenu = dynamic(() =>
  import("@/components/DownloadMenu").then((m) => ({ default: m.DownloadMenu }))
);
const ShareCardButton = dynamic(() =>
  import("@/components/result/ShareCardButton").then((m) => ({ default: m.ShareCardButton }))
);

interface ImageConfig {
  id: string;
  name?: string;
  model: string;
}

interface LLMConfig {
  id: string;
  name?: string;
  model: string;
}

interface CompletedActionsProps {
  script: ComicScript;
  taskId: string;
  llmConfigs: LLMConfig[];
  imageConfigs: ImageConfig[];
  activeLLMId: string;
  activeImageId: string;
  selectedLLMId: string;
  selectedImageId: string;
  onSelectedLLMIdChange: (id: string) => void;
  onSelectedImageIdChange: (id: string) => void;
  onExportMarkdown: () => void;
}

export function CompletedActions({
  script,
  taskId,
  llmConfigs,
  imageConfigs,
  activeLLMId,
  activeImageId,
  selectedLLMId,
  selectedImageId,
  onSelectedLLMIdChange,
  onSelectedImageIdChange,
  onExportMarkdown,
}: CompletedActionsProps) {
  const [shareStatus, setShareStatus] = useState<"idle" | "copying" | "copied" | "sharing" | "error">("idle");
  const [templateSaved, setTemplateSaved] = useState(false);
  const [showMore, setShowMore] = useState(false);

  // 连载系列相关
  const [showSeriesSelector, setShowSeriesSelector] = useState(false);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [addedToSeries, setAddedToSeries] = useState<string | null>(null);
  const seriesDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showSeriesSelector) {
      getAllSeries().then(setSeriesList).catch(console.error);
    }
  }, [showSeriesSelector]);

  useEffect(() => {
    if (!showSeriesSelector) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (seriesDropdownRef.current && !seriesDropdownRef.current.contains(e.target as Node)) {
        setShowSeriesSelector(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSeriesSelector]);

  const handleAddToSeries = async (series: Series) => {
    const episodeTitle = script.title || `第 ${series.episodes.length + 1} 集`;
    const updated = addEpisode(series, taskId, episodeTitle);
    if (updated.episodes.length === 1 && !updated.coverUrl) {
      const firstPanel = script.panels[0];
      if (firstPanel?.imageUrl && !firstPanel.imageUrl.startsWith("data:text/plain")) {
        updated.coverUrl = firstPanel.imageUrl;
      }
    }
    if (script.characterDescription && !updated.characterDescription) {
      updated.characterDescription = script.characterDescription;
    }
    await saveSeries(updated);
    setAddedToSeries(series.title);
    setShowSeriesSelector(false);
    setTimeout(() => setAddedToSeries(null), 3000);
  };

  const handleSaveAsTemplate = () => {
    saveCustomTemplate({
      name: script.title,
      description: `${script.panels.length} 格漫画`,
      contentType: "science",
      topic: script.topic,
      style: script.style,
      panelCount: script.panels.length,
      tags: [script.style],
    });
    setTemplateSaved(true);
    setTimeout(() => setTemplateSaved(false), 2000);
  };

  const handleCopyImage = async () => {
    setShareStatus("copying");
    try {
      await copyComicImageToClipboard(script.panels, script.title);
      setShareStatus("copied");
      setTimeout(() => setShareStatus("idle"), 2000);
    } catch {
      setShareStatus("error");
      setTimeout(() => setShareStatus("idle"), 2000);
    }
  };

  const handleShare = async () => {
    setShareStatus("sharing");
    try {
      await shareComic(script.panels, script.title);
      setShareStatus("idle");
    } catch {
      handleCopyImage();
    }
  };

  const canShare = typeof navigator !== "undefined" && !!navigator.share;
  const hasMultipleModels = llmConfigs.length > 1 || imageConfigs.length > 1;

  return (
    <div className="space-y-3 no-print">
      {/* ── 主操作行：下载 + 分享 + 新漫画 ── */}
      <div className="flex flex-wrap justify-center items-center gap-3">
        <DownloadMenu
          panels={script.panels}
          title={script.title}
          script={script}
        />

        <ShareCardButton script={script} />

        {/* 复制长图 */}
        <button
          onClick={handleCopyImage}
          disabled={shareStatus === "copying"}
          className="px-4 py-2 rounded-lg border hover:bg-accent flex items-center gap-2 min-h-[44px] disabled:opacity-50"
        >
          {shareStatus === "copied" ? (
            <Check className="w-4 h-4" />
          ) : (
            <ClipboardCopy className="w-4 h-4" />
          )}
          {shareStatus === "copying" ? "生成中..." : shareStatus === "copied" ? "已复制" : "复制长图"}
        </button>

        {canShare && (
          <button
            onClick={handleShare}
            disabled={shareStatus === "sharing"}
            className="px-4 py-2 rounded-lg border border-info/20 text-info hover:bg-info/5 flex items-center gap-2 min-h-[44px] disabled:opacity-50"
          >
            <Share2 className="w-4 h-4" />
            {shareStatus === "sharing" ? "分享中..." : "分享"}
          </button>
        )}

        <Link
          href="/"
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground flex items-center gap-2 min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          新漫画
        </Link>
      </div>

      {/* ── 折叠区：更多操作 ── */}
      <div className="flex justify-center">
        <button
          onClick={() => setShowMore(!showMore)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMore ? "rotate-180" : ""}`} />
          {showMore ? "收起" : "更多操作"}
        </button>
      </div>

      {showMore && (
        <div className="flex flex-wrap justify-center items-center gap-2 pt-1 border-t border-border/50">
          {/* 导出 Markdown */}
          <button
            onClick={onExportMarkdown}
            className="px-3 py-1.5 rounded-lg border text-sm hover:bg-accent flex items-center gap-1.5 min-h-[36px]"
          >
            <FileDown className="w-3.5 h-3.5" />
            导出 Markdown
          </button>

          {/* 保存为模板 */}
          <button
            onClick={handleSaveAsTemplate}
            disabled={templateSaved}
            className="px-3 py-1.5 rounded-lg border text-sm hover:bg-accent flex items-center gap-1.5 min-h-[36px] disabled:opacity-50"
          >
            {templateSaved ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Bookmark className="w-3.5 h-3.5" />
            )}
            {templateSaved ? "已保存" : "存为模板"}
          </button>

          {/* 添加到连载 */}
          <div className="relative" ref={seriesDropdownRef}>
            <button
              onClick={() => setShowSeriesSelector(!showSeriesSelector)}
              className={`px-3 py-1.5 rounded-lg border text-sm flex items-center gap-1.5 min-h-[36px] transition-colors ${
                addedToSeries
                  ? "border-success/30 text-success bg-success/10"
                  : "hover:bg-accent"
              }`}
            >
              {addedToSeries ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Layers className="w-3.5 h-3.5" />
              )}
              {addedToSeries ? `已加入` : "加入连载"}
            </button>

            {showSeriesSelector && (
              <div className="absolute bottom-full left-0 mb-2 w-64 p-2 rounded-lg border bg-card shadow-xl z-50 space-y-1">
                <p className="text-xs font-medium text-muted-foreground px-2 py-1">选择连载系列</p>
                {seriesList.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-2 py-2">
                    暂无连载，请先在
                    <Link href="/series" className="text-primary hover:underline ml-1">连载页面</Link>
                    创建
                  </p>
                ) : (
                  seriesList.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleAddToSeries(s)}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-accent text-sm transition-colors"
                    >
                      <span className="font-medium">{s.title}</span>
                      <span className="text-xs text-muted-foreground ml-2">({s.episodes.length} 集)</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* 模型切换（仅多配置时显示） */}
          {hasMultipleModels && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-muted/30">
              <Settings className="w-3.5 h-3.5 text-muted-foreground" />
              {llmConfigs.length > 1 && (
                <select
                  value={selectedLLMId}
                  onChange={(e) => onSelectedLLMIdChange(e.target.value)}
                  className="text-xs border-none bg-transparent focus:outline-none max-w-[140px]"
                >
                  {llmConfigs.map((c) => (
                    <option key={c.id} value={c.id}>
                      LLM: {c.name || c.model}{c.id === activeLLMId ? " ★" : ""}
                    </option>
                  ))}
                </select>
              )}
              {imageConfigs.length > 1 && (
                <select
                  value={selectedImageId}
                  onChange={(e) => onSelectedImageIdChange(e.target.value)}
                  className="text-xs border-none bg-transparent focus:outline-none max-w-[140px]"
                >
                  {imageConfigs.map((c) => (
                    <option key={c.id} value={c.id}>
                      图片: {c.name || c.model}{c.id === activeImageId ? " ★" : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
