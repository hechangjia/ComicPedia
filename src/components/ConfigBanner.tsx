"use client";

import Link from "next/link";

interface ConfigBannerProps {
  hasLLM: boolean;
  hasImage: boolean;
  isLoaded: boolean;
}

export function ConfigBanner({ hasLLM, hasImage, isLoaded }: ConfigBannerProps) {
  if (!isLoaded || hasLLM) return null;

  return (
    <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-amber-600 dark:text-amber-400 text-lg">⚠️</span>
        <span className="font-medium text-amber-800 dark:text-amber-200">需要配置 API</span>
      </div>
      <p className="text-sm text-amber-700 dark:text-amber-300">
        请先配置 LLM API 才能生成漫画。
        {!hasImage && " 文生图配置为可选，未配置时仅输出文字脚本。"}
      </p>
      <Link
        href="/settings"
        className="inline-block px-4 py-2 rounded-lg bg-amber-600 dark:bg-amber-700 text-white text-sm font-medium hover:bg-amber-700 dark:hover:bg-amber-600 transition-colors"
      >
        前往设置
      </Link>
    </div>
  );
}
