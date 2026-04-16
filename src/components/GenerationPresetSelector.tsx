"use client";

import { GENERATION_PRESETS, type GenerationPresetId } from "@/lib/config/generationPresets";

export function GenerationPresetSelector({
  value,
  onChange,
  disabled,
}: {
  value: GenerationPresetId;
  onChange: (value: GenerationPresetId) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">生成预设</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as GenerationPresetId)}
        disabled={disabled}
        className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      >
        {Object.values(GENERATION_PRESETS).map((preset) => (
          <option key={preset.id} value={preset.id}>{preset.label}</option>
        ))}
      </select>
    </div>
  );
}
