"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import { useConfigCheck } from "@/hooks/useAPIConfig";
import { OnboardingGuide } from "@/components/OnboardingGuide";
import { ScienceForm } from "@/components/ScienceForm";
import { TemplatePanel } from "@/components/TemplatePanel";
import { InspirationSquare } from "@/components/InspirationSquare";
import { Spinner } from "@/components/ui/Spinner";
import type { ContentType, BuiltinContentType } from "@/lib/types";
import type { ComicTemplate } from "@/lib/config/templates";
import { getSeries } from "@/lib/client/db";
import { getSeriesContinuationContext, type Series } from "@/lib/series";
import { STYLE_META } from "@/lib/config/styles";
import { Layers, Globe, FlaskConical, ScrollText, BookOpen, Smartphone, type LucideIcon } from "lucide-react";


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

const TABS: { value: TabMode; label: string; icon: LucideIcon; desc: string }[] = [
  { value: "wikipedia", label: "百科漫画", icon: Globe, desc: "从 Wikipedia 优质内容生成科普漫画" },
  { value: "science", label: "科普漫画", icon: FlaskConical, desc: "输入科普主题，AI 自动生成精美漫画" },
  { value: "poetry", label: "诗词漫画", icon: ScrollText, desc: "将古诗词、现代诗歌转化为精美漫画" },
  { value: "novel", label: "小说漫画", icon: BookOpen, desc: "将经典小说片段转化为分镜漫画" },
  { value: "xiaohongshu", label: "小红书图文", icon: Smartphone, desc: "输入内容，AI 生成小红书风格图文" },
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
  const router = useRouter();
  const configStatus = useConfigCheck();

  const modeParam = searchParams.get("mode") as TabMode | null;
  const seriesParam = searchParams.get("series");
  const requestedTab = modeParam && TABS.some((t) => t.value === modeParam) ? modeParam : null;
  const [selectedTab, setSelectedTab] = useState<TabMode>(requestedTab ?? defaultTab);
  const activeTab = requestedTab ?? selectedTab;
  const selectTab = useCallback((tab: TabMode) => {
    setSelectedTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", tab);
    router.replace(`/create?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const [templateTopic, setTemplateTopic] = useState("");
  const [formKey, setFormKey] = useState(0);
  const [seriesContext, setSeriesContext] = useState<string | null>(null);
  const [seriesInfo, setSeriesInfo] = useState<Series | null>(null);

  // 连载上下文注入
  useEffect(() => {
    if (!seriesParam) return;
    getSeries(seriesParam).then((series) => {
      if (!series) return;
      setSeriesInfo(series);
      const context = getSeriesContinuationContext(series);
      setSeriesContext(context);
      // 将连载上下文作为 topic 前缀注入
      setTemplateTopic(`[连载续写：${series.title} 第 ${series.episodes.length + 1} 集]\n${context}`);
      setFormKey((k) => k + 1);
    }).catch(console.error);
  }, [seriesParam]);

  const handleTemplateSelect = useCallback((tpl: ComicTemplate) => {
    selectTab(contentTypeToTab(tpl.contentType));
    setTemplateTopic(tpl.topic);
    setFormKey((k) => k + 1);
  }, [selectTab]);

  const handleInspirationSelect = useCallback((topic: string) => {
    setTemplateTopic(topic);
    setFormKey((k) => k + 1);
  }, []);

  const currentTab = TABS.find((t) => t.value === activeTab)!;

  return (
    <div className="relative max-w-2xl mx-auto space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">开始创作</h1>
        <p className="max-w-2xl text-base leading-relaxed text-foreground/80">从内容到分镜，再到画面与导出。先选内容类型，准备好后检查本次生成设置。</p>
        <ol aria-label="创作流程" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-foreground/80">
          <li aria-current="step" className="font-semibold text-foreground">1. 准备内容</li>
          <li>2. 生成与审核分镜</li><li>3. 生成与复审画面</li><li>4. 整理与导出</li>
        </ol>
      </header>
      <nav aria-label="内容类型" className="flex flex-wrap gap-2 border-b pb-4">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return <button key={tab.value} type="button" onClick={() => selectTab(tab.value)} aria-pressed={activeTab === tab.value}
            className={`min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${activeTab === tab.value ? "bg-foreground text-background" : "text-foreground/80 hover:bg-muted"}`}>
            <Icon aria-hidden="true" className="w-4 h-4" />{tab.label}
          </button>;
        })}
      </nav>
      <p className="text-sm text-foreground/80">{currentTab.desc}</p>
      {!configStatus.hasLLM && configStatus.isLoaded && <details className="border-b pb-4">
        <summary className="cursor-pointer min-h-[44px] py-3 text-sm font-medium">首次使用？查看模型配置指引</summary>
        <OnboardingGuide hasLLM={configStatus.hasLLM} hasImage={configStatus.hasImage} isLoaded={configStatus.isLoaded} />
      </details>}
      <details className="border-b pb-4">
        <summary className="cursor-pointer min-h-[44px] py-3 text-sm font-medium">需要灵感？从模板或推荐主题开始</summary>
        <div className="space-y-5 pt-3">
          <TemplatePanel contentType={activeTab as ContentType} onSelect={handleTemplateSelect} />
          <InspirationSquare contentType={activeTab as BuiltinContentType} onSelect={handleInspirationSelect} />
        </div>
      </details>

      {/* 连载上下文提示 */}
      {seriesInfo && (
        <div className="p-3 rounded-lg border bg-info/10 border-info/20">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-info shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-info">
                续写连载：{seriesInfo.title} · 第 {seriesInfo.episodes.length + 1} 集
              </p>
              <p className="text-xs text-info mt-0.5">
                已有 {seriesInfo.episodes.length} 集 · {STYLE_META[seriesInfo.style]?.label} 风格
                {seriesInfo.characterDescription && " · 角色已继承"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 表单区域 */}
      {activeTab === "wikipedia" && <WikipediaForm key={`wiki-${formKey}`} initialTopic={templateTopic} />}
      {activeTab === "science" && <ScienceForm key={`science-${formKey}`} initialTopic={templateTopic} />}
      {activeTab === "poetry" && <PoetryForm key={`poetry-${formKey}`} initialContent={templateTopic} />}
      {activeTab === "novel" && <NovelForm key={`novel-${formKey}`} initialContent={templateTopic} />}
      {activeTab === "xiaohongshu" && <XhsForm key={`xhs-${formKey}`} initialTopic={templateTopic} />}
    </div>
  );
}
