"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useContentForm } from "@/hooks/useContentForm";
import { StyleSelector } from "./StyleSelector";
import { PanelCountSelector } from "./PanelCountSelector";
import { ReferenceImagePanel } from "./ReferenceImagePanel";
import { ModelSelector } from "./ModelSelector";
import { CharacterPicker } from "./CharacterPicker";
import { ErrorAlert } from "./ErrorAlert";
import { Spinner } from "./ui/Spinner";
import { QualitySelector } from "./QualitySelector";
import { summarizeWikipediaContent } from "@/lib/llm";
import { getStoredRequestConfigs } from "@/hooks/useAPIConfig";
import type { WikipediaContent } from "@/lib/types";

interface SearchResult {
  title: string;
  description?: string;
  thumbnail?: { source: string; width: number; height: number };
}

const WIKI_LANGS = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
];

const EXAMPLE_TOPICS = [
  "光合作用",
  "DNA",
  "黑洞",
  "量子力学",
  "恐龙",
  "人工智能",
];

export function WikipediaForm() {
  const [searchQuery, setSearchQuery] = useState("");
  const [lang, setLang] = useState("zh");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<(WikipediaContent & { pageUrl?: string; sections?: string[] }) | null>(null);
  const [isLoadingArticle, setIsLoadingArticle] = useState(false);
  const [editedContent, setEditedContent] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const resultsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const topic = selectedArticle?.title || searchQuery;

  const form = useContentForm(
    {
      contentType: "wikipedia",
      defaultStyle: "flat",
      emptyInputMessage: "请先搜索并选择一篇 Wikipedia 文章",
    },
    useCallback(() => topic, [topic]),
  );

  // 点击外部关闭搜索结果
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (resultsRef.current && !resultsRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 防抖搜索
  const doSearch = useCallback((query: string, searchLang: string) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (!query.trim()) {
      setSearchResults([]);
      setShowResults(false);
      setHasSearched(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      setHasSearched(true);
      try {
        const res = await fetch(`/api/wikipedia?q=${encodeURIComponent(query)}&lang=${searchLang}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
          setShowResults(true);
          setHighlightedIndex(-1);
        }
      } catch (err) {
        console.warn("Wikipedia search failed:", err);
      } finally {
        setIsSearching(false);
      }
    }, 400);
  }, []);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    doSearch(query, lang);
  }, [lang, doSearch]);

  // 键盘导航
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showResults || searchResults.length === 0) {
      if (e.key === "Enter" && searchQuery.trim()) {
        e.preventDefault();
        doSearch(searchQuery, lang);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < searchResults.length - 1 ? prev + 1 : 0,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : searchResults.length - 1,
        );
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
          handleSelectArticle(searchResults[highlightedIndex].title);
        }
        break;
      case "Escape":
        e.preventDefault();
        setShowResults(false);
        break;
    }
  };

  // 选择文章
  const handleSelectArticle = async (title: string) => {
    setShowResults(false);
    setIsLoadingArticle(true);
    try {
      const res = await fetch(`/api/wikipedia?title=${encodeURIComponent(title)}&lang=${lang}`);
      if (res.ok) {
        const data = await res.json();
        const article = {
          title: data.title,
          extract: data.extract,
          sections: data.sections,
          thumbnail: data.thumbnail?.source,
          lang,
          pageUrl: data.pageUrl,
        };
        setSelectedArticle(article);
        setEditedContent(data.extract);
        setSearchQuery(data.title);
      } else {
        form.setError("获取文章失败，请重试");
      }
    } catch {
      form.setError("网络错误，请检查连接");
    } finally {
      setIsLoadingArticle(false);
    }
  };

  // 提交生成
  const handleGenerate = () => {
    if (!selectedArticle) {
      form.setError("请先搜索并选择一篇 Wikipedia 文章");
      return;
    }

    const wikiContent: WikipediaContent = {
      title: selectedArticle.title,
      extract: editedContent || selectedArticle.extract,
      sections: selectedArticle.sections,
      thumbnail: selectedArticle.thumbnail,
      lang: selectedArticle.lang,
    };

    form.handleSubmit(selectedArticle.title, {
      wikipediaContent: wikiContent,
    });
  };

  // 清除选择
  const handleClear = () => {
    setSelectedArticle(null);
    setEditedContent("");
    setSearchQuery("");
    setSearchResults([]);
    setHasSearched(false);
    inputRef.current?.focus();
  };

  // AI 概括
  const handleSummarize = async () => {
    if (!selectedArticle || !editedContent) return;
    setIsSummarizing(true);
    try {
      const { llmConfig } = getStoredRequestConfigs(form.selectedLLMId ?? undefined);
      const summary = await summarizeWikipediaContent(
        selectedArticle.title,
        editedContent,
        llmConfig,
      );
      setEditedContent(summary);
    } catch (err) {
      form.setError(err instanceof Error ? err.message : "AI 概括失败，请检查 LLM 配置");
    } finally {
      setIsSummarizing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-6 p-6 rounded-xl border bg-card shadow-sm hover:shadow-md transition-shadow">
        {/* 语言选择 + 搜索框 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">搜索 Wikipedia 文章</label>
          <div className="flex gap-2">
            <select
              value={lang}
              onChange={(e) => {
                const newLang = e.target.value;
                setLang(newLang);
                if (searchQuery) doSearch(searchQuery, newLang);
              }}
              className="px-3 py-2 rounded-lg border bg-background text-sm"
              disabled={form.isLoading}
            >
              {WIKI_LANGS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
            <div className="relative flex-1" ref={resultsRef}>
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                onFocus={() => searchResults.length > 0 && setShowResults(true)}
                onKeyDown={handleKeyDown}
                placeholder="输入关键词搜索，按 Enter 确认..."
                className="w-full px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={form.isLoading}
              />
              {isSearching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Spinner size="sm" />
                </div>
              )}

              {/* 搜索建议下拉 */}
              {showResults && (
                <div className="absolute z-50 w-full mt-1 rounded-lg border bg-popover shadow-lg max-h-80 overflow-y-auto">
                  {searchResults.length > 0 ? (
                    searchResults.map((result, idx) => (
                      <button
                        key={result.title}
                        onClick={() => handleSelectArticle(result.title)}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-b last:border-b-0 ${
                          idx === highlightedIndex ? "bg-accent" : "hover:bg-accent"
                        }`}
                      >
                        {result.thumbnail ? (
                          <img
                            src={result.thumbnail.source}
                            alt=""
                            className="w-10 h-10 rounded object-cover flex-shrink-0 bg-muted"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0 text-lg font-bold text-blue-500">
                            W
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{result.title}</div>
                          {result.description && (
                            <div className="text-xs text-muted-foreground line-clamp-2">{result.description}</div>
                          )}
                        </div>
                      </button>
                    ))
                  ) : hasSearched && !isSearching ? (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                      未找到相关文章，换个关键词试试
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 加载中 */}
        {isLoadingArticle && (
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
            <Spinner />
            <span>正在获取文章内容...</span>
          </div>
        )}

        {/* 文章预览/编辑 */}
        {selectedArticle && !isLoadingArticle && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-blue-500 text-white text-xs font-bold">W</span>
                {selectedArticle.title}
              </h3>
              <div className="flex items-center gap-3">
                {selectedArticle.pageUrl && (
                  <a
                    href={selectedArticle.pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:text-blue-600 hover:underline transition-colors"
                  >
                    查看 Wikipedia 原文
                  </a>
                )}
                <button
                  onClick={handleClear}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  重新选择
                </button>
              </div>
            </div>

            {selectedArticle.thumbnail && (
              <img
                src={selectedArticle.thumbnail}
                alt={selectedArticle.title}
                className="w-full max-h-48 object-cover rounded-lg bg-muted"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}

            {/* 章节目录 */}
            {selectedArticle.sections && selectedArticle.sections.length > 0 && (
              <details className="text-sm">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  文章目录（{selectedArticle.sections.length} 个章节）
                </summary>
                <div className="mt-1 pl-3 border-l-2 border-muted space-y-0.5">
                  {selectedArticle.sections.map((s, i) => (
                    <div key={i} className="text-xs text-muted-foreground">{s}</div>
                  ))}
                </div>
              </details>
            )}

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                文章内容（可编辑，编辑后的内容将作为漫画知识源）
              </label>
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="w-full min-h-[200px] max-h-[400px] p-3 rounded-lg border bg-background resize-y text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={form.isLoading}
              />
              <div className="flex items-center justify-between">
                <button
                  onClick={handleSummarize}
                  disabled={form.isLoading || isSummarizing || editedContent.length < 500}
                  className="text-xs px-2.5 py-1 rounded-md border border-blue-300 text-blue-600 hover:bg-blue-50 hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isSummarizing ? (
                    <span className="flex items-center gap-1">
                      <Spinner size="sm" />
                      概括中...
                    </span>
                  ) : (
                    "AI 概括润色"
                  )}
                </button>
                <span className="text-xs text-muted-foreground">
                  {editedContent.length} 字符
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 配置选项 */}
        {selectedArticle && (
          <>
            <ModelSelector type="llm" value={form.selectedLLMId} onChange={form.setSelectedLLMId} disabled={form.isLoading} />
            <ModelSelector type="image" value={form.selectedImageId} onChange={form.setSelectedImageId} disabled={form.isLoading} />
            <StyleSelector value={form.style} onChange={form.setStyle} disabled={form.isLoading} />

            <PanelCountSelector
              panelCount={form.panelCount}
              customPanelCount={form.customPanelCount}
              onPanelCountChange={form.setPanelCount}
              onCustomPanelCountChange={form.setCustomPanelCount}
              disabled={form.isLoading}
            />

            <QualitySelector value={form.quality} onChange={form.setQuality} disabled={form.isLoading} />

            <CharacterPicker
              selectedIds={form.selectedCharacterIds}
              onSelectionChange={form.handleCharacterSelection}
              currentStyle={form.style}
              disabled={form.isLoading}
            />

            <ReferenceImagePanel
              referenceImage={form.referenceImage}
              referenceImages={form.referenceImages}
              referenceLabels={form.referenceLabels}
              controlMode={form.controlMode}
              onImageChange={form.setReferenceImage}
              onImagesChange={form.setReferenceImages}
              onLabelsChange={form.setReferenceLabels}
              onControlModeChange={form.setControlMode}
              onAIGenerate={form.handleAIGenerateReference}
              onAIGenerateCharacters={form.handleAIGenerateCharacters}
              onRegenerateRef={form.handleRegenerateFormRef}
              onRefVersionChange={form.handleFormRefVersionChange}
              title={topic}
              referenceEntries={form.referenceEntries}
              onEntriesChange={form.setReferenceEntries}
              genMode={form.genMode}
              onGenModeChange={form.setGenMode}
            />
          </>
        )}

        <ErrorAlert message={form.error} onClose={() => form.setError("")} />

        <button
          onClick={handleGenerate}
          disabled={form.isLoading || !selectedArticle}
          className="w-full py-3 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg hover:shadow-blue-500/25 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        >
          {form.isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner />
              生成中...
            </span>
          ) : (
            "生成百科漫画"
          )}
        </button>
      </div>

      {/* 示例主题 */}
      {!selectedArticle && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground text-center">试试这些话题：</p>
          <div className="flex flex-wrap justify-center gap-2">
            {EXAMPLE_TOPICS.map((example) => (
              <button
                key={example}
                onClick={() => handleSearch(example)}
                className="px-3 py-1.5 text-sm rounded-full border hover:bg-primary/5 hover:border-primary/30 hover:-translate-y-0.5 transition-all duration-200"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
