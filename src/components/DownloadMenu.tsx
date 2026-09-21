"use client";

import { ExportDialog } from "./ExportDialog";
import type { PublicationFormat } from "@/lib/export/options";
import { useState, useRef, useEffect, useMemo } from "react";
import { ComicPanel, ComicScript } from "@/lib/types";
import { Download, ChevronDown, Image as ImageIcon, Archive, FileText, FileDown, LayoutGrid, Layers, Video, PackageOpen } from "lucide-react";
import {
  downloadSingleImage,
} from "@/lib/downloadUtils";

interface DownloadMenuProps {
  panels: ComicPanel[];
  title: string;
  /** 完整脚本对象 (Seedance 导出需要) */
  script?: ComicScript;
}


export function DownloadMenu({ panels, title, script }: DownloadMenuProps) {
  const downloadButton = useRef<HTMLButtonElement>(null);
  const closeExport = () => { setExportFormat(null); requestAnimationFrame(() => downloadButton.current?.focus()); };
  const [exportFormat, setExportFormat] = useState<PublicationFormat | null>(null);
  const openExport = (format: PublicationFormat) => { setIsOpen(false); setExportFormat(format); };
  const [isOpen, setIsOpen] = useState(false);
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
      {exportFormat && <ExportDialog panels={panels} title={title} format={exportFormat} script={script} onClose={closeExport} />}
      {/* 下载按钮 */}
      <button
        ref={downloadButton}
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className="px-6 py-2 rounded-lg border hover:bg-accent flex items-center gap-2 min-h-[44px]"
        disabled={panels.length === 0}
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
          <div className="p-2 space-y-1">
            {/* 合成大图 */}
            <button
              onClick={() =>
                openExport("png")
              }
              className="w-full px-3 py-2 text-left text-sm rounded-md hover:bg-accent flex items-center gap-3 disabled:opacity-50"
            >
              <ImageIcon className="w-5 h-5 text-teal" />
              <div>
                <div className="font-medium">合成大图</div>
                <div className="text-xs text-muted-foreground">将所有面板拼接为一张 PNG</div>
              </div>
            </button>

            {/* ZIP 打包 */}
            <button
              onClick={() =>
                openExport("zip")
              }
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
                openExport("pdf")
              }
              className="w-full px-3 py-2 text-left text-sm rounded-md hover:bg-accent flex items-center gap-3 disabled:opacity-50"
            >
              <FileText className="w-5 h-5 text-error" />
              <div>
                <div className="font-medium">PDF 导出</div>
                <div className="text-xs text-muted-foreground">纸张、布局、清晰度与排版预览</div>
              </div>
            </button>

            {/* MD + 图片打包 */}
            <button
              onClick={() =>
                openExport("markdown")
              }
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
                openExport("xhs-single")
              }
              className="w-full px-3 py-2 text-left text-sm rounded-md hover:bg-accent flex items-center gap-3 disabled:opacity-50"
            >
              <LayoutGrid className="w-5 h-5 text-coral" />
              <div>
                <div className="font-medium">竖版长图</div>
                <div className="text-xs text-muted-foreground">可变高度，保留图片比例</div>
              </div>
            </button>

            {/* 小红书 - 分页导出 */}
            <button
              onClick={() =>
                openExport("xhs-pages")
              }
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
                    openExport("seedance-json")
                  }
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
                    openExport("seedance-text")
                  }
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
                    openExport("seedance-zip")
                  }
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
