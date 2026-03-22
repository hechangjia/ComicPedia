"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RelatedTopic, ComicScript, PartialLLMConfig } from "@/lib/types";
import { generateRelatedTopics } from "@/lib/relatedTopics";
import { Spinner } from "@/components/ui/Spinner";

interface RelatedTopicsPanelProps {
  script: ComicScript;
  llmConfig?: PartialLLMConfig;
  onRelatedTopicsGenerated?: (topics: RelatedTopic[]) => void;
}

export function RelatedTopicsPanel({ script, llmConfig, onRelatedTopicsGenerated }: RelatedTopicsPanelProps) {
  const router = useRouter();
  const [topics, setTopics] = useState<RelatedTopic[] | null>(script.relatedTopics ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDiscover = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await generateRelatedTopics(script, llmConfig);
      setTopics(result);
      if (result.length > 0) onRelatedTopicsGenerated?.(result);
      if (result.length === 0) setError("未找到关联词条");
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取失败");
    } finally {
      setLoading(false);
    }
  }, [script, llmConfig, onRelatedTopicsGenerated]);

  const handleCreateComic = (topic: RelatedTopic) => {
    router.push(`/?mode=wikipedia&topic=${encodeURIComponent(topic.wikipediaTitle)}`);
  };

  return (
    <div className="p-4 rounded-xl border bg-card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          延伸阅读
        </h3>
        <button
          onClick={handleDiscover}
          disabled={loading}
          className="px-3 py-1.5 text-xs border rounded-lg hover:bg-accent transition-colors disabled:opacity-50 flex items-center gap-1.5 min-h-[36px]"
        >
          {loading ? <><Spinner size="sm" /> 发现中...</> : topics ? "重新发现" : "发现关联词条"}
        </button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {topics && topics.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-2 snap-x scrollbar-hide">
          {topics.map((topic, i) => (
            <div
              key={i}
              className="min-w-[200px] max-w-[240px] rounded-xl border bg-background p-3 snap-start space-y-2 shrink-0"
            >
              {topic.thumbnail && (
                <div className="aspect-video rounded-lg bg-muted overflow-hidden">
                  <img
                    src={topic.thumbnail}
                    alt={topic.wikipediaTitle}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              )}
              <h4 className="text-sm font-medium line-clamp-1">{topic.wikipediaTitle}</h4>
              {topic.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{topic.description}</p>
              )}
              <button
                onClick={() => handleCreateComic(topic)}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                生成漫画
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
