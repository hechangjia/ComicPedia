"use client";

interface RefEditorProps {
  label: string;
  source: string;
  editPrompt: string;
  onEditPromptChange: (prompt: string) => void;
  onSave: () => void;
  onRegenerate?: () => void;
  regenerating: boolean;
  onStartImg2Img?: () => void;
  onCancel: () => void;
}

export function RefEditor({
  label,
  source,
  editPrompt,
  onEditPromptChange,
  onSave,
  onRegenerate,
  regenerating,
  onStartImg2Img,
  onCancel,
}: RefEditorProps) {
  return (
    <div className="p-3 rounded-lg border bg-background space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">
          Prompt - {label}
        </label>
        <span className="text-[10px] text-muted-foreground">
          {source === "ai" ? "AI 生成" : "用户上传"}
        </span>
      </div>
      <textarea
        value={editPrompt}
        onChange={(e) => onEditPromptChange(e.target.value)}
        placeholder="输入图片生成提示词 (英文效果更佳)"
        className="w-full px-3 py-2 text-sm border rounded-lg bg-background resize-none h-20 focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <div className="flex gap-2">
        <button
          onClick={onSave}
          className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg min-h-[32px]"
        >
          保存
        </button>
        {onRegenerate && editPrompt && (
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="px-3 py-1.5 text-xs bg-[#3d8b84] text-white rounded-lg disabled:opacity-50 min-h-[32px] flex items-center gap-1"
          >
            {regenerating ? (
              <>
                <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                生成中...
              </>
            ) : "重新生成"}
          </button>
        )}
        {onStartImg2Img && (
          <button
            onClick={onStartImg2Img}
            className="px-3 py-1.5 text-xs border border-orange-200 text-orange-600 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 min-h-[32px]"
          >
            以此图生图
          </button>
        )}
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
