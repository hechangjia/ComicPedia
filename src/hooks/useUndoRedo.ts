import { useState, useCallback, useRef } from "react";

const MAX_HISTORY = 30;

/**
 * 轻量级 Undo/Redo hook。
 * 每次调用 pushState 保存快照，支持 Ctrl+Z / Ctrl+Shift+Z。
 */
export function useUndoRedo<T>(initialState: T) {
  const [state, setState] = useState(initialState);
  const historyRef = useRef<T[]>([initialState]);
  const indexRef = useRef(0);

  const pushState = useCallback((newState: T) => {
    const history = historyRef.current;
    const idx = indexRef.current;

    // 截断 redo 历史
    historyRef.current = history.slice(0, idx + 1);
    historyRef.current.push(newState);

    // 限制历史长度
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current = historyRef.current.slice(-MAX_HISTORY);
    }

    indexRef.current = historyRef.current.length - 1;
    setState(newState);
  }, []);

  const undo = useCallback(() => {
    if (indexRef.current > 0) {
      indexRef.current--;
      setState(historyRef.current[indexRef.current]);
    }
  }, []);

  const redo = useCallback(() => {
    if (indexRef.current < historyRef.current.length - 1) {
      indexRef.current++;
      setState(historyRef.current[indexRef.current]);
    }
  }, []);

  const canUndo = indexRef.current > 0;
  const canRedo = indexRef.current < historyRef.current.length - 1;

  /** 重置历史（外部数据变更时调用） */
  const reset = useCallback((newState: T) => {
    historyRef.current = [newState];
    indexRef.current = 0;
    setState(newState);
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
