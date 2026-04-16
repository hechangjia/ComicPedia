"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { ComicPanel, GenerateTask } from "@/lib/types";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface GalleryLightboxProps {
  task: GenerateTask;
  panels: ComicPanel[];
  currentIndex: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onJump: (index: number) => void;
}

export function GalleryLightbox({
  task,
  panels,
  currentIndex,
  onClose,
  onPrev,
  onNext,
  onJump,
}: GalleryLightboxProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, onNext, onPrev]);

  // Preload adjacent images
  useEffect(() => {
    [currentIndex - 1, currentIndex + 1].forEach((idx) => {
      if (idx >= 0 && idx < panels.length) {
        const img = new Image();
        img.src = panels[idx].imageUrl ?? "";
      }
    });
  }, [currentIndex, panels]);

  // Focus trap
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const trapFocus = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = container.querySelectorAll(focusableSelector);
      if (focusable.length === 0) return;
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    const closeBtn = container.querySelector("button");
    closeBtn?.focus();
    document.addEventListener("keydown", trapFocus);
    return () => document.removeEventListener("keydown", trapFocus);
  }, []);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors z-10"
      >
        <X className="w-6 h-6" />
      </button>

      <div className="flex flex-col items-center gap-4 max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-white text-lg font-semibold text-center">{task.script?.title}</h2>

        <div className="relative w-full flex items-center justify-center">
          {currentIndex > 0 && (
            <button
              onClick={onPrev}
              className="absolute left-0 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors z-10"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          <img
            src={panels[currentIndex].imageUrl}
            alt={panels[currentIndex].scene}
            className="max-w-full max-h-[70vh] object-contain rounded-lg"
          />

          {currentIndex < panels.length - 1 && (
            <button
              onClick={onNext}
              className="absolute right-0 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors z-10"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
        </div>

        {panels[currentIndex].dialogue && (
          <div className="bg-black/70 rounded-lg px-4 py-2 max-w-lg text-center">
            <p className="text-white text-sm leading-relaxed">{panels[currentIndex].dialogue}</p>
          </div>
        )}

        <div className="flex items-center gap-3 text-white/70 text-sm">
          <span>{currentIndex + 1} / {panels.length}</span>
          <div className="flex gap-1.5">
            {panels.map((p, idx) => (
              <button
                key={idx}
                onClick={() => onJump(idx)}
                className={`w-8 h-8 rounded border-2 overflow-hidden transition-all ${
                  idx === currentIndex ? "border-white scale-110" : "border-transparent opacity-60 hover:opacity-100"
                }`}
              >
                <img src={p.imageUrl} alt={`Panel ${idx + 1}`} className="w-full h-full object-cover" loading="lazy" decoding="async" />
              </button>
            ))}
          </div>
        </div>

        <Link href={`/result/${task.id}`} className="text-white/60 text-xs hover:text-white transition-colors">
          查看完整详情 →
        </Link>
      </div>
    </div>
  );
}
