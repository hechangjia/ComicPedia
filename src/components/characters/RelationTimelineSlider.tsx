"use client";

import type { CharacterRelation } from "@/lib/types";

interface Props {
  maxEpisode: number;
  currentEpisode: number;
  onChange: (episode: number) => void;
}

export function RelationTimelineSlider({ maxEpisode, currentEpisode, onChange }: Props) {
  if (maxEpisode <= 1) return null;
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 rounded-lg">
      <span className="text-xs text-muted-foreground whitespace-nowrap">第 {currentEpisode} 集</span>
      <input
        type="range"
        min={1}
        max={maxEpisode}
        value={currentEpisode}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1"
      />
      <span className="text-xs text-muted-foreground whitespace-nowrap">/ {maxEpisode}</span>
    </div>
  );
}

export function filterRelationsAtEpisode(
  relations: CharacterRelation[],
  episode: number,
): CharacterRelation[] {
  return relations.map((rel) => {
    const events = rel.evolution.filter((e) => e.episodeNumber <= episode);
    if (events.length === 0) return rel;
    const latest = events[events.length - 1];
    return { ...rel, strength: latest.newStrength, type: latest.newType ?? rel.type };
  });
}
