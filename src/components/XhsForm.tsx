"use client";

import { useState, useCallback, useEffect } from "react";
import { useContentForm } from "@/hooks/useContentForm";
import { StyleSelector } from "./StyleSelector";
import { PanelCountSelector } from "./PanelCountSelector";
import { ReferenceImagePanel } from "./ReferenceImagePanel";
import { ModelSelector } from "./ModelSelector";
import { CharacterPicker } from "./CharacterPicker";
import { ErrorAlert } from "./ErrorAlert";
import { Spinner } from "./ui/Spinner";
import { QualitySelector } from "./QualitySelector";

const EXAMPLE_TOPICS = [
  "5个提升效率的Mac快捷键",
  "新手露营必备装备清单",
  "一周减脂餐食谱分享",
  "独居女生安全指南",
];

export function XhsForm({ initialTopic = "" }: { initialTopic?: string }) {
  const [topic, setTopic] = useState(initialTopic);

  const form = useContentForm(
    {
      contentType: "xiaohongshu",
      defaultStyle: "infographic",
      maxPanelCount: 20,
      emptyInputMessage: "请先输入内容，再生成参考图",
    },
    useCallback(() => topic, [topic]),
  );

  // 恢复草稿文本
  useEffect(() => {
    if (!initialTopic) {
      const draft = form.getDraftInputText();
      if (draft) setTopic(draft);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerate = () => form.handleSubmit(topic);

  return (
    <div className="space-y-6">
      <div className="space-y-6 p-6 rounded-xl border bg-card shadow-sm hover:shadow-md transition-shadow">
        {/* 内容输入 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">创作内容</label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={"输入你想分享的内容，可以是：\n• 干货知识、经验分享\n• 种草安利、测评对比\n• 教程步骤、避坑指南\n• 清单合集、个人故事"}
            className="w-full min-h-[120px] p-3 rounded-lg border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={form.isLoading}
          />
        </div>

        <ModelSelector type="llm" value={form.selectedLLMId} onChange={form.setSelectedLLMId} disabled={form.isLoading} />
        <ModelSelector type="image" value={form.selectedImageId} onChange={form.setSelectedImageId} disabled={form.isLoading} />

        <StyleSelector value={form.style} onChange={form.setStyle} disabled={form.isLoading} />

        <PanelCountSelector
          panelCount={form.panelCount}
          customPanelCount={form.customPanelCount}
          onPanelCountChange={form.setPanelCount}
          onCustomPanelCountChange={form.setCustomPanelCount}
          disabled={form.isLoading}
          max={20}
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

        <ErrorAlert message={form.error} onClose={() => form.setError("")} />

        <button
          onClick={handleGenerate}
          disabled={form.isLoading || !topic.trim()}
          className="w-full py-3 rounded-lg bg-gradient-to-r from-rose-500 to-orange-500 text-white font-medium hover:from-rose-600 hover:to-orange-600 hover:shadow-lg hover:shadow-rose-500/25 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        >
          {form.isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner />
              生成中...
            </span>
          ) : (
            "生成小红书图文"
          )}
        </button>
      </div>

      {/* 示例内容 */}
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground text-center">试试这些内容：</p>
        <div className="flex flex-wrap justify-center gap-2">
          {EXAMPLE_TOPICS.map((example) => (
            <button
              key={example}
              onClick={() => setTopic(example)}
              className="px-3 py-1.5 text-sm rounded-full border hover:bg-primary/5 hover:border-primary/30 hover:-translate-y-0.5 transition-all duration-200"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
