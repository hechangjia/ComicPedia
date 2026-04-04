"use client";

import type { CharacterVisualScore } from "@/lib/types";
import { Spinner } from "@/components/ui/Spinner";
import { RefreshCw } from "lucide-react";


export function CharacterVLMPanel({
  vlmScore,
  vlmLoading,
  vlmError,
  vlmRetrying,
  aiGenerating,
  onEvaluate,
  onRetry,
}: {
  vlmScore: CharacterVisualScore | null;
  vlmLoading: boolean;
  vlmError: string;
  vlmRetrying: boolean;
  aiGenerating: boolean;
  onEvaluate: () => void;
  onRetry: () => void;
}) {
  return (
    <>
      {vlmError && (
        <p className="text-xs text-red-500 w-full">{vlmError}</p>
      )}

      {vlmScore && (
        <div className="w-full p-3 rounded-lg border bg-[#f3f1f8]/50 dark:bg-[#8b7eb5]/10 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#8b7eb5] dark:text-[#a99ad0]">视觉评分</span>
            <span className="text-sm font-bold text-[#8b7eb5] dark:text-[#a99ad0]">{vlmScore.overall}/10</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">特征清晰度</span><span>{vlmScore.featureClarity}/10</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">一致性</span><span>{vlmScore.consistency}/10</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">画面质量</span><span>{vlmScore.imageQuality}/10</span></div>
          </div>
          {vlmScore.issues.length > 0 && (
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {vlmScore.issues.map((issue, i) => (
                <li key={i} className="flex gap-1.5"><span className="text-orange-500 shrink-0">!</span>{issue}</li>
              ))}
            </ul>
          )}
          {vlmScore.suggestions.length > 0 && (
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {vlmScore.suggestions.map((s, i) => (
                <li key={i} className="flex gap-1.5"><span className="text-[#8b7eb5] shrink-0">-</span>{s}</li>
              ))}
            </ul>
          )}
          {vlmScore.overall < 7 && (
            <button
              onClick={onRetry}
              disabled={vlmRetrying || aiGenerating}
              className="w-full mt-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#8b7eb5] text-white hover:bg-[#8b7eb5] disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
            >
              {vlmRetrying ? (
                <>
                  <Spinner size="sm" />
                  修复中...
                </>
              ) : (
                <>
                  <RefreshCw className="w-3 h-3" />
                  一键补图（根据 VLM 反馈生成修正参考图）
                </>
              )}
            </button>
          )}
        </div>
      )}
    </>
  );
}
