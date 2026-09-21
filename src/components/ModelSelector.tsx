"use client";
import Link from "next/link";
import { useId } from "react";
import { useConfigSnapshot } from "@/hooks/useAPIConfig";
interface ModelSelectorProps {
  type: "llm" | "image";
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}
export function ModelSelector({ type, value, onChange, disabled }: ModelSelectorProps) {
  const { config, isLoaded } = useConfigSnapshot();
  const id = useId();
  const configs = type === "llm" ? config.llmConfigs : config.imageConfigs;
  const activeId = type === "llm" ? config.activeLLMId : config.activeImageId;
  const active = configs.find(model => model.id === activeId);
  const missing = !!value && !configs.some(model => model.id === value);
  return <div className="space-y-2">
    <label htmlFor={id} className="text-sm font-medium">{type === "llm" ? "分镜模型 (LLM)" : "文生图模型"}</label>
    <select id={id} value={value ?? ""} onChange={event => onChange(event.target.value || null)} disabled={disabled || !isLoaded}
      className="w-full rounded-lg border bg-background p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
      <option value="">跟随默认{active ? `：${active.name}` : "：尚未设置"}</option>
      {missing && <option value={value!} disabled>所选配置已删除，请重新选择</option>}
      {configs.map(model => <option key={model.id} value={model.id}>{model.name} · {model.model}</option>)}
    </select>
    {isLoaded && configs.length === 0 && <p className="text-sm text-foreground/80">尚无模型配置。<Link href="/settings" className="underline underline-offset-4">前往设置</Link></p>}
  </div>;
}
