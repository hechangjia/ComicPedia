"use client";

import { useState, useCallback } from "react";
import { PoetryGenre } from "@/lib/types";
import { useContentForm } from "@/hooks/useContentForm";
import { StyleSelector } from "./StyleSelector";
import { PanelCountSelector } from "./PanelCountSelector";
import { ReferenceImagePanel } from "./ReferenceImagePanel";
import { ModelSelector } from "./ModelSelector";
import { CharacterPicker } from "./CharacterPicker";
import { ErrorAlert } from "./ErrorAlert";
import { Spinner } from "./ui/Spinner";
import { QualitySelector } from "./QualitySelector";

const GENRES: { value: PoetryGenre; label: string; desc: string }[] = [
  { value: "shi", label: "唐诗/古诗", desc: "意境深远，起承转合" },
  { value: "ci", label: "宋词", desc: "婉约豪放，情感细腻" },
  { value: "qu", label: "元曲", desc: "生动活泼，戏剧性强" },
  { value: "modern", label: "现代诗", desc: "意象自由，情感直接" },
  { value: "novel", label: "小说片段", desc: "叙事性强，人物鲜明" },
];

const ERA_OPTIONS = [
  { value: "", label: "自动识别" },
  { value: "先秦", label: "先秦" },
  { value: "汉代", label: "汉代" },
  { value: "魏晋南北朝", label: "魏晋" },
  { value: "唐代", label: "唐代" },
  { value: "宋代", label: "宋代" },
  { value: "元代", label: "元代" },
  { value: "明代", label: "明代" },
  { value: "清代", label: "清代" },
  { value: "近现代（1840-1949）", label: "近现代" },
  { value: "当代（1949至今）", label: "当代" },
];

const EXAMPLE_POEMS = [
  { text: "独立寒秋，湘江北去，橘子洲头。看万山红遍，层林尽染；漫江碧透，百舸争流。鹰击长空，鱼翔浅底，万类霜天竞自由。怅寥廓，问苍茫大地，谁主沉浮？", genre: "ci" as PoetryGenre, name: "沁园春·长沙", author: "毛泽东", era: "近现代（1840-1949）" },
  { text: "床前明月光，疑是地上霜。举头望明月，低头思故乡。", genre: "shi" as PoetryGenre, name: "静夜思", author: "李白", era: "唐代" },
  { text: "大江东去，浪淘尽，千古风流人物。", genre: "ci" as PoetryGenre, name: "念奴娇·赤壁怀古", author: "苏轼", era: "宋代" },
  { text: "枯藤老树昏鸦，小桥流水人家，古道西风瘦马。夕阳西下，断肠人在天涯。", genre: "qu" as PoetryGenre, name: "天净沙·秋思", author: "马致远", era: "元代" },
  { text: "黑夜给了我黑色的眼睛，我却用它寻找光明。", genre: "modern" as PoetryGenre, name: "一代人", author: "顾城", era: "当代（1949至今）" },
];

export function PoetryForm({ initialContent = "" }: { initialContent?: string }) {
  // 诗词特有状态
  const [content, setContent] = useState(initialContent);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [era, setEra] = useState("");
  const [genre, setGenre] = useState<PoetryGenre>("shi");

  const form = useContentForm(
    {
      contentType: "poetry",
      defaultStyle: "inkwash",
      maxPanelCount: 30,
      emptyInputMessage: "请输入诗词内容",
    },
    useCallback(() => content, [content]),
  );

  const handleGenerate = () => form.handleSubmit(content, {
    poetryGenre: genre,
    poetryMeta: {
      title: title || undefined,
      author: author || undefined,
      era: era || undefined,
    },
  });

  const handleExampleClick = (example: typeof EXAMPLE_POEMS[0]) => {
    setContent(example.text);
    setGenre(example.genre);
    setTitle(example.name);
    setAuthor(example.author);
    setEra(example.era);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-6 p-6 rounded-xl border bg-card shadow-sm hover:shadow-md transition-shadow">
        {/* 作品信息行 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">作品名（可选）</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="如：沁园春·长沙"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={form.isLoading}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">作者（重要）</label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="如：毛泽东"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={form.isLoading}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">时代（重要）</label>
            <select
              value={era}
              onChange={(e) => setEra(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={form.isLoading}
            >
              {ERA_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
          提示：填写作者和时代可确保人物服饰、发型符合历史背景（如近现代人物穿中山装而非古装）
        </p>

        {/* 诗词内容 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">诗词内容</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="输入完整诗词或小说片段..."
            className="w-full min-h-[120px] p-3 rounded-lg border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary font-serif"
            disabled={form.isLoading}
          />
        </div>

        {/* 体裁选择 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">体裁类型</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {GENRES.map((g) => (
              <button
                key={g.value}
                onClick={() => setGenre(g.value)}
                disabled={form.isLoading}
                className={`p-3 rounded-lg border text-left transition-all ${
                  genre === g.value
                    ? "border-primary bg-primary/10 ring-2 ring-primary"
                    : "hover:border-primary/50"
                }`}
              >
                <div className="font-medium text-sm">{g.label}</div>
                <div className="text-xs text-muted-foreground">{g.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <ModelSelector type="llm" value={form.selectedLLMId} onChange={form.setSelectedLLMId} disabled={form.isLoading} />
        <ModelSelector type="image" value={form.selectedImageId} onChange={form.setSelectedImageId} disabled={form.isLoading} />

        <StyleSelector value={form.style} onChange={form.setStyle} disabled={form.isLoading} recommendFor={genre} />

        <PanelCountSelector
          panelCount={form.panelCount}
          customPanelCount={form.customPanelCount}
          onPanelCountChange={form.setPanelCount}
          onCustomPanelCountChange={form.setCustomPanelCount}
          disabled={form.isLoading}
          max={30}
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
          title={content}
          referenceEntries={form.referenceEntries}
          onEntriesChange={form.setReferenceEntries}
          genMode={form.genMode}
          onGenModeChange={form.setGenMode}
        />

        <ErrorAlert message={form.error} onClose={() => form.setError("")} />

        <button
          onClick={handleGenerate}
          disabled={form.isLoading || !content.trim()}
          className="w-full py-3 rounded-lg bg-gradient-to-r from-emerald-600 to-cyan-600 text-white font-medium hover:from-emerald-700 hover:to-cyan-700 hover:shadow-lg hover:shadow-emerald-500/25 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        >
          {form.isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner />
              生成中...
            </span>
          ) : (
            "生成诗词漫画"
          )}
        </button>
      </div>

      {/* 示例诗词 */}
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground text-center">试试这些经典诗词：</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {EXAMPLE_POEMS.map((example) => (
            <button
              key={example.name}
              onClick={() => handleExampleClick(example)}
              className="p-3 text-left rounded-lg border hover:bg-accent transition-colors"
            >
              <div className="font-medium text-sm flex items-center gap-2">
                {example.name}
                <span className="text-xs text-muted-foreground">
                  {example.author} · {example.era.replace(/（.*）/, "")}
                </span>
              </div>
              <div className="text-xs text-muted-foreground line-clamp-2 font-serif mt-1">
                {example.text}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
