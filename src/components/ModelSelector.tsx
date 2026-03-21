"use client";

import { getStoredConfigs } from "@/hooks/useAPIConfig";
import { UserLLMConfig, UserImageConfig } from "@/lib/types";
import { useState, useEffect } from "react";

interface ModelSelectorProps {
  type: "llm" | "image";
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
}

export function ModelSelector({ type, value, onChange, disabled }: ModelSelectorProps) {
  const [configs, setConfigs] = useState<(UserLLMConfig | UserImageConfig)[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const stored = getStoredConfigs();
    if (type === "llm") {
      setConfigs(stored.llmConfigs);
      setActiveId(stored.activeLLMId);
    } else {
      setConfigs(stored.imageConfigs);
      setActiveId(stored.activeImageId);
    }
  }, [type]);

  // 只有 1 个或 0 个配置时不显示选择器
  if (configs.length <= 1) return null;

  const selected = value ?? activeId;

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">
        {type === "llm" ? "LLM 模型" : "文生图模型"}
      </label>
      <select
        value={selected ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border bg-background p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      >
        {configs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.provider} · {c.model})
            {c.id === activeId ? " [默认]" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
