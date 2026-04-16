"use client";

interface GuideCharacterToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function GuideCharacterToggle({ checked, onChange, disabled = false }: GuideCharacterToggleProps) {
  return (
    <div className="rounded-xl border bg-warning/5 p-4 space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-warning">允许引导角色</h3>
          <p className="text-xs text-warning/80">
            开启后，系统可以额外生成讲解员、探索者、旁白型角色来串联分镜。关闭后默认只保留题材原生人物、用户指定角色，或纯场景表达。
          </p>
        </div>
        <label className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
          <input
            type="checkbox"
            className="peer sr-only"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="absolute inset-0 rounded-full bg-warning/20 transition-colors peer-checked:bg-success" />
          <span className="absolute left-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
        </label>
      </div>
      <p className="text-[11px] text-warning/70">
        建议：神话、历史、人物传记等题材保持关闭，避免额外出现 explorer 形象。
      </p>
    </div>
  );
}
