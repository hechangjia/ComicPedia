"use client";

import React, { useCallback, useEffect, useRef } from "react";
import type { Character } from "@/lib/types";
import { saveCharacter } from "@/lib/client/db";
import { CharacterCard } from "@/components/CharacterCard";

export function CharacterList({
  characters,
  filtered,
  onEdit,
  onDelete,
  exportMode,
  selectedIds,
  onToggleSelect,
  canDrag,
  onReorder,
}: {
  characters: Character[];
  filtered: Character[];
  onEdit: (char: Character) => void;
  onDelete: (id: string, name: string) => void;
  exportMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  canDrag: boolean;
  onReorder: (chars: Character[]) => void;
}) {
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [dropIndex, setDropIndex] = React.useState<number | null>(null);

  const scrollSpeedRef = useRef(0);
  const scrollRAFRef = useRef(0);

  useEffect(() => {
    if (dragIndex === null) {
      scrollSpeedRef.current = 0;
      cancelAnimationFrame(scrollRAFRef.current);
      return;
    }
    const tick = () => {
      if (scrollSpeedRef.current !== 0) {
        window.scrollBy(0, scrollSpeedRef.current);
      }
      scrollRAFRef.current = requestAnimationFrame(tick);
    };
    scrollRAFRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(scrollRAFRef.current);
  }, [dragIndex]);

  const updateScrollSpeed = useCallback((clientY: number) => {
    const EDGE = 100;
    const MAX_SPEED = 14;
    const vh = window.innerHeight;
    if (clientY < EDGE) {
      scrollSpeedRef.current = -Math.round(MAX_SPEED * (1 - clientY / EDGE));
    } else if (clientY > vh - EDGE) {
      scrollSpeedRef.current = Math.round(MAX_SPEED * (1 - (vh - clientY) / EDGE));
    } else {
      scrollSpeedRef.current = 0;
    }
  }, []);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, e.currentTarget.offsetWidth / 2, 40);
    }
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIndex !== null && index !== dragIndex) {
      setDropIndex(index);
    }
    updateScrollSpeed(e.clientY);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDropIndex(null);
    scrollSpeedRef.current = 0;
  };

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      handleDragEnd();
      return;
    }

    const reordered = [...characters];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    const toSave: Character[] = [];
    const updated = reordered.map((char, i) => {
      if (char.sortOrder !== i) {
        const c = { ...char, sortOrder: i };
        toSave.push(c);
        return c;
      }
      return char;
    });

    onReorder(updated);
    handleDragEnd();

    Promise.all(toSave.map((c) => saveCharacter(c))).catch((err) => {
      console.error("Failed to save character order:", err);
    });
  };

  if (filtered.length === 0) return null;

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
      onDragOver={dragIndex !== null ? (e) => { e.preventDefault(); updateScrollSpeed(e.clientY); } : undefined}
      onDrop={dragIndex !== null ? (e) => e.preventDefault() : undefined}
    >
      {filtered.map((char, index) => (
        <div
          key={char.id}
          draggable={canDrag}
          onDragStart={canDrag ? (e) => handleDragStart(e, index) : undefined}
          onDragOver={canDrag ? (e) => handleDragOver(e, index) : undefined}
          onDrop={canDrag ? () => handleDrop(index) : undefined}
          onDragEnd={canDrag ? handleDragEnd : undefined}
          onDragLeave={canDrag ? () => setDropIndex(null) : undefined}
          className={`transition-all duration-200 rounded-xl ${
            canDrag ? "cursor-grab active:cursor-grabbing" : ""
          } ${dragIndex === index ? "opacity-30 scale-90" : ""} ${
            dragIndex !== null && dragIndex !== index && dropIndex !== index ? "opacity-60" : ""
          } ${dropIndex === index ? "ring-2 ring-primary ring-offset-2 scale-105 opacity-100" : ""}`}
        >
          <CharacterCard
            char={char}
            onEdit={() => onEdit(char)}
            onDelete={() => onDelete(char.id, char.name)}
            exportMode={exportMode}
            isSelected={selectedIds.has(char.id)}
            onToggleSelect={() => onToggleSelect(char.id)}
          />
        </div>
      ))}
    </div>
  );
}
