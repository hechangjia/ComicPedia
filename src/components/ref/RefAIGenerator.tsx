"use client";

import { Zap } from "lucide-react";

/** 解析角色名输入（支持逗号、顿号、分号分隔） */
export function parseCharacterNames(input: string): string[] {
  return input
    .split(/[,，、；;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

interface RefAIGeneratorProps {
  characterInput: string;
  onCharacterInputChange: (input: string) => void;
  canAIGenerate: boolean;
}

/** 角色名称输入区（显示在面板顶部） */
export function RefAIGenerator({
  characterInput,
  onCharacterInputChange,
  canAIGenerate,
}: RefAIGeneratorProps) {
  if (!canAIGenerate) return null;

  const names = parseCharacterNames(characterInput);

  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">
        角色名称（可选，逗号分隔，每个角色单独生成一张参考图）
      </label>
      <input
        type="text"
        value={characterInput}
        onChange={(e) => onCharacterInputChange(e.target.value)}
        placeholder="如：林黛玉，贾宝玉，薛宝钗"
        className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
      />
      {characterInput && (
        <p className="text-xs text-muted-foreground">
          将为 {names.length} 个角色分别生成独立肖像：
          {names.map((n, i) => (
            <span key={i} className="inline-block ml-1 px-1.5 py-0.5 bg-[#e8f4f2] dark:bg-[#3d8b84]/15 text-[#2d7069] dark:text-[#5cb8ae] rounded text-xs">
              {n}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

/** AI 生成按钮（用在操作栏中） */
export function RefAIGenerateButton({
  characterInput,
  aiGenerating,
  onGenerate,
}: {
  characterInput: string;
  aiGenerating: boolean;
  onGenerate: () => void;
}) {
  const names = parseCharacterNames(characterInput);

  return (
    <button
      onClick={onGenerate}
      disabled={aiGenerating}
      className="px-3 py-1.5 text-xs border border-[#3d8b84]/30 text-[#3d8b84] rounded-lg hover:bg-[#e8f4f2] dark:hover:bg-[#3d8b84]/10 transition-colors disabled:opacity-50 min-h-[36px] flex items-center gap-1.5"
    >
      {aiGenerating ? (
        <>
          <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          生成中...
        </>
      ) : (
        <>
          <Zap className="w-3 h-3" />
          {names.length > 0 ? `AI 生成 ${names.length} 张` : "AI 生成"}
        </>
      )}
    </button>
  );
}
