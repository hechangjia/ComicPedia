"use client";

import { useState, type ReactNode } from "react";

export interface TabDef {
  id: string;
  label: string;
  badge?: number;
  content: ReactNode;
  visible: boolean;
}

interface DetailTabsProps {
  tabs: TabDef[];
}

export function DetailTabs({ tabs }: DetailTabsProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  const visibleTabs = tabs.filter(t => t.visible);
  if (visibleTabs.length === 0) return null;

  return (
    <div className="space-y-0 no-print">
      {/* Tab buttons */}
      <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-muted/50">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setOpenId(prev => prev === tab.id ? null : tab.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
              openId === tab.id
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-[10px] font-medium leading-none">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Active panel */}
      {openId && visibleTabs.find(t => t.id === openId) && (
        <div className="pt-3 animate-in fade-in-0 slide-in-from-top-1 duration-200">
          {visibleTabs.find(t => t.id === openId)!.content}
        </div>
      )}
    </div>
  );
}
