"use client";

import { useState, useEffect } from "react";
import { getStorageUsage, formatBytes } from "@/lib/client/imageStore";

/**
 * 存储用量指示器。
 * 展示 IndexedDB 中图片 Blob 的存储占用情况。
 */
export function StorageIndicator() {
  const [usage, setUsage] = useState<{ count: number; totalBytes: number } | null>(null);

  useEffect(() => {
    getStorageUsage().then(setUsage);
  }, []);

  if (!usage || usage.count === 0) return null;

  const isLarge = usage.totalBytes > 500 * 1024 * 1024; // > 500MB

  return (
    <div className={`flex items-center gap-2 text-xs ${isLarge ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
      <span>
        {usage.count} 张图片 · {formatBytes(usage.totalBytes)}
      </span>
      {isLarge && (
        <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
          存储较大
        </span>
      )}
    </div>
  );
}
