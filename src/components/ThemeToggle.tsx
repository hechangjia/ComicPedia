"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";

function subscribeToHydration() {
  return () => {};
}

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeToHydration, () => true, () => false);

  if (!mounted) {
    return (
      <button
        className="w-10 h-10 rounded-lg border flex items-center justify-center hover:bg-accent transition-colors"
        aria-label="切换主题"
      >
        <div className="w-5 h-5" />
      </button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="w-10 h-10 rounded-lg border flex items-center justify-center hover:bg-accent transition-colors"
      aria-label={isDark ? "切换到亮色模式" : "切换到暗色模式"}
      title={isDark ? "切换到亮色模式" : "切换到暗色模式"}
    >
      {isDark ? (
        <Sun className="w-5 h-5 text-yellow-500" />
      ) : (
        <Moon className="w-5 h-5 text-slate-700" />
      )}
    </button>
  );
}
