import { useCallback, useRef } from "react";
import { useUndoRedo } from "./useUndoRedo";
import type { ComicPanel } from "@/lib/types";

export function useScriptEditor(initialPanels: ComicPanel[]) {
  const { state: panels, pushState, undo, redo, canUndo, canRedo, reset, handleKeyDown } =
    useUndoRedo<ComicPanel[]>(initialPanels);

  const originalPanelsRef = useRef<ComicPanel[]>(initialPanels);

  const updatePanel = useCallback(
    (index: number, updates: Partial<ComicPanel>) => {
      pushState(panels.map((p, i) => (i === index ? { ...p, ...updates } : p)));
    },
    [panels, pushState],
  );

  const deletePanel = useCallback(
    (index: number) => {
      pushState(panels.filter((_, i) => i !== index));
    },
    [panels, pushState],
  );

  const duplicatePanel = useCallback(
    (index: number) => {
      const clone: ComicPanel = {
        ...panels[index],
        id: Date.now(),
        imageUrl: undefined,
        imageVersions: undefined,
        activeVersionIndex: undefined,
        status: "pending",
      };
      const next = [...panels];
      next.splice(index + 1, 0, clone);
      pushState(next);
    },
    [panels, pushState],
  );

  const addPanel = useCallback(() => {
    const newPanel: ComicPanel = {
      id: Date.now(),
      scene: "",
      dialogue: "",
      imagePrompt: "",
      status: "pending",
    };
    pushState([...panels, newPanel]);
  }, [panels, pushState]);

  const reorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      const next = [...panels];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      pushState(next);
    },
    [panels, pushState],
  );

  const resetPanel = useCallback(
    (index: number) => {
      const original = originalPanelsRef.current[index];
      if (!original) return;
      pushState(panels.map((p, i) => (i === index ? { ...original } : p)));
    },
    [panels, pushState],
  );

  return {
    panels,
    updatePanel,
    deletePanel,
    duplicatePanel,
    addPanel,
    reorder,
    resetPanel,
    undo,
    redo,
    canUndo,
    canRedo,
    reset,
    handleKeyDown,
  };
}
