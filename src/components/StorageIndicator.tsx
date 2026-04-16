"use client";

import { useState, useEffect } from "react";
import { getStorageUsage, formatBytes } from "@/lib/client/imageStore";
import { Database } from "lucide-react";


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
    <div className={`flex items-center gap-2 text-xs ${isLarge ? "text-warning" : "text-muted-foreground"}`}>
      <Database className="w-3.5 h-3.5" />
      <span>
        {usage.count} 张图片 · {formatBytes(usage.totalBytes)}
      </span>
      {isLarge && (
        <span className="text-[10px] bg-warning/10 px-1.5 py-0.5 rounded">
          存储较大
        </span>
      )}
    </div>
  );
}
