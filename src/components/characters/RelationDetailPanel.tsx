"use client";

import React, { useState } from "react";
import type { Character, CharacterRelation, RelationType, RelationEvent } from "@/lib/types";
import { TYPE_LABELS } from "./RelationEdge";
import { ArrowRight, X } from "lucide-react";


const RELATION_TYPES: RelationType[] = [
  "friend", "rival", "mentor", "lover", "family", "ally", "enemy",
];

interface RelationDetailPanelProps {
  relation: CharacterRelation;
  characters: Character[];
  onSave: (updated: Partial<CharacterRelation>) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function RelationDetailPanel({
  relation,
  characters,
  onSave,
  onDelete,
  onClose,
}: RelationDetailPanelProps) {
  const [type, setType] = useState<RelationType>(relation.type);
  const [label, setLabel] = useState(relation.label);
  const [strength, setStrength] = useState(relation.strength);
  const [saving, setSaving] = useState(false);

  const fromChar = characters.find((c) => c.id === relation.fromId);
  const toChar = characters.find((c) => c.id === relation.toId);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ type, label, strength });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-card border-l shadow-xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold text-sm">关系详情</h3>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-accent transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* From / To */}
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{fromChar?.name ?? "?"}</span>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium">{toChar?.name ?? "?"}</span>
        </div>

        {/* Relation Type */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">关系类型</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as RelationType)}
            className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {RELATION_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]} ({t})</option>
            ))}
          </select>
        </div>

        {/* Label */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">标签</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="自定义标签..."
            className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Strength */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            强度: {strength.toFixed(2)}
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={strength}
            onChange={(e) => setStrength(parseFloat(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Evolution History */}
        {relation.evolution.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">演变历史</label>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {relation.evolution.map((ev: RelationEvent, i: number) => (
                <div
                  key={i}
                  className="text-xs p-2 rounded bg-muted/50 space-y-0.5"
                >
                  <div className="font-medium">第 {ev.episodeNumber} 集</div>
                  <div className="text-muted-foreground">{ev.change}</div>
                  {ev.newType && (
                    <div className="text-muted-foreground">
                      类型变更: {TYPE_LABELS[ev.newType]}
                    </div>
                  )}
                  <div className="text-muted-foreground">
                    强度: {ev.newStrength.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving ? "保存中..." : "保存"}
        </button>
        <button
          onClick={onDelete}
          className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
        >
          删除
        </button>
      </div>
    </div>
  );
}
