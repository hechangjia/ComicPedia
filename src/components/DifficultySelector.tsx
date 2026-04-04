"use client";

import { DifficultyLevel } from "@/lib/types";

const LEVELS: { value: DifficultyLevel; label: string; icon: string; desc: string; color: string }[] = [
  { value: "easy", label: "入门", icon: "🌱", desc: "简单有趣，面向儿童", color: "green" },
  { value: "medium", label: "标准", icon: "📚", desc: "基础知识和基本原理", color: "blue" },
  { value: "hard", label: "进阶", icon: "🔬", desc: "深度分析，专业术语", color: "teal" },
];

const COLOR_MAP: Record<string, { selected: string; hover: string }> = {
  green: { selected: "border-success bg-success/10 ring-2 ring-success/30", hover: "hover:border-success/30" },
  blue: { selected: "border-info bg-info/10 ring-2 ring-info/30", hover: "hover:border-info/30" },
  teal: { selected: "border-[#3d8b84] bg-[#e8f4f2] dark:bg-[#3d8b84]/10 ring-2 ring-[#3d8b84]/30", hover: "hover:border-[#3d8b84]/30" },
};

interface DifficultySelectorProps {
  value: DifficultyLevel;
  onChange: (level: DifficultyLevel) => void;
  disabled?: boolean;
}

export function DifficultySelector({ value, onChange, disabled }: DifficultySelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">难度等级</label>
      <div className="grid grid-cols-3 gap-2">
        {LEVELS.map((level) => {
          const isSelected = value === level.value;
          const colors = COLOR_MAP[level.color];
          return (
            <button
              key={level.value}
              type="button"
              onClick={() => onChange(level.value)}
              disabled={disabled}
              className={`p-3 rounded-lg border text-left transition-all duration-200 disabled:opacity-50 ${
                isSelected ? colors.selected : `border-border ${colors.hover}`
              }`}
            >
              <div className="text-lg mb-1">{level.icon}</div>
              <div className="text-sm font-medium">{level.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{level.desc}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
