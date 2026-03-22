"use client";

import { memo, useCallback, useRef } from "react";
import { ComicPanel } from "@/lib/types";

interface ComicReaderProps {
  panels: ComicPanel[];
  title: string;
}

/** 单个阅读面板：图片 + 底部渐变遮罩 + 完整对话文字 */
const ReaderPanel = memo(function ReaderPanel({
  panel,
  index,
  total,
}: {
  panel: ComicPanel;
  index: number;
  total: number;
}) {
  const hasImage =
    panel.status === "completed" &&
    panel.imageUrl &&
    !panel.imageUrl.startsWith("data:text/plain");

  const hasDialogue = !!panel.dialogue?.trim();

  return (
    <div
      className="relative overflow-hidden rounded-lg bg-black group focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-black"
      role="figure"
      aria-label={`第 ${index + 1} 格: ${panel.scene}`}
      tabIndex={0}
    >
      {/* 图片 */}
      <div className="aspect-square">
        {hasImage ? (
          <img
            src={panel.imageUrl}
            alt={panel.scene}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/40 text-sm">
            {panel.status === "pending" ? "\u5F85\u751F\u6210" : "\u65E0\u56FE\u7247"}
          </div>
        )}
      </div>

      {/* 面板编号 */}
      <div className="absolute top-2 left-2 px-2 py-0.5 text-[10px] font-bold bg-black/70 text-white rounded-full z-10">
        {index + 1}/{total}
      </div>

      {/* 渐变遮罩 + 对话文字（始终显示，长文字完整展示） */}
      {hasDialogue && (
        <div className="absolute inset-x-0 bottom-0 z-10">
          {/* 渐变遮罩 */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
          {/* 文字内容 */}
          <div className="relative px-3 pb-3 pt-8 sm:px-4 sm:pb-4 sm:pt-10">
            <p className="text-white text-xs sm:text-sm leading-relaxed">
              {panel.dialogue}
            </p>
          </div>
        </div>
      )}
    </div>
  );
});

/**
 * 漫画阅读模式组件。
 * 画廊式排版：渐变遮罩叠加文字，黑色装订线间隙，完整对话展示。
 */
export function ComicReader({ panels, title }: ComicReaderProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const grid = gridRef.current;
    if (!grid) return;

    const panelEls = Array.from(grid.querySelectorAll<HTMLElement>('[role="figure"]'));
    const focused = document.activeElement as HTMLElement;
    const currentIdx = panelEls.indexOf(focused);

    let nextIdx = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      nextIdx = currentIdx < panelEls.length - 1 ? currentIdx + 1 : 0;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      nextIdx = currentIdx > 0 ? currentIdx - 1 : panelEls.length - 1;
    } else if (e.key === "Home") {
      nextIdx = 0;
    } else if (e.key === "End") {
      nextIdx = panelEls.length - 1;
    }

    if (nextIdx >= 0) {
      e.preventDefault();
      panelEls[nextIdx].focus();
      panelEls[nextIdx].scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, []);

  return (
    <div className="space-y-0" role="article" aria-label="漫画阅读视图">
      {/* 标题 */}
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold">{title}</h2>
      </div>

      {/* 漫画网格 — 黑色间隙模拟装订线 */}
      <div
        ref={gridRef}
        className="grid grid-cols-1 sm:grid-cols-2 bg-black rounded-xl overflow-hidden border-[3px] border-black"
        style={{ gap: "3px" }}
        onKeyDown={handleKeyDown}
      >
        {panels.map((panel, index) => (
          <ReaderPanel
            key={panel.id}
            panel={panel}
            index={index}
            total={panels.length}
          />
        ))}
      </div>
    </div>
  );
}
