"use client";

import type { ReferenceImageEntry } from "@/lib/types";
import { RefVersionSwitcher } from "./RefShared";

interface RefImageCardProps {
  img: string;
  label: string;
  index: number;
  entry?: ReferenceImageEntry;
  isEditing: boolean;
  isRegenerating: boolean;
  canEdit: boolean;
  onClickImage: () => void;
  onToggleEdit: () => void;
  onDelete: () => void;
  onRefVersionChange?: (versionIndex: number) => void;
}

export function RefImageCard({
  img,
  label,
  index,
  entry,
  isEditing,
  isRegenerating,
  canEdit,
  onClickImage,
  onToggleEdit,
  onDelete,
  onRefVersionChange,
}: RefImageCardProps) {
  const hasVersions = entry && entry.versions.length > 1;

  return (
    <div className="relative shrink-0 group/thumb">
      <div
        className="w-16 h-16 rounded-lg border overflow-hidden bg-white dark:bg-muted cursor-pointer"
        onClick={onClickImage}
      >
        {isRegenerating ? (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <svg className="animate-spin w-4 h-4 text-muted-foreground" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : (
          <img
            src={img}
            alt={label || `参考图 ${index + 1}`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        )}
        {!isRegenerating && (
          <div className="absolute inset-0 rounded-lg bg-black/0 group-hover/thumb:bg-black/30 transition-colors flex items-center justify-center">
            <svg className="w-4 h-4 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
          </div>
        )}
      </div>

      <div className="absolute -top-1 -right-1 flex gap-0.5 opacity-100 sm:opacity-0 sm:group-hover/thumb:opacity-100 transition-opacity">
        {canEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleEdit();
            }}
            className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs"
            title="编辑 Prompt"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs"
          title="删除"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-1 text-[10px] bg-black/60 text-white text-center truncate rounded-b-lg">
        {label || index + 1}
      </div>

      {hasVersions && onRefVersionChange && (
        <div className="mt-0.5">
          <RefVersionSwitcher
            versions={entry.versions.length}
            activeIndex={entry.activeVersionIndex}
            onChange={onRefVersionChange}
          />
        </div>
      )}
    </div>
  );
}
