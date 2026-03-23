import { useState, useCallback } from "react";

const MAX_HISTORY = 30;

/**
 * 轻量级 Undo/Redo hook。
 * 每次调用 pushState 保存快照，支持 Ctrl+Z / Ctrl+Shift+Z。
 */
export function useUndoRedo<T>(initialState: T) {
  const [history, setHistory] = useState<T[]>([initialState]);
  const [index, setIndex] = useState(0);

  const state = history[index] ?? initialState;
  const canUndo = index > 0;
  const canRedo = index < history.length - 1;

  const pushState = useCallback((newState: T) => {
    setHistory((prevHistory) => {
      const nextHistory = [...prevHistory.slice(0, index + 1), newState];
      return nextHistory.length > MAX_HISTORY ? nextHistory.slice(-MAX_HISTORY) : nextHistory;
    });
    setIndex((prevIndex) => Math.min(prevIndex + 1, MAX_HISTORY - 1));
  }, [index]);

  const undo = useCallback(() => {
    setIndex((prevIndex) => Math.max(prevIndex - 1, 0));
  }, []);

  const redo = useCallback(() => {
    setIndex((prevIndex) => Math.min(prevIndex + 1, history.length - 1));
  }, [history.length]);

  /** 重置历史（外部数据变更时调用） */
  const reset = useCallback((newState: T) => {
    setHistory([newState]);
    setIndex(0);
  }, []);

  /** 处理键盘快捷键 */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "z") {
      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
    }
  }, [undo, redo]);

  return { state, pushState, undo, redo, canUndo, canRedo, reset, handleKeyDown };
}
