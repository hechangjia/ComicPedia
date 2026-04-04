"use client";

import { useState, useEffect } from "react";
import type { Character, CharacterRelation, RelationType, ComicStyle, ContentType } from "@/lib/types";
import type { Series } from "@/lib/series";
import { Sparkles, X } from "lucide-react";

interface EpisodeProposalModalProps {
  relation: CharacterRelation;
  oldType: RelationType;
  newType: RelationType;
  characters: Character[];
  onConfirm: (seriesId: string, topic: string, contentType: ContentType, style: ComicStyle) => void;
  onClose: () => void;
}

const TYPE_LABELS: Record<RelationType, string> = {
  friend: "朋友",
  rival: "对手",
  mentor: "导师",
  lover: "恋人",
  family: "家人",
  ally: "盟友",
  enemy: "敌人",
};

export function EpisodeProposalModal({
  relation,
  oldType,
  newType,
  characters,
  onConfirm,
  onClose,
}: EpisodeProposalModalProps) {
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const fromChar = characters.find(c => c.id === relation.fromId);
  const toChar = characters.find(c => c.id === relation.toId);
  const fromName = fromChar?.name ?? relation.fromId;
  const toName = toChar?.name ?? relation.toId;

  const defaultTopic = `${fromName}与${toName}的关系从${TYPE_LABELS[oldType]}变为${TYPE_LABELS[newType]}`;
  const [topic, setTopic] = useState(defaultTopic);

  useEffect(() => {
    fetch("/api/series")
      .then(r => r.ok ? r.json() : [])
      .then((list: Series[]) => {
        setSeriesList(list);
        if (list.length > 0) setSelectedSeriesId(list[0].id);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleConfirm = () => {
    if (!selectedSeriesId) return;
    const series = seriesList.find(s => s.id === selectedSeriesId);
    onConfirm(
      selectedSeriesId,
      topic,
      series?.contentType ?? "science",
      series?.style ?? "flat",
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent-teal" />
            <h2 className="text-base font-semibold">关系转折点</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-surface-raised transition-colors">
            <X className="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-text-secondary">
            <strong>{fromName}</strong> 与 <strong>{toName}</strong> 的关系发生了重大变化：
            <span className="inline-block mx-1 px-1.5 py-0.5 rounded text-xs bg-surface-raised">
              {TYPE_LABELS[oldType]}
            </span>
            →
            <span className="inline-block mx-1 px-1.5 py-0.5 rounded text-xs bg-surface-raised">
              {TYPE_LABELS[newType]}
            </span>
          </p>

          <p className="text-sm text-text-secondary">
            是否基于这个转折点生成一集新漫画？系统将自动注入角色历史和关系上下文。
          </p>

          {/* Topic */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">剧集主题</label>
            <textarea
              value={topic}
              onChange={e => setTopic(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-teal/40 resize-none"
            />
          </div>

          {/* Series selection */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">所属连载</label>
            {loading ? (
              <p className="text-xs text-text-muted">加载中...</p>
            ) : seriesList.length === 0 ? (
              <p className="text-xs text-text-muted">暂无连载系列。请先在连载页面创建一个系列。</p>
            ) : (
              <select
                value={selectedSeriesId}
                onChange={e => setSelectedSeriesId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-teal/40"
              >
                {seriesList.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.title} ({s.episodes.length} 集)
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-subtle bg-surface-warm">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-surface-raised transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedSeriesId || !topic.trim()}
            className="px-4 py-2 text-sm rounded-lg bg-accent-teal text-white font-medium hover:opacity-90 disabled:opacity-40 transition-all flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            生成剧集
          </button>
        </div>
      </div>
    </div>
  );
}
