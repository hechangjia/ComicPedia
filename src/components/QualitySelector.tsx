"use client";

import { GenerationQuality } from "@/lib/types";
import { QUALITY_PRESETS } from "@/lib/config/quality";

interface QualitySelectorProps {
  value: GenerationQuality;
  onChange: (quality: GenerationQuality) => void;
  disabled?: boolean;
}

const QUALITIES: GenerationQuality[] = ["fast", "standard", "fine"];

/** 生成质量选择器 — 控制脚本详细度和图片精度，不影响分镜数量 */
export function QualitySelector({ value, onChange, disabled }: QualitySelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">生成质量</label>
      <div className="flex gap-2">
        {QUALITIES.map((q) => {
          const preset = QUALITY_PRESETS[q];
          return (
            <button
              key={q}
              onClick={() => onChange(q)}
              disabled={disabled}
              className={`flex-1 px-3 py-2.5 rounded-lg border text-center transition-all duration-200 ${
                value === q
                  ? "border-primary bg-primary/10 ring-2 ring-primary shadow-sm"
                  : "hover:border-primary/50 hover:bg-muted/30"
              }`}
            >
              <span className="text-base">{preset.icon}</span>
              <span className="font-medium text-sm ml-1.5">{preset.label}</span>
              <div className="text-[10px] text-muted-foreground mt-0.5">{preset.desc}</div>
              <div className="text-[10px] text-muted-foreground/60">{preset.timeHint}</div>
            </button>
          );
        })}
      </div>
      {/* 当前档位的 Agent 详情 */}
      <div className="flex flex-wrap gap-1">
        {QUALITY_PRESETS[value].agents.map((agent) => (
          <span key={agent} className="px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground">
            {agent}
          </span>
        ))}
      </div>
    </div>
  );
}
