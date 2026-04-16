"use client";

import type { GenerationPresetSnapshot } from "@/lib/types";

export function AdvancedGenerationSettings({
  value,
  onChange,
  disabled,
}: {
  value: Partial<GenerationPresetSnapshot>;
  onChange: (value: Partial<GenerationPresetSnapshot>) => void;
  disabled?: boolean;
}) {
  return (
    <details className="rounded-xl border bg-card p-4">
      <summary className="cursor-pointer text-sm font-medium">高级执行设置</summary>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>图片并发</span>
          <input
            type="number"
            min={1}
            max={4}
            value={value.imageConcurrency ?? 1}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, imageConcurrency: Number(event.target.value) })}
            className="w-full rounded-lg border bg-background px-3 py-2"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>轻量检查</span>
          <select
            value={value.lightCheckMode ?? "auto"}
            disabled={disabled}
            onChange={(event) => onChange({
              ...value,
              lightCheckMode: event.target.value as GenerationPresetSnapshot["lightCheckMode"],
            })}
            className="w-full rounded-lg border bg-background px-3 py-2"
          >
            <option value="auto">自动</option>
            <option value="off">关闭</option>
          </select>
        </label>
      </div>
    </details>
  );
}
