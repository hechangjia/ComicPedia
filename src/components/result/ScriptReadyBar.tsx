"use client";

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
  generatingAll: boolean;
  llmConfigs: LLMConfig[];
  imageConfigs: ImageConfig[];
  activeLLMId: string;
  activeImageId: string;
  selectedLLMId: string;
  selectedImageId: string;
  onSelectedLLMIdChange: (id: string) => void;
  onSelectedImageIdChange: (id: string) => void;
  onRegenerateScript: () => void;
  onGenerateAll: () => void;
}

export function ScriptReadyBar({
  completedPanels,
  totalPanels,
  pendingPanels,
  generatingAll,
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
}: ScriptReadyBarProps) {
  return (
    <div className="p-4 rounded-xl border bg-blue-50 dark:bg-blue-900/20 space-y-3 no-print">
      <div className="flex items-start gap-3">
        <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
            分镜脚本已就绪
            {completedPanels > 0 && (
              <span className="ml-2 text-xs font-normal text-blue-600 dark:text-blue-300">
                （已生成 {completedPanels}/{totalPanels} 张图片）
              </span>
            )}
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-300">
            请审查每个分镜的提示词，点击编辑按钮可修改。确认无误后，可单独生成某个分镜的图片，或点击下方按钮一次性全部生成。
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-8">
        {/* LLM model selector + regenerate script */}
        {llmConfigs.length > 1 && (
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-blue-600 dark:text-blue-300 whitespace-nowrap">LLM:</label>
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
          className="px-3 py-2 text-sm border border-blue-300 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors flex items-center gap-1.5 min-h-[40px]"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Regenerate Script
        </button>
        {/* Image model selector */}
        {imageConfigs.length > 1 && (
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-blue-600 dark:text-blue-300 whitespace-nowrap">文生图:</label>
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
        <button
          onClick={onGenerateAll}
          disabled={generatingAll || pendingPanels === 0}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2 min-h-[40px]"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {generatingAll ? "生成中..." : pendingPanels > 0 ? `全部生成 (${pendingPanels} 张)` : "全部已生成"}
        </button>
      </div>
    </div>
  );
}
