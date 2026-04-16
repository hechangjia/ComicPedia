"use client";

import type { ReactNode } from "react";
import { Image as ImageIcon, Info, RefreshCw } from "lucide-react";

interface LLMConfig {
  id: string;
  name?: string;
  model: string;
}

interface ImageConfig {
  id: string;
  name?: string;
  model: string;
}

interface ScriptReadyBarProps {
  completedPanels: number;
  totalPanels: number;
  pendingPanels: number;
  generatingAll?: boolean;
  llmConfigs: LLMConfig[];
  imageConfigs: ImageConfig[];
  activeLLMId: string;
  activeImageId: string;
  selectedLLMId: string;
  selectedImageId: string;
  onSelectedLLMIdChange: (id: string) => void;
  onSelectedImageIdChange: (id: string) => void;
  onRegenerateScript: () => void;
  onGenerateAll?: () => void;
  actionSlot?: ReactNode;
}

export function ScriptReadyBar({
  completedPanels,
  totalPanels,
  pendingPanels,
  generatingAll = false,
  llmConfigs,
  imageConfigs,
  activeLLMId,
  activeImageId,
  selectedLLMId,
  selectedImageId,
  onSelectedLLMIdChange,
  onSelectedImageIdChange,
  onRegenerateScript,
  onGenerateAll,
  actionSlot,
}: ScriptReadyBarProps) {
  return (
    <div className="p-4 rounded-xl border bg-info/10 space-y-3 no-print">
      <div className="flex items-start gap-3">
        <Info className="w-5 h-5 text-info mt-0.5 shrink-0" />
        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium text-info">
            分镜脚本已就绪
            {completedPanels > 0 && (
              <span className="ml-2 text-xs font-normal text-info">
                （已生成 {completedPanels}/{totalPanels} 张图片）
              </span>
            )}
          </p>
          <p className="text-xs text-info">
            请审查每个分镜的提示词，点击编辑按钮可修改。确认无误后，可在下方工作区按面板推进生成队列。
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-8">
        {/* LLM model selector + regenerate script */}
        {llmConfigs.length > 1 && (
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-info whitespace-nowrap">LLM:</label>
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
        <button
          onClick={onRegenerateScript}
          className="px-3 py-2 text-sm border border-info/30 text-info rounded-lg hover:bg-info/10 transition-colors flex items-center gap-1.5 min-h-[40px]"
        >
          <RefreshCw className="w-4 h-4" />
          Regenerate Script
        </button>
        {/* Image model selector */}
        {imageConfigs.length > 1 && (
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-info whitespace-nowrap">文生图:</label>
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
        {onGenerateAll && (
          <button
            onClick={onGenerateAll}
            disabled={generatingAll || pendingPanels === 0}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2 min-h-[40px]"
          >
            <ImageIcon className="w-4 h-4" />
            {generatingAll ? "生成中..." : pendingPanels > 0 ? `全部生成 (${pendingPanels} 张)` : "全部已生成"}
          </button>
        )}
        {actionSlot}
      </div>
    </div>
  );
}
