"use client";

interface RefImg2ImgProps {
  label: string;
  sourceImageUrl: string;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  strength: number;
  onStrengthChange: (strength: number) => void;
  generating: boolean;
  onGenerate: () => void;
  onCancel: () => void;
}

export function RefImg2Img({
  label,
  sourceImageUrl,
  prompt,
  onPromptChange,
  strength,
  onStrengthChange,
  generating,
  onGenerate,
  onCancel,
}: RefImg2ImgProps) {
  return (
    <div className="p-3 rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-900/10 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-orange-700 dark:text-orange-300">
          以图生图 - {label}
        </span>
        <div className="w-8 h-8 rounded border overflow-hidden bg-white shrink-0">
          <img
            src={sourceImageUrl}
            alt="源图"
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="描述你想要的变化..."
          className="w-full px-3 py-2 text-sm border rounded-lg bg-background resize-none h-16 focus:outline-none focus:ring-2 focus:ring-orange-300 dark:focus:ring-orange-700"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">
          变化强度: {strength.toFixed(2)}
          <span className="ml-2 text-[10px]">（越大变化越大）</span>
        </label>
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.05"
          value={strength}
          onChange={(e) => onStrengthChange(parseFloat(e.target.value))}
          className="w-full h-2 bg-orange-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={onGenerate}
          disabled={generating || !prompt.trim()}
          className="px-3 py-1.5 text-xs bg-orange-500 text-white rounded-lg disabled:opacity-50 min-h-[32px] flex items-center gap-1"
        >
          {generating ? (
            <>
              <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              生成中...
            </>
          ) : "生成"}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs border rounded-lg min-h-[32px]"
        >
          取消
        </button>
      </div>
    </div>
  );
}
