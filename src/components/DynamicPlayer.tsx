"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ComicPanel, PanelTransition } from "@/lib/types";

interface DynamicPlayerProps {
  panels: ComicPanel[];
  title: string;
}

const TRANSITION_CLASSES: Record<PanelTransition, string> = {
  cut: "",
  fade: "animate-[fadeIn_0.8s_ease-in-out]",
  slide: "animate-[slideIn_0.6s_ease-out]",
  zoom: "animate-[zoomIn_0.7s_ease-out]",
  dissolve: "animate-[fadeIn_1.2s_ease-in-out]",
};

function getValidPanels(panels: ComicPanel[]): ComicPanel[] {
  return panels.filter(
    (p) => p.status === "completed" && p.imageUrl && !p.imageUrl.startsWith("data:text/plain")
  );
}

export function DynamicPlayer({ panels, title }: DynamicPlayerProps) {
  const validPanels = getValidPanels(panels);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showDialogue, setShowDialogue] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [transitionKey, setTransitionKey] = useState(0);

  const currentPanel = validPanels[currentIndex];
  const panelDuration = (currentPanel?.duration || 5) * 1000;
  const transition = currentPanel?.transition || "fade";

  const goTo = useCallback((index: number) => {
    setCurrentIndex(index);
    setTransitionKey((k) => k + 1);
  }, []);

  const next = useCallback(() => {
    if (currentIndex < validPanels.length - 1) {
      goTo(currentIndex + 1);
    } else {
      setIsPlaying(false);
    }
  }, [currentIndex, validPanels.length, goTo]);

  const prev = useCallback(() => {
    if (currentIndex > 0) goTo(currentIndex - 1);
  }, [currentIndex, goTo]);

  // Auto-play timer
  useEffect(() => {
    if (!isPlaying) return;
    timerRef.current = setTimeout(next, panelDuration);
    return () => clearTimeout(timerRef.current);
  }, [isPlaying, currentIndex, panelDuration, next]);

  // Keyboard controls
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      else if (e.key === "Escape") setIsPlaying(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [next, prev]);

  if (validPanels.length === 0) {
    return <p className="text-center text-muted-foreground text-sm">没有可播放的面板</p>;
  }

  return (
    <div className="space-y-4">
      {/* Player area */}
      <div className="relative aspect-square sm:aspect-video bg-black rounded-xl overflow-hidden select-none">
        {/* Image with transition */}
        <div
          key={transitionKey}
          className={`absolute inset-0 ${TRANSITION_CLASSES[transition]}`}
        >
          {currentPanel?.imageUrl && (
            <img
              src={currentPanel.imageUrl}
              alt={currentPanel.scene}
              className="w-full h-full object-contain"
              draggable={false}
            />
          )}
        </div>

        {/* Dialogue overlay */}
        {showDialogue && currentPanel?.dialogue && (
          <div className="absolute inset-x-0 bottom-0 z-10">
            <div className="bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-12 sm:p-6 sm:pt-16">
              <p className="text-white text-sm sm:text-base leading-relaxed animate-[fadeIn_0.5s_ease-in-out]">
                {currentPanel.dialogue}
              </p>
            </div>
          </div>
        )}

        {/* Panel number */}
        <div className="absolute top-3 left-3 px-2.5 py-1 text-xs font-bold bg-black/60 text-white rounded-full">
          {currentIndex + 1}/{validPanels.length}
        </div>

        {/* Nav arrows */}
        {currentIndex > 0 && (
          <button
            onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        {currentIndex < validPanels.length - 1 && (
          <button
            onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground flex items-center gap-2 min-h-[40px]"
        >
          {isPlaying ? (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
              暂停
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              {currentIndex === validPanels.length - 1 ? "重播" : "自动播放"}
            </>
          )}
        </button>

        <button
          onClick={() => setShowDialogue(!showDialogue)}
          className={`px-3 py-2 text-sm rounded-lg border transition-colors min-h-[40px] ${
            showDialogue ? "bg-accent" : ""
          }`}
        >
          {showDialogue ? "隐藏字幕" : "显示字幕"}
        </button>

        {/* Reset to start */}
        {currentIndex > 0 && (
          <button
            onClick={() => { goTo(0); setIsPlaying(false); }}
            className="px-3 py-2 text-sm rounded-lg border hover:bg-accent transition-colors min-h-[40px]"
          >
            回到开头
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="flex gap-1">
        {validPanels.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className={`flex-1 h-1.5 rounded-full transition-colors ${
              i === currentIndex
                ? "bg-primary"
                : i < currentIndex
                  ? "bg-primary/40"
                  : "bg-muted"
            }`}
          />
        ))}
      </div>

      {/* Scene description */}
      {currentPanel?.scene && (
        <p className="text-xs text-center text-muted-foreground">{currentPanel.scene}</p>
      )}
    </div>
  );
}
