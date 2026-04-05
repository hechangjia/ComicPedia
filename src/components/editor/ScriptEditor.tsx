"use client";

import { useState, useCallback } from "react";
import type { ComicPanel, ComicScript } from "@/lib/types";
import { useScriptEditor } from "@/hooks/useScriptEditor";
import { PanelCard } from "./PanelCard";
import { EditorPreview } from "./EditorPreview";
import { Redo2, Undo2 } from "lucide-react";


interface ScriptEditorProps {
  script: ComicScript;
  onSave: (panels: ComicPanel[]) => void;
}

export function ScriptEditor({ script, onSave }: ScriptEditorProps) {
  const {
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
    handleKeyDown,
  } = useScriptEditor(script.panels);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  const handleDragStart = useCallback((i: number) => setDragIndex(i), []);
  const handleDragOver = useCallback((_e: React.DragEvent, i: number) => setDropTarget(i), []);
  const handleDrop = useCallback(
    (toIndex: number) => {
      if (dragIndex !== null && dragIndex !== toIndex) {
        reorder(dragIndex, toIndex);
      }
      setDragIndex(null);
      setDropTarget(null);
    },
    [dragIndex, reorder],
  );

  return (
    <div onKeyDown={handleKeyDown} tabIndex={-1} className="outline-none">
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={undo}
          disabled={!canUndo}
          className="px-3 py-1.5 text-xs border rounded-lg hover:bg-muted disabled:opacity-40 transition-colors flex items-center gap-1"
          title="撤销 (Ctrl+Z)"
        >
          <Undo2 className="w-3.5 h-3.5" />
          撤销
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          className="px-3 py-1.5 text-xs border rounded-lg hover:bg-muted disabled:opacity-40 transition-colors flex items-center gap-1"
          title="重做 (Ctrl+Shift+Z)"
        >
          重做
          <Redo2 className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs text-muted-foreground ml-auto">{panels.length} 个面板</span>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6">
        {/* Left: panel cards */}
        <div className="w-[60%] space-y-4">
          {panels.map((panel, i) => (
            <div
              key={panel.id ?? i}
              className={dropTarget === i && dragIndex !== null && dragIndex !== i
                ? "border-t-2 border-primary"
                : ""}
            >
              <PanelCard
                panel={panel}
                index={i}
                total={panels.length}
                onUpdate={updatePanel}
                onDelete={deletePanel}
                onDuplicate={duplicatePanel}
                onReset={resetPanel}
                globalStyle={script.style}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
            </div>
          ))}

          {/* Add panel */}
          <button
            onClick={addPanel}
            className="w-full py-3 border-2 border-dashed rounded-xl text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            + 添加面板
          </button>
        </div>

        {/* Right: preview */}
        <div className="w-[40%]">
          <div className="sticky top-4 space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">预览</h3>
            <EditorPreview panels={panels} style={script.style} />
          </div>
        </div>
      </div>

      {/* Confirm button */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={() => onSave(panels)}
          className="px-6 py-2.5 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity font-medium"
        >
          确认修改
        </button>
      </div>
    </div>
  );
}
