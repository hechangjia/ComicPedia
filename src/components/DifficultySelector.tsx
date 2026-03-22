"use client";

import { DifficultyLevel } from "@/lib/types";

const LEVELS: { value: DifficultyLevel; label: string; icon: string; desc: string; color: string }[] = [
  { value: "easy", label: "入门", icon: "🌱", desc: "简单有趣，面向儿童", color: "green" },
  { value: "medium", label: "标准", icon: "📚", desc: "基础知识和基本原理", color: "blue" },
  { value: "hard", label: "进阶", icon: "🔬", desc: "深度分析，专业术语", color: "purple" },
];

const COLOR_MAP: Record<string, { selected: string; hover: string }> = {
  green: { selected: "border-green-500 bg-green-50 dark:bg-green-900/20 ring-2 ring-green-500/30", hover: "hover:border-green-300" },
  blue: { selected: "border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500/30", hover: "hover:border-blue-300" },
  purple: { selected: "border-purple-500 bg-purple-50 dark:bg-purple-900/20 ring-2 ring-purple-500/30", hover: "hover:border-purple-300" },
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
