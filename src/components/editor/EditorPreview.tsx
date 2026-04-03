"use client";

import type { ComicPanel, ComicStyle } from "@/lib/types";

interface EditorPreviewProps {
  panels: ComicPanel[];
  style: ComicStyle;
}

export function EditorPreview({ panels, style }: EditorPreviewProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {panels.map((panel, i) => (
        <div key={panel.id ?? i} className="space-y-1">
          {/* Thumbnail */}
          <div className="aspect-square rounded-lg border bg-muted/30 overflow-hidden flex items-center justify-center">
            {panel.imageUrl && !panel.imageUrl.startsWith("data:text/plain") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={panel.imageUrl}
                alt={`面板 ${i + 1}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-center text-muted-foreground/40 text-xs p-2">
                <svg className="w-8 h-8 mx-auto mb-1 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {i + 1}
              </div>
            )}
          </div>
          {/* Scene */}
          {panel.scene && (
            <p className="text-[11px] text-foreground/80 line-clamp-2 leading-snug">{panel.scene}</p>
          )}
          {/* Dialogue */}
          {panel.dialogue && (
            <p className="text-[11px] text-muted-foreground italic line-clamp-2 leading-snug">{panel.dialogue}</p>
          )}
          {/* Style badge */}
          {(panel.styleOverride || style) && (
            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">
              {panel.styleOverride ?? style}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
