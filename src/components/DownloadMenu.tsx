"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ComicPanel, ComicScript } from "@/lib/types";
import {
  downloadSingleImage,
  downloadComicAsImage,
  downloadAsZip,
  downloadForXiaohongshu,
  downloadMarkdownWithImages,
  downloadForSeedanceJSON,
  downloadForSeedanceText,
  downloadForSeedanceZip,
  downloadAsPdf,
} from "@/lib/downloadUtils";

interface DownloadMenuProps {
  panels: ComicPanel[];
  title: string;
  /** 完整脚本对象 (Seedance 导出需要) */
  script?: ComicScript;
}

type DownloadStatus = "idle" | "loading" | "success" | "error";

export function DownloadMenu({ panels, title, script }: DownloadMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<DownloadStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAction = async (
    action: () => Promise<void>,
    successMsg: string
  ) => {
    setStatus("loading");
    setStatusMessage("处理中...");
    try {
      await action();
      setStatus("success");
      setStatusMessage(successMsg);
      setTimeout(() => {
        setStatus("idle");
        setIsOpen(false);
      }, 1500);
    } catch (error) {
      setStatus("error");
      setStatusMessage(error instanceof Error ? error.message : "下载失败");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  const validPanels = useMemo(
    () =>
      panels.filter(
        (p) =>
          p.status === "completed" &&
          p.imageUrl &&
          !p.imageUrl.startsWith("data:text/plain")
      ),
    [panels]
  );

  return (
    <div className="relative" ref={menuRef}>
      {/* 下载按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-6 py-2 rounded-lg border hover:bg-accent flex items-center gap-2 min-h-[44px]"
        disabled={validPanels.length === 0}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
        下载
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* 下拉菜单：桌面端绝对定位，移动端固定底部全宽 */}
      {isOpen && (
        <>
          {/* 移动端遮罩层 */}
          <div className="fixed inset-0 bg-black/30 z-40 sm:hidden" onClick={() => setIsOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 sm:absolute sm:bottom-auto sm:left-0 sm:right-auto sm:top-full mt-0 sm:mt-2 w-full sm:w-56 rounded-t-xl sm:rounded-lg border bg-card shadow-lg z-50 max-h-[70vh] overflow-y-auto">
          {/* 状态提示 */}
          {status !== "idle" && (
            <div
              className={`px-4 py-2 text-sm border-b ${
                status === "loading"
                  ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                  : status === "success"
                  ? "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400"
                  : "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400"
              }`}
            >
              <div className="flex items-center gap-2">
                {status === "loading" && (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                )}
                {status === "success" && (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {status === "error" && (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                {statusMessage}
              </div>
            </div>
          )}

          <div className="p-2 space-y-1">
            {/* 合成大图 */}
            <button
              onClick={() =>
                handleAction(
                  () => downloadComicAsImage(panels, title),
                  "合成图片已下载"
                )
              }
              disabled={status === "loading"}
              className="w-full px-3 py-2 text-left text-sm rounded-md hover:bg-accent flex items-center gap-3 disabled:opacity-50"
            >
              <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <div>
                <div className="font-medium">合成大图</div>
                <div className="text-xs text-muted-foreground">将所有面板拼接为一张 PNG</div>
              </div>
            </button>

            {/* ZIP 打包 */}
            <button
              onClick={() =>
                handleAction(() => downloadAsZip(panels, title), "ZIP 已下载")
              }
              disabled={status === "loading"}
              className="w-full px-3 py-2 text-left text-sm rounded-md hover:bg-accent flex items-center gap-3 disabled:opacity-50"
            >
              <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              <div>
                <div className="font-medium">ZIP 打包</div>
                <div className="text-xs text-muted-foreground">包含所有图片和说明文档</div>
              </div>
            </button>

            {/* PDF 导出 */}
            <button
              onClick={() =>
                handleAction(
                  () => downloadAsPdf(panels, title),
                  "PDF 已下载"
                )
              }
              disabled={status === "loading"}
              className="w-full px-3 py-2 text-left text-sm rounded-md hover:bg-accent flex items-center gap-3 disabled:opacity-50"
            >
              <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <div>
                <div className="font-medium">PDF 导出</div>
                <div className="text-xs text-muted-foreground">漫画排版 A4 多页 PDF</div>
              </div>
            </button>

            {/* MD + 图片打包 */}
            <button
              onClick={() =>
                handleAction(
                  () => downloadMarkdownWithImages(panels, title),
                  "MD + 图片已下载"
                )
              }
              disabled={status === "loading"}
              className="w-full px-3 py-2 text-left text-sm rounded-md hover:bg-accent flex items-center gap-3 disabled:opacity-50"
            >
              <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div>
                <div className="font-medium">MD + 图片</div>
                <div className="text-xs text-muted-foreground">Markdown 文档 + 图片打包</div>
              </div>
            </button>

            <div className="border-t my-2" />

            {/* 小红书导出 */}
            <div className="px-3 py-1 text-xs text-muted-foreground font-medium">
              小红书专属
            </div>

            {/* 小红书 - 单图拼接 */}
            <button
              onClick={() =>
                handleAction(
                  () => downloadForXiaohongshu(panels, title, "single"),
                  "小红书长图已下载"
                )
              }
              disabled={status === "loading"}
              className="w-full px-3 py-2 text-left text-sm rounded-md hover:bg-accent flex items-center gap-3 disabled:opacity-50"
            >
              <svg className="w-5 h-5 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
              <div>
                <div className="font-medium">竖版长图</div>
                <div className="text-xs text-muted-foreground">3:4 比例，适合单图笔记</div>
              </div>
            </button>

            {/* 小红书 - 分页导出 */}
            <button
              onClick={() =>
                handleAction(
                  () => downloadForXiaohongshu(panels, title, "pages"),
                  "小红书分页已下载"
                )
              }
              disabled={status === "loading"}
              className="w-full px-3 py-2 text-left text-sm rounded-md hover:bg-accent flex items-center gap-3 disabled:opacity-50"
            >
              <svg className="w-5 h-5 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <div>
                <div className="font-medium">多图分页</div>
                <div className="text-xs text-muted-foreground">每格独立图片，ZIP 打包</div>
              </div>
            </button>

            <div className="border-t my-2" />

            {/* AI 视频脚本导出 */}
            {script && (
              <>
                <div className="px-3 py-1 text-xs text-muted-foreground font-medium">
                  AI 视频脚本
                </div>

                {/* Seedance JSON */}
                <button
                  onClick={() =>
                    handleAction(
                      async () => downloadForSeedanceJSON(script),
                      "视频脚本 JSON 已下载"
                    )
                  }
                  disabled={status === "loading"}
                  className="w-full px-3 py-2 text-left text-sm rounded-md hover:bg-accent flex items-center gap-3 disabled:opacity-50"
                >
                  <svg className="w-5 h-5 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <div>
                    <div className="font-medium">Seedance JSON</div>
                    <div className="text-xs text-muted-foreground">结构化分段脚本</div>
                  </div>
                </button>

                {/* Seedance Text */}
                <button
                  onClick={() =>
                    handleAction(
                      async () => downloadForSeedanceText(script),
                      "视频脚本 TXT 已下载"
                    )
                  }
                  disabled={status === "loading"}
                  className="w-full px-3 py-2 text-left text-sm rounded-md hover:bg-accent flex items-center gap-3 disabled:opacity-50"
                >
                  <svg className="w-5 h-5 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div>
                    <div className="font-medium">Seedance TXT</div>
                    <div className="text-xs text-muted-foreground">纯文本，可直接粘贴</div>
                  </div>
                </button>

                {/* Seedance ZIP (含参考图) */}
                <button
                  onClick={() =>
                    handleAction(
                      () => downloadForSeedanceZip(script),
                      "视频脚本 + 参考图已下载"
                    )
                  }
                  disabled={status === "loading"}
                  className="w-full px-3 py-2 text-left text-sm rounded-md hover:bg-accent flex items-center gap-3 disabled:opacity-50"
                >
                  <svg className="w-5 h-5 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                  <div>
                    <div className="font-medium">Seedance ZIP</div>
                    <div className="text-xs text-muted-foreground">脚本 + 参考图打包</div>
                  </div>
                </button>

                <div className="border-t my-2" />
              </>
            )}

            {/* 图片计数 */}
            <div className="px-3 py-1 text-xs text-muted-foreground">
              共 {validPanels.length} 张可用图片
            </div>
          </div>
        </div>
        </>
      )}
    </div>
  );
}

/** 单格下载按钮 */
export function SinglePanelDownload({
  panel,
  index,
}: {
  panel: ComicPanel;
  index: number;
}) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!panel.imageUrl || panel.imageUrl.startsWith("data:text/plain")) return;
    setDownloading(true);
    try {
      await downloadSingleImage(panel.imageUrl, `panel_${index + 1}.png`);
    } catch (e) {
      console.error("Download failed:", e);
    } finally {
      setDownloading(false);
    }
  };

  if (!panel.imageUrl || panel.imageUrl.startsWith("data:text/plain")) {
    return null;
  }

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 disabled:opacity-50 no-print"
      title="下载此图片"
    >
      {downloading ? (
        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      )}
    </button>
  );
}
