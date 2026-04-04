"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ComicScript } from "@/lib/types";
import { copyComicImageToClipboard, shareComic } from "@/lib/downloadUtils";
import { saveCustomTemplate } from "@/lib/config/templates";
import { getAllSeries, saveSeries } from "@/lib/client/db";
import { addEpisode, type Series } from "@/lib/series";
import { Check, ClipboardCopy, Bookmark, Layers, FileDown, Plus, Share2 } from "lucide-react";


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

  // 点击外部关闭选择器
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
    // 如果是首集且没有封面，用第一格图片作为封面
    if (updated.episodes.length === 1 && !updated.coverUrl) {
      const firstPanel = script.panels[0];
      if (firstPanel?.imageUrl && !firstPanel.imageUrl.startsWith("data:text/plain")) {
        updated.coverUrl = firstPanel.imageUrl;
      }
    }
    // 从脚本提取角色描述同步到连载
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
      // Fallback to copy if share not supported
      handleCopyImage();
    }
  };

  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  return (
    <div className="flex flex-wrap justify-center items-center gap-3 sm:gap-4 no-print">
      {/* LLM model selector */}
      {llmConfigs.length > 1 && (
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted-foreground whitespace-nowrap">LLM:</label>
          <select
            value={selectedLLMId}
            onChange={(e) => onSelectedLLMIdChange(e.target.value)}
            className="px-2 py-1.5 text-xs border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary max-w-[180px]"
          >
            {llmConfigs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.model}{c.id === activeLLMId ? " ★" : ""}
              </option>
            ))}
          </select>
        </div>
      )}
      {/* Image model selector */}
      {imageConfigs.length > 1 && (
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted-foreground whitespace-nowrap">文生图:</label>
          <select
            value={selectedImageId}
            onChange={(e) => onSelectedImageIdChange(e.target.value)}
            className="px-2 py-1.5 text-xs border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary max-w-[180px]"
          >
            {imageConfigs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.model}{c.id === activeImageId ? " ★" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 下载菜单 */}
      <DownloadMenu
        panels={script.panels}
        title={script.title}
        script={script}
      />

      {/* 分享卡片 */}
      <ShareCardButton script={script} />

      {/* 复制长图到剪贴板 */}
      <button
        onClick={handleCopyImage}
        disabled={shareStatus === "copying"}
        className="px-4 sm:px-6 py-2 rounded-lg border hover:bg-accent flex items-center gap-2 min-h-[44px] disabled:opacity-50"
      >
        {shareStatus === "copied" ? (
          <Check className="w-4 h-4" />
        ) : (
          <ClipboardCopy className="w-4 h-4" />
        )}
        {shareStatus === "copying" ? "生成中..." : shareStatus === "copied" ? "已复制" : "复制长图"}
      </button>

      {/* 分享按钮（支持 Web Share API） */}
      {canShare && (
        <button
          onClick={handleShare}
          disabled={shareStatus === "sharing"}
          className="px-4 sm:px-6 py-2 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2 min-h-[44px] disabled:opacity-50"
        >
          <Share2 className="w-4 h-4" />
          {shareStatus === "sharing" ? "分享中..." : "分享"}
        </button>
      )}

      {/* 导出 Markdown */}
      <button
        onClick={onExportMarkdown}
        className="px-4 sm:px-6 py-2 rounded-lg border hover:bg-accent flex items-center gap-2 min-h-[44px]"
      >
        <FileDown className="w-4 h-4" />
        <span className="hidden sm:inline">导出</span> Markdown
      </button>

      {/* 保存为模板 */}
      <button
        onClick={handleSaveAsTemplate}
        disabled={templateSaved}
        className="px-4 sm:px-6 py-2 rounded-lg border hover:bg-accent flex items-center gap-2 min-h-[44px] disabled:opacity-50"
      >
        {templateSaved ? (
          <Check className="w-4 h-4" />
        ) : (
          <Bookmark className="w-4 h-4" />
        )}
        {templateSaved ? "已保存" : "存为模板"}
      </button>

      {/* 添加到连载 */}
      <div className="relative" ref={seriesDropdownRef}>
        <button
          onClick={() => setShowSeriesSelector(!showSeriesSelector)}
          className={`px-4 sm:px-6 py-2 rounded-lg border flex items-center gap-2 min-h-[44px] transition-colors ${
            addedToSeries
              ? "border-green-300 text-green-600 bg-green-50 dark:bg-green-900/20"
              : "hover:bg-accent"
          }`}
        >
          {addedToSeries ? (
            <Check className="w-4 h-4" />
          ) : (
            <Layers className="w-4 h-4" />
          )}
          {addedToSeries ? `已加入「${addedToSeries}」` : "加入连载"}
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

      {/* 生成新漫画 */}
      <Link
        href="/"
        className="px-4 sm:px-6 py-2 rounded-lg bg-primary text-primary-foreground flex items-center gap-2 min-h-[44px]"
      >
        <Plus className="w-4 h-4" />
        <span className="hidden sm:inline">生成</span>新漫画
      </Link>
    </div>
  );
}
