"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useConfigCheck } from "@/hooks/useAPIConfig";
import { OnboardingGuide } from "@/components/OnboardingGuide";
import { ScienceForm } from "@/components/ScienceForm";
import { TemplatePanel } from "@/components/TemplatePanel";
import { Spinner } from "@/components/ui/Spinner";
import type { ContentType } from "@/lib/types";
import type { ComicTemplate } from "@/lib/config/templates";

// 非默认 Tab 懒加载，减少首屏 JS 体积
const PoetryForm = dynamic(() => import("@/components/PoetryForm").then((m) => ({ default: m.PoetryForm })), {
  loading: () => <div className="flex justify-center py-12"><Spinner size="lg" /></div>,
});
const NovelForm = dynamic(() => import("@/components/NovelForm").then((m) => ({ default: m.NovelForm })), {
  loading: () => <div className="flex justify-center py-12"><Spinner size="lg" /></div>,
});
const XhsForm = dynamic(() => import("@/components/XhsForm").then((m) => ({ default: m.XhsForm })), {
  loading: () => <div className="flex justify-center py-12"><Spinner size="lg" /></div>,
});
const WikipediaForm = dynamic(() => import("@/components/WikipediaForm").then((m) => ({ default: m.WikipediaForm })), {
  loading: () => <div className="flex justify-center py-12"><Spinner size="lg" /></div>,
});

export type TabMode = "science" | "poetry" | "xiaohongshu" | "novel" | "wikipedia";

const TABS: { value: TabMode; label: string; icon: string; gradient: string; desc: string }[] = [
  { value: "wikipedia", label: "百科漫画", icon: "\uD83C\uDF10", gradient: "from-blue-600 to-indigo-600", desc: "从 Wikipedia 优质内容生成科普漫画" },
  { value: "science", label: "科普漫画", icon: "\uD83D\uDD2C", gradient: "from-purple-600 to-pink-600", desc: "输入科普主题，AI 自动生成精美漫画" },
  { value: "poetry", label: "诗词漫画", icon: "\uD83D\uDCDC", gradient: "from-emerald-600 to-cyan-600", desc: "将古诗词、现代诗歌转化为精美漫画" },
  { value: "novel", label: "小说漫画", icon: "\uD83D\uDCD6", gradient: "from-amber-600 to-orange-600", desc: "将经典小说片段转化为分镜漫画" },
  { value: "xiaohongshu", label: "小红书图文", icon: "\uD83D\uDCF1", gradient: "from-rose-500 to-orange-500", desc: "输入内容，AI 生成小红书风格图文" },
];

function contentTypeToTab(ct: ContentType): TabMode {
  if (ct === "novel") return "novel";
  if (ct === "wikipedia") return "wikipedia";
  return ct as TabMode;
}

interface FormLayoutProps {
  defaultTab?: TabMode;
}

export function FormLayout({ defaultTab = "wikipedia" }: FormLayoutProps) {
  const searchParams = useSearchParams();
  const configStatus = useConfigCheck();

  const modeParam = searchParams.get("mode") as TabMode | null;
  const [activeTab, setActiveTab] = useState<TabMode>(
    modeParam && TABS.some((t) => t.value === modeParam) ? modeParam : defaultTab
  );

  const [templateTopic, setTemplateTopic] = useState("");
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (modeParam && TABS.some((t) => t.value === modeParam)) {
      setActiveTab(modeParam);
    }
  }, [modeParam]);

  const handleTemplateSelect = useCallback((tpl: ComicTemplate) => {
    setActiveTab(contentTypeToTab(tpl.contentType));
    setTemplateTopic(tpl.topic);
    setFormKey((k) => k + 1);
  }, []);

  const currentTab = TABS.find((t) => t.value === activeTab)!;

  return (
    <div className="relative max-w-2xl mx-auto space-y-8">
      {/* 背景装饰 — 渐变光晕 */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-[-40%] left-[-20%] w-[500px] h-[500px] rounded-full bg-purple-500/10 dark:bg-purple-500/5 blur-3xl" />
        <div className="absolute bottom-[-20%] right-[-15%] w-[400px] h-[400px] rounded-full bg-pink-500/8 dark:bg-pink-500/3 blur-3xl" />
      </div>

      <OnboardingGuide
        hasLLM={configStatus.hasLLM}
        hasImage={configStatus.hasImage}
        isLoaded={configStatus.isLoaded}
      />

      {/* Hero 标题 */}
      <div className="text-center space-y-3 pt-2">
        <h1
          className={`text-4xl sm:text-5xl font-bold bg-gradient-to-r ${currentTab.gradient} bg-clip-text text-transparent animate-gradient-x`}
        >
          ComicPedia
        </h1>
        <p className="text-lg text-muted-foreground max-w-md mx-auto">{currentTab.desc}</p>
      </div>

      {/* Tab 切换 */}
      <div className="flex justify-center gap-1 p-1.5 rounded-xl bg-muted/50 backdrop-blur-sm flex-wrap">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
              activeTab === tab.value
                ? "bg-background shadow-md text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            }`}
          >
            <span className="text-base">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* 模板选择 */}
      <TemplatePanel
        contentType={activeTab as ContentType}
        onSelect={handleTemplateSelect}
      />

      {/* 表单区域 */}
      {activeTab === "wikipedia" && <WikipediaForm key={`wiki-${formKey}`} />}
      {activeTab === "science" && <ScienceForm key={`science-${formKey}`} initialTopic={templateTopic} />}
      {activeTab === "poetry" && <PoetryForm key={`poetry-${formKey}`} initialContent={templateTopic} />}
      {activeTab === "novel" && <NovelForm key={`novel-${formKey}`} initialContent={templateTopic} />}
      {activeTab === "xiaohongshu" && <XhsForm key={`xhs-${formKey}`} initialTopic={templateTopic} />}
    </div>
  );
}
