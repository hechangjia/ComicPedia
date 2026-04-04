"use client";

import { useState, useCallback, useEffect } from "react";
import { NovelGenre, PoetryGenre } from "@/lib/types";
import { useContentForm } from "@/hooks/useContentForm";
import { StyleSelector } from "./StyleSelector";
import { PanelCountSelector } from "./PanelCountSelector";
import { ReferenceImagePanel } from "./ReferenceImagePanel";
import { ModelSelector } from "./ModelSelector";
import { CharacterPicker } from "./CharacterPicker";
import { ErrorAlert } from "./ErrorAlert";
import { Spinner } from "./ui/Spinner";
import { QualitySelector } from "./QualitySelector";

const GENRES: { value: NovelGenre; label: string; desc: string }[] = [
  { value: "wuxia", label: "武侠", desc: "刀光剑影，江湖恩怨" },
  { value: "xianxia", label: "仙侠", desc: "修真飞仙，天道轮回" },
  { value: "historical", label: "历史", desc: "朝代更迭，人物命运" },
  { value: "romance", label: "言情", desc: "情感纠葛，细腻心理" },
  { value: "scifi", label: "科幻", desc: "未来世界，科技想象" },
  { value: "mystery", label: "悬疑", desc: "层层迷雾，真相大白" },
  { value: "classic", label: "经典名著", desc: "文学巨作，经典场景" },
  { value: "fantasy", label: "奇幻", desc: "魔法世界，史诗冒险" },
];

const EXAMPLE_NOVELS = [
  {
    text: "林黛玉手把花锄，从芳径一直到沁芳桥那边去。忽听山坡上也传来悲声，一看不是别人，却是宝玉。……黛玉听了，不觉点头叹息，想起一首《葬花吟》来。",
    genre: "classic" as NovelGenre,
    name: "红楼梦·黛玉葬花",
    author: "曹雪芹",
    era: "清代",
  },
  {
    text: "萧峰仰天长笑，声若惊雷，震得大厅中人人耳鼓嗡嗡作响。他左手一挥，一掌击出，正是降龙十八掌中的亢龙有悔。",
    genre: "wuxia" as NovelGenre,
    name: "天龙八部·萧峰聚贤庄",
    author: "金庸",
    era: "宋代",
  },
  {
    text: "孙悟空把金箍棒往耳朵里一放，摇身变作一个小虫儿，嗡的一声飞进铁扇公主的肚子里去了。",
    genre: "classic" as NovelGenre,
    name: "西游记·三借芭蕉扇",
    author: "吴承恩",
    era: "明代（故事背景：唐代）",
  },
  {
    text: "面壁十年图破壁，难酬蹈海亦英雄。罗辑抬头凝望星空，人类的命运就在那片深邃的黑暗之中。",
    genre: "scifi" as NovelGenre,
    name: "三体·面壁者",
    author: "刘慈欣",
    era: "当代/近未来",
  },
];

export function NovelForm({ initialContent = "" }: { initialContent?: string }) {
  // 小说特有状态
  const [content, setContent] = useState(initialContent);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [era, setEra] = useState("");
  const [genre, setGenre] = useState<NovelGenre>("classic");

  const form = useContentForm(
    {
      contentType: "novel",
      defaultStyle: "manga",
      maxPanelCount: 30,
      emptyInputMessage: "请先输入小说片段，再生成参考图",
    },
    useCallback(() => content, [content]),
  );
  const getDraftInputText = form.getDraftInputText;

  // 恢复草稿文本
  useEffect(() => {
    if (initialContent) return;
    const draft = getDraftInputText();
    if (!draft) return;
    const timer = setTimeout(() => {
      setContent(draft);
    }, 0);
    return () => clearTimeout(timer);
  }, [getDraftInputText, initialContent]);

  const handleGenerate = () => form.handleSubmit(content, {
    novelMeta: {
      title: title || undefined,
      author: author || undefined,
      era: era || undefined,
      genre,
    },
  });

  const handleExampleClick = (example: typeof EXAMPLE_NOVELS[0]) => {
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
              placeholder="如：红楼梦"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={form.isLoading}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">作者（可选）</label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="如：曹雪芹"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={form.isLoading}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">故事背景时代（可选）</label>
            <input
              type="text"
              value={era}
              onChange={(e) => setEra(e.target.value)}
              placeholder="如：清代、宋代、近未来"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={form.isLoading}
            />
          </div>
        </div>

        <p className="text-xs text-warning bg-warning/5 p-2 rounded">
          提示：填写作品信息可帮助 AI 更准确地还原人物形象和时代背景
        </p>

        {/* 小说片段输入 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">小说片段</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={"粘贴小说中的精彩片段...\n\nAI 会自动提取关键场景、设计角色形象、生成分镜漫画"}
            className="w-full min-h-[160px] p-3 rounded-lg border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={form.isLoading}
          />
        </div>

        {/* 体裁选择 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">小说体裁</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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

        <StyleSelector value={form.style} onChange={form.setStyle} disabled={form.isLoading} recommendFor={"novel" as PoetryGenre} />

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
          className="w-full py-3 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 text-white font-medium hover:from-amber-700 hover:to-orange-700 hover:shadow-lg hover:shadow-amber-500/25 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        >
          {form.isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner />
              生成中...
            </span>
          ) : (
            "生成小说场景漫画"
          )}
        </button>
      </div>

      {/* 示例小说 */}
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground text-center">试试这些经典片段：</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {EXAMPLE_NOVELS.map((example) => (
            <button
              key={example.name}
              onClick={() => handleExampleClick(example)}
              className="p-3 text-left rounded-lg border hover:bg-accent transition-colors"
            >
              <div className="font-medium text-sm flex items-center gap-2">
                {example.name}
                <span className="text-xs text-muted-foreground">
                  {example.author}
                </span>
              </div>
              <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                {example.text}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
