"use client";

import { useEffect, useState } from "react";
import type { Character, ComicStyle } from "@/lib/types";
import { STYLE_DESCRIPTIONS } from "@/lib/config/styles";
import { Spinner } from "@/components/ui/Spinner";
import { CharacterVLMPanel } from "./CharacterVLMPanel";
import { useCharacterForm } from "@/hooks/useCharacterForm";
import { Check, ChevronLeft, ChevronRight, Download, RefreshCw, X } from "lucide-react";


const STYLE_NAMES: Record<ComicStyle, string> = Object.fromEntries(
  (Object.keys(STYLE_DESCRIPTIONS) as ComicStyle[]).map((key) => [
    key,
    STYLE_DESCRIPTIONS[key].split("，")[0].replace(/风格$/, ""),
  ])
) as Record<ComicStyle, string>;

const ALL_STYLES = Object.keys(STYLE_DESCRIPTIONS) as ComicStyle[];

export function CharacterDialog({
  character,
  onSave,
  onClose,
  saveSuccessCount = 0,
}: {
  character: Partial<Character> | null;
  onSave: (data: Omit<Character, "id" | "createdAt" | "updatedAt"> & { id?: string }) => Promise<Character>;
  onClose: () => void;
  saveSuccessCount?: number;
}) {
  const h = useCharacterForm({ character, onSave });

  // --- Save feedback ---
  const [saveSuccess, setSaveSuccess] = useState(false);
  useEffect(() => {
    if (saveSuccessCount > 0) {
      setSaveSuccess(true);
      const timer = setTimeout(() => setSaveSuccess(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [saveSuccessCount]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={() => { if (h.previewIndex < 0) onClose(); }}
    >
      <div
        className="bg-background rounded-xl border shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-4">
          <h2 className="text-lg font-bold">{h.isEdit ? "编辑角色" : "创建角色"}</h2>

          {/* 名称 + 操作按钮 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">角色名 *</label>
            <input
              type="text"
              value={h.form.name}
              onChange={(e) => h.updateField("name", e.target.value)}
              placeholder="如：林黛玉、Darth Vader"
              className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex gap-2">
              <button
                onClick={h.handleAIProfile}
                disabled={h.aiGenerating || h.wikiImporting || !h.form.name.trim()}
                className="flex-1 px-3 py-2 text-xs border border-teal/30 text-teal rounded-lg hover:bg-teal-soft dark:hover:bg-teal/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {h.aiGenerating ? (
                  <>
                    <Spinner size="sm" />
                    生成中...
                  </>
                ) : (
                  "AI 生成档案"
                )}
              </button>
              <button
                onClick={h.handleOpenWikiSearch}
                disabled={h.wikiImporting || h.aiGenerating}
                className="flex-1 px-3 py-2 text-xs border border-info/20 text-info rounded-lg hover:bg-info/5 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {h.wikiImporting ? (
                  <>
                    <Spinner size="sm" />
                    {h.wikiImportStep || "导入中..."}
                  </>
                ) : (
                  "Wikipedia 导入"
                )}
              </button>
            </div>

            {/* Wikipedia 搜索选择面板 */}
            {h.wikiSearchOpen && !h.wikiImporting && (
              <div className="border rounded-lg bg-muted/30 p-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={h.wikiSearchQuery}
                    onChange={(e) => {
                      h.setWikiSearchQuery(e.target.value);
                      h.doWikiSearch(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") h.setWikiSearchOpen(false);
                    }}
                    placeholder="搜索 Wikipedia 文章..."
                    className="flex-1 px-2.5 py-1.5 text-xs border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    autoFocus
                  />
                  <button
                    onClick={() => h.setWikiSearchOpen(false)}
                    className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    取消
                  </button>
                </div>

                {h.wikiSearching && (
                  <div className="flex items-center justify-center py-3 gap-1.5 text-xs text-muted-foreground">
                    <Spinner size="sm" />
                    搜索中...
                  </div>
                )}

                {!h.wikiSearching && h.wikiSearchResults.length > 0 && (
                  <div className="max-h-60 overflow-y-auto rounded-lg border divide-y">
                    {h.wikiSearchResults.map((result) => (
                      <button
                        key={`${result.lang}:${result.title}`}
                        onClick={() => h.handleWikiImport(result.title, result.lang)}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left hover:bg-accent transition-colors"
                      >
                        {result.thumbnail ? (
                          <img
                            src={result.thumbnail.source}
                            alt=""
                            className="w-8 h-8 rounded object-cover flex-shrink-0 bg-muted"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0 text-xs font-bold text-info">
                            W
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium truncate">
                            {result.title}
                            <span className={`ml-1.5 text-[10px] px-1 py-0.5 rounded ${
                              result.lang === "en"
                                ? "bg-info/10 text-info"
                                : "bg-success/10 text-success"
                            }`}>
                              {result.lang === "en" ? "EN" : "ZH"}
                            </span>
                          </div>
                          {result.description && (
                            <div className="text-[10px] text-muted-foreground line-clamp-1">{result.description}</div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {!h.wikiSearching && h.wikiSearchResults.length === 0 && h.wikiSearchQuery.trim() && (
                  <div className="text-center py-3 text-xs text-muted-foreground">
                    未找到相关文章，试试英文名或其他关键词
                  </div>
                )}
              </div>
            )}
            {h.aiError && <p className="text-xs text-error">{h.aiError}</p>}

            {/* Wikipedia 导入结果预览 */}
            {h.wikiImportResult && (
              <div className="p-3 rounded-lg bg-info/10 border border-info/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-info">Wikipedia 导入成功</span>
                  <button
                    onClick={() => h.setWikiImportResult(null)}
                    className="text-xs text-info/70 hover:text-info transition-colors"
                  >
                    关闭
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 text-[10px] text-info">
                  <span className="px-1.5 py-0.5 bg-info/10 rounded">
                    描述 {h.wikiImportResult.enDesc.length} 字符
                  </span>
                  {h.wikiImportResult.appearanceFields > 0 && (
                    <span className="px-1.5 py-0.5 bg-info/10 rounded">
                      外观 {h.wikiImportResult.appearanceFields} 项
                    </span>
                  )}
                  {h.wikiImportResult.thumbnail && (
                    <span className="px-1.5 py-0.5 bg-info/10 rounded">
                      参考图 1 张
                    </span>
                  )}
                  {h.wikiImportResult.tags > 0 && (
                    <span className="px-1.5 py-0.5 bg-info/10 rounded">
                      标签 {h.wikiImportResult.tags} 个
                    </span>
                  )}
                </div>
                {h.wikiImportResult.zhSummary && (
                  <div className="text-xs text-info border-t border-info/20 pt-2 mt-1">
                    <span className="text-[10px] text-info/70 block mb-0.5">中文摘要：</span>
                    {h.wikiImportResult.zhSummary}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 描述 */}
          <div className="space-y-1">
            <label className="text-sm font-medium">描述</label>
            <textarea
              value={h.form.description}
              onChange={(e) => h.updateField("description", e.target.value)}
              placeholder="角色的简要描述..."
              className="w-full px-3 py-2 text-sm border rounded-lg bg-background resize-none h-16 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* 外观属性 */}
          <div className="space-y-1">
            <label className="text-sm font-medium">外观属性</label>
            <div className="mb-2">
              <input
                type="text"
                value={h.form.appearance.species || ""}
                onChange={(e) => h.updateAppearance("species", e.target.value)}
                placeholder="物种/类型（留空=人类，如：penguin, whale, lobster）"
                className="w-full px-3 py-1.5 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["gender", "age", "hair", "eyes", "clothing"] as const).map((key) => {
                const isNonHuman = !!h.form.appearance.species;
                const humanLabels: Record<string, string> = {
                  gender: "性别", age: "年龄", hair: "发型/发色", eyes: "眼睛", clothing: "服装",
                };
                const mascotLabels: Record<string, string> = {
                  gender: "性别（可填 N/A）", age: "年龄/阶段", hair: "毛发/羽毛/外表特征",
                  eyes: "眼睛特征", clothing: "体表/装饰/配件",
                };
                const labels = isNonHuman ? mascotLabels : humanLabels;
                return (
                  <div key={key} className={key === "clothing" ? "col-span-2" : ""}>
                    <input
                      type="text"
                      value={h.form.appearance[key]}
                      onChange={(e) => h.updateAppearance(key, e.target.value)}
                      placeholder={labels[key]}
                      className="w-full px-3 py-1.5 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* 风格 */}
          <div className="space-y-1">
            <label className="text-sm font-medium">绘画风格</label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_STYLES.map((s) => (
                <button
                  key={s}
                  onClick={() => h.updateField("style", s)}
                  className={`px-2.5 py-1 text-xs rounded-lg border transition-all ${
                    h.form.style === s
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "hover:border-primary/50"
                  }`}
                >
                  {STYLE_NAMES[s]}
                </button>
              ))}
            </div>
          </div>

          {/* 标签 */}
          <div className="space-y-1">
            <label className="text-sm font-medium">标签（逗号分隔）</label>
            <input
              type="text"
              value={h.tagInput}
              onChange={(e) => h.setTagInput(e.target.value)}
              placeholder="如：古风, 女性, 红楼梦"
              className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* AI 模型选择 */}
          {(h.storedConfigs.llmConfigs.length > 1 || h.storedConfigs.imageConfigs.length > 1) && (
            <div className="space-y-1">
              <label className="text-sm font-medium">AI 模型</label>
              <div className="grid grid-cols-2 gap-2">
                {h.storedConfigs.llmConfigs.length > 0 && (
                  <div>
                    <label className="text-[10px] text-muted-foreground">LLM（档案生成）</label>
                    <select
                      value={h.selectedLLMId}
                      onChange={(e) => h.setSelectedLLMId(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {h.storedConfigs.llmConfigs.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name || c.model}{c.id === h.storedConfigs.activeLLMId ? " ★" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {h.storedConfigs.imageConfigs.length > 0 && (
                  <div>
                    <label className="text-[10px] text-muted-foreground">文生图（参考图）</label>
                    <select
                      value={h.selectedImageId}
                      onChange={(e) => h.setSelectedImageId(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {h.storedConfigs.imageConfigs.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name || c.model}{c.id === h.storedConfigs.activeImageId ? " ★" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 参考图 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              参考图
              {h.entries.length > 0 && (
                <span className="text-xs text-muted-foreground font-normal ml-1">
                  {h.entries.length} 张
                </span>
              )}
            </label>

            {/* 缩略图列表 */}
            {h.entries.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {h.entries.map((entry, index) => (
                  <div
                    key={`${index}-${entry.createdAt}`}
                    className="relative group/thumb rounded-lg border overflow-hidden bg-white"
                  >
                    <button
                      type="button"
                      onClick={() => h.setPreviewIndex(index)}
                      className="block w-full aspect-square cursor-zoom-in"
                      title="点击预览大图"
                    >
                      <img
                        src={entry.imageUrl}
                        alt={`参考图 ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                    {index === h.avatarIndex && (
                      <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center shadow">
                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 bg-black/50 px-1 py-0.5">
                      <select
                        value={entry.style || "anime"}
                        onChange={(e) => h.updateEntryStyle(index, e.target.value as ComicStyle)}
                        className="w-full text-[10px] text-white text-center bg-transparent border-none outline-none cursor-pointer appearance-none"
                        title="设置此图的风格标签"
                      >
                        {ALL_STYLES.map((s) => (
                          <option key={s} value={s} className="text-black">{STYLE_NAMES[s]}</option>
                        ))}
                      </select>
                    </div>
                    <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                      {index !== h.avatarIndex && (
                        <button
                          onClick={() => h.setAvatar(index)}
                          className="w-5 h-5 rounded-full bg-info/50 text-white flex items-center justify-center text-xs shadow"
                          title="设为头像"
                        >
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                          </svg>
                        </button>
                      )}
                      {entry.source === "ai" && (
                        <button
                          onClick={() => h.handleAIGenerate(index)}
                          disabled={h.aiGenerating}
                          className="w-5 h-5 rounded-full bg-teal text-white flex items-center justify-center text-xs disabled:opacity-50 shadow"
                          title="重新生成"
                        >
                          {h.regeneratingIndex === index ? (
                            <Spinner size="sm" />
                          ) : (
                            <RefreshCw className="w-3 h-3" />
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => h.removeEntry(index)}
                        className="w-5 h-5 rounded-full bg-error/50 text-white flex items-center justify-center text-xs shadow"
                        title="删除"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Action buttons row */}
            <div className="flex gap-2 flex-wrap">
              <input
                ref={h.fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                multiple
                onChange={h.handleFileSelect}
                className="hidden"
              />
              <button
                onClick={() => h.fileInputRef.current?.click()}
                className="px-3 py-1.5 text-xs border rounded-lg hover:bg-accent transition-colors"
              >
                上传参考图
              </button>
              <button
                onClick={() => h.handleAIGenerate()}
                disabled={h.aiGenerating}
                className="px-3 py-1.5 text-xs border border-teal/30 text-teal rounded-lg hover:bg-teal-soft dark:hover:bg-teal/10 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {h.aiGenerating && h.regeneratingIndex === -1 ? (
                  <>
                    <Spinner size="sm" />
                    生成中...
                  </>
                ) : (
                  "AI 生成参考图"
                )}
              </button>
              {h.entries.length > 0 && (
                <button
                  onClick={h.handleVlmEvaluate}
                  disabled={h.vlmLoading}
                  className="px-3 py-1.5 text-xs border border-lavender/30 text-lavender rounded-lg hover:bg-lavender-soft dark:hover:bg-lavender/10 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {h.vlmLoading ? (
                    <>
                      <Spinner size="sm" />
                      评估中...
                    </>
                  ) : (
                    <>
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      VLM 视觉评分
                    </>
                  )}
                </button>
              )}
            </div>
            {h.aiError && (
              <p className="text-xs text-error w-full">{h.aiError}</p>
            )}

            <CharacterVLMPanel
              vlmScore={h.vlmScore}
              vlmLoading={h.vlmLoading}
              vlmError={h.vlmError}
              vlmRetrying={h.vlmRetrying}
              aiGenerating={h.aiGenerating}
              onEvaluate={h.handleVlmEvaluate}
              onRetry={h.handleVlmRetry}
            />
          </div>

          {/* 操作按钮 */}
          <div className="space-y-2 pt-2">
            {saveSuccess && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success/10 border border-success/20 text-success text-sm">
                <Check className="w-4 h-4 flex-shrink-0" />
                已保存成功
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={h.handleSubmit}
                disabled={!h.form.name.trim()}
                className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {h.isEdit ? "保存修改" : "创建角色"}
              </button>
              <button
                onClick={onClose}
                className="px-6 py-2 rounded-lg border hover:bg-accent transition-colors"
              >
                {saveSuccess ? "关闭" : "取消"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Image preview lightbox */}
      {h.previewIndex >= 0 && h.previewIndex < h.entries.length && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center"
          onClick={(e) => { e.stopPropagation(); h.setPreviewIndex(-1); }}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={h.entries[h.previewIndex].imageUrl}
              alt={`参考图 ${h.previewIndex + 1}`}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />

            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={() => h.setPreviewIndex((i) => Math.max(0, i - 1))}
                disabled={h.previewIndex === 0}
                className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 disabled:opacity-30 transition-colors"
                title="上一张"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-white/70 text-sm tabular-nums">
                {h.previewIndex + 1} / {h.entries.length}
              </span>

              <button
                onClick={() => h.setPreviewIndex((i) => Math.min(h.entries.length - 1, i + 1))}
                disabled={h.previewIndex === h.entries.length - 1}
                className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 disabled:opacity-30 transition-colors"
                title="下一张"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <div className="w-px h-5 bg-white/30" />

              <button
                onClick={() => h.downloadEntry(h.previewIndex)}
                className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors"
                title="下载图片"
              >
                <Download className="w-4 h-4" />
              </button>

              <button
                onClick={() => h.setPreviewIndex(-1)}
                className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors"
                title="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
