"use client";

import { useState, useCallback, useEffect, useSyncExternalStore } from "react";

export type UIMode = "simple" | "advanced";

const UI_MODE_KEY = "comicpedia_ui_mode";
const DEFAULT_UI_MODE: UIMode = "simple";

// 简单的事件发射器，用于跨组件同步模式变化
let listeners: Set<() => void> = new Set();
let currentMode: UIMode | null = null;

function getStoredMode(): UIMode {
  if (typeof window === "undefined") return DEFAULT_UI_MODE;
  if (currentMode !== null) return currentMode;

  try {
    const stored = localStorage.getItem(UI_MODE_KEY);
    currentMode = stored === "advanced" ? "advanced" : "simple";
    return currentMode;
  } catch {
    return DEFAULT_UI_MODE;
  }
}

function setStoredMode(mode: UIMode): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(UI_MODE_KEY, mode);
    currentMode = mode;
    listeners.forEach((listener) => listener());
  } catch {
    // 忽略存储失败
  }
}

function subscribeMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * UI 模式管理 Hook
 *
 * 提供极简模式（simple）和高级模式（advanced）的切换
 * 模式选择持久化到 localStorage
 */
export function useUIMode(): {
  mode: UIMode;
  isSimpleMode: boolean;
  isAdvancedMode: boolean;
  setMode: (mode: UIMode) => void;
  toggleMode: () => void;
} {
  const mode = useSyncExternalStore(
    subscribeMode,
    getStoredMode,
    () => DEFAULT_UI_MODE,
  );

  const setMode = useCallback((newMode: UIMode) => {
    setStoredMode(newMode);
  }, []);

  const toggleMode = useCallback(() => {
    setStoredMode(mode === "simple" ? "advanced" : "simple");
  }, [mode]);

  return {
    mode,
    isSimpleMode: mode === "simple",
    isAdvancedMode: mode === "advanced",
    setMode,
    toggleMode,
  };
}
