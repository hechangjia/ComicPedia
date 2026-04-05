"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ComicPanel, ComicScript } from "@/lib/types";
import { Download, ChevronDown, Check, X, Image, Archive, FileText, FileDown, LayoutGrid, Layers, Video, PackageOpen } from "lucide-react";
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
        <Download className="w-4 h-4" />
        下载
        <ChevronDown
          className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
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
                  ? "bg-info/5 text-info bg-info/10 text-info"
                  : status === "success"
                  ? "bg-success/5 text-success bg-success/10 text-success"
                  : "bg-error/5 text-error bg-error/10 text-error"
              }`}
            >
              <div className="flex items-center gap-2">
                {status === "loading" && (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                )}
                {status === "success" && (
                  <Check className="w-4 h-4" />
                )}
                {status === "error" && (
                  <X className="w-4 h-4" />
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
              <Image className="w-5 h-5 text-teal" />
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
              <Archive className="w-5 h-5 text-info" />
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
              <FileText className="w-5 h-5 text-error" />
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
              <FileDown className="w-5 h-5 text-success" />
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
              <LayoutGrid className="w-5 h-5 text-coral" />
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
              <Layers className="w-5 h-5 text-coral" />
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
                  <Video className="w-5 h-5 text-cyan-500" />
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
                  <FileDown className="w-5 h-5 text-cyan-500" />
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
                  <PackageOpen className="w-5 h-5 text-cyan-500" />
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
        <Download className="w-4 h-4" />
      )}
    </button>
  );
}
