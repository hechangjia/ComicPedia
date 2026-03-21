"use client";

import { memo } from "react";

const PANEL_OPTIONS: { value: number | null; label: string; desc?: string }[] = [
  { value: null, label: "自动（推荐）", desc: "模型自行决定最合适的格数" },
  { value: 4, label: "4格" },
  { value: 6, label: "6格" },
  { value: 8, label: "8格" },
  { value: 12, label: "12格" },
];

interface PanelCountSelectorProps {
  panelCount: number | null;
  customPanelCount: string;
  onPanelCountChange: (value: number | null) => void;
  onCustomPanelCountChange: (value: string) => void;
  disabled?: boolean;
  max?: number;
}

export const PanelCountSelector = memo(function PanelCountSelector({
  panelCount,
  customPanelCount,
  onPanelCountChange,
  onCustomPanelCountChange,
  disabled,
  max = 30,
}: PanelCountSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">分镜数量</label>
      <div className="flex flex-wrap gap-2 items-center">
        {PANEL_OPTIONS.map((option) => (
          <button
            key={option.label}
            onClick={() => {
              onPanelCountChange(option.value);
              onCustomPanelCountChange("");
            }}
            disabled={disabled}
            className={`px-4 py-2 rounded-lg border text-sm transition-all ${
              panelCount === option.value && !customPanelCount
                ? "border-primary bg-primary/10 ring-2 ring-primary"
                : "hover:border-primary/50"
            }`}
          >
            {option.label}
          </button>
        ))}
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            max={max}
            value={customPanelCount}
            onChange={(e) => {
              onCustomPanelCountChange(e.target.value);
              onPanelCountChange(null);
            }}
            placeholder="自定义"
            className={`w-24 px-3 py-2 rounded-lg border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary ${
              customPanelCount ? "border-primary ring-2 ring-primary" : ""
            }`}
            disabled={disabled}
          />
          <span className="text-xs text-muted-foreground">格</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        自动模式由模型按主题复杂度决定，也可输入 1-{max} 的自定义数量。
      </p>
    </div>
  );
});
