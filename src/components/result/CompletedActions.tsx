"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ComicScript } from "@/lib/types";
import { copyComicImageToClipboard, shareComic } from "@/lib/downloadUtils";
import { saveCustomTemplate } from "@/lib/config/templates";

const DownloadMenu = dynamic(() =>
  import("@/components/DownloadMenu").then((m) => ({ default: m.DownloadMenu }))
);

interface ImageConfig {
  id: string;
  name?: string;
  model: string;
}

interface CompletedActionsProps {
  script: ComicScript;
  imageConfigs: ImageConfig[];
  activeImageId: string;
  selectedImageId: string;
  onSelectedImageIdChange: (id: string) => void;
  onExportMarkdown: () => void;
}

export function CompletedActions({
  script,
  imageConfigs,
  activeImageId,
  selectedImageId,
  onSelectedImageIdChange,
  onExportMarkdown,
}: CompletedActionsProps) {
  const [shareStatus, setShareStatus] = useState<"idle" | "copying" | "copied" | "sharing" | "error">("idle");
  const [templateSaved, setTemplateSaved] = useState(false);

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
      {/* Model selector */}
      {imageConfigs.length > 1 && (
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted-foreground whitespace-nowrap">Image Model:</label>
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

      {/* 复制长图到剪贴板 */}
      <button
        onClick={handleCopyImage}
        disabled={shareStatus === "copying"}
        className="px-4 sm:px-6 py-2 rounded-lg border hover:bg-accent flex items-center gap-2 min-h-[44px] disabled:opacity-50"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          {shareStatus === "copied" ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
          )}
        </svg>
        {shareStatus === "copying" ? "生成中..." : shareStatus === "copied" ? "已复制" : "复制长图"}
      </button>

      {/* 分享按钮（支持 Web Share API） */}
      {canShare && (
        <button
          onClick={handleShare}
          disabled={shareStatus === "sharing"}
          className="px-4 sm:px-6 py-2 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2 min-h-[44px] disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          {shareStatus === "sharing" ? "分享中..." : "分享"}
        </button>
      )}

      {/* 导出 Markdown */}
      <button
        onClick={onExportMarkdown}
        className="px-4 sm:px-6 py-2 rounded-lg border hover:bg-accent flex items-center gap-2 min-h-[44px]"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="hidden sm:inline">导出</span> Markdown
      </button>

      {/* 保存为模板 */}
      <button
        onClick={handleSaveAsTemplate}
        disabled={templateSaved}
        className="px-4 sm:px-6 py-2 rounded-lg border hover:bg-accent flex items-center gap-2 min-h-[44px] disabled:opacity-50"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          {templateSaved ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          )}
        </svg>
        {templateSaved ? "已保存" : "存为模板"}
      </button>

      {/* 生成新漫画 */}
      <Link
        href="/"
        className="px-4 sm:px-6 py-2 rounded-lg bg-primary text-primary-foreground flex items-center gap-2 min-h-[44px]"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
        <span className="hidden sm:inline">生成</span>新漫画
      </Link>
    </div>
  );
}
