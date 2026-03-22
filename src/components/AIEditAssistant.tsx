"use client";

import { useState } from "react";
import { ComicPanel, ComicScript, PartialLLMConfig } from "@/lib/types";
import { optimizeDialogue, optimizeImagePrompt } from "@/lib/aiEditor";
import { Spinner } from "@/components/ui/Spinner";

interface AIEditAssistantProps {
  panel: ComicPanel;
  script: ComicScript;
  panelIndex: number;
  llmConfig?: PartialLLMConfig;
  onApply: (field: "dialogue" | "imagePrompt", value: string) => void;
}

type AssistAction = "dialogue" | "imagePrompt";

export function AIEditAssistant({ panel, script, panelIndex, llmConfig, onApply }: AIEditAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<{ field: AssistAction; original: string; suggested: string; reason: string } | null>(null);
  const [error, setError] = useState("");

  const handleOptimize = async (action: AssistAction) => {
    setIsOpen(false);
    setLoading(true);
    setError("");
    setSuggestion(null);
    try {
      const result = action === "dialogue"
        ? await optimizeDialogue(panel, script, panelIndex, llmConfig)
        : await optimizeImagePrompt(panel, script, panelIndex, llmConfig);
      setSuggestion({ field: action, ...result });
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 优化失败");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (suggestion) {
      onApply(suggestion.field, suggestion.suggested);
      setSuggestion(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={loading}
          className="px-3 py-2 text-sm border border-purple-300 text-purple-600 dark:text-purple-400 rounded flex items-center gap-1.5 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors min-h-[44px] disabled:opacity-50"
        >
          {loading ? <Spinner size="sm" /> : <span>✨</span>}
          {loading ? "AI 思考中..." : "AI 辅助"}
          {!loading && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>}
        </button>
        {isOpen && (
          <div className="absolute left-0 mt-1 bg-card border rounded-lg shadow-lg p-1 min-w-[160px] z-20">
            <button
              onClick={() => handleOptimize("dialogue")}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded cursor-pointer"
            >
              优化对话文案
            </button>
            <button
              onClick={() => handleOptimize("imagePrompt")}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded cursor-pointer"
            >
              优化 imagePrompt
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {suggestion && (
        <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
              AI 建议 ({suggestion.field === "dialogue" ? "对话" : "图片提示词"})
            </span>
          </div>
          <div className="text-xs text-muted-foreground line-through">{suggestion.original}</div>
          <div className="text-sm">{suggestion.suggested}</div>
          <p className="text-xs text-muted-foreground italic">{suggestion.reason}</p>
          <div className="flex gap-2">
            <button
              onClick={handleApply}
              className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
            >
              采纳
            </button>
            <button
              onClick={() => setSuggestion(null)}
              className="px-3 py-1.5 text-xs border rounded hover:bg-accent transition-colors"
            >
              忽略
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
