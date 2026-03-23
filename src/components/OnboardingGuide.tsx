"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";

const STORAGE_KEY = "comicpedia_onboarding_completed";
const onboardingListeners = new Set<() => void>();
let onboardingCompletedSnapshot = false;
let onboardingSnapshotLoaded = false;

function emitOnboardingCompleted(nextValue: boolean) {
  onboardingCompletedSnapshot = nextValue;
  onboardingSnapshotLoaded = true;

  try {
    if (nextValue) {
      localStorage.setItem(STORAGE_KEY, "true");
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (error) {
    console.warn("[OnboardingGuide] 保存引导状态失败:", error);
  }

  onboardingListeners.forEach((listener) => listener());
}

function getOnboardingCompletedSnapshot() {
  if (typeof window === "undefined") return false;
  if (!onboardingSnapshotLoaded) {
    onboardingCompletedSnapshot = localStorage.getItem(STORAGE_KEY) === "true";
    onboardingSnapshotLoaded = true;
  }
  return onboardingCompletedSnapshot;
}

function getOnboardingCompletedServerSnapshot() {
  return false;
}

function subscribeOnboardingCompleted(listener: () => void) {
  onboardingListeners.add(listener);

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    onboardingCompletedSnapshot = event.newValue === "true";
    onboardingSnapshotLoaded = true;
    onboardingListeners.forEach((currentListener) => currentListener());
  };

  window.addEventListener("storage", handleStorage);
  return () => {
    onboardingListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

interface OnboardingGuideProps {
  hasLLM: boolean;
  hasImage: boolean;
  isLoaded: boolean;
}

const STEPS = [
  {
    title: "配置 LLM API",
    desc: "用于生成分镜脚本（必须）",
    detail: "支持 DeepSeek、OpenAI、Claude 等 OpenAI 兼容接口",
    href: "/settings",
    requiredField: "llm" as const,
  },
  {
    title: "配置文生图 API",
    desc: "用于生成漫画图片（可选）",
    detail: "未配置时仅输出文字脚本和提示词",
    href: "/settings",
    requiredField: "image" as const,
  },
  {
    title: "选择模式，开始创作",
    desc: "百科 / 科普 / 诗词 / 小说 / 小红书",
    detail: "搜索 Wikipedia 词条或输入内容，AI 自动生成分镜脚本和漫画",
    href: null,
    requiredField: null,
  },
];

/**
 * 新手引导组件。
 * 首次访问且未配置 API 时展示 3 步引导流程。
 * 完成后记录到 localStorage 不再显示。
 */
export function OnboardingGuide({ hasLLM, hasImage, isLoaded }: OnboardingGuideProps) {
  const completed = useSyncExternalStore(
    subscribeOnboardingCompleted,
    getOnboardingCompletedSnapshot,
    getOnboardingCompletedServerSnapshot,
  );

  useEffect(() => {
    if (!isLoaded || !hasLLM || !hasImage || completed) return;
    emitOnboardingCompleted(true);
  }, [completed, hasImage, hasLLM, isLoaded]);

  const shouldShow = isLoaded && !completed && !hasLLM;

  if (!shouldShow) return null;

  const handleDismiss = () => {
    if (hasLLM) {
      emitOnboardingCompleted(true);
      return;
    }
  };

  const getStepStatus = (step: typeof STEPS[0]) => {
    if (step.requiredField === "llm") return hasLLM ? "completed" : "current";
    if (step.requiredField === "image") {
      if (!hasLLM) return "upcoming";
      return hasImage ? "completed" : "current";
    }
    return hasLLM ? "current" : "upcoming";
  };

  return (
    <div className="p-5 rounded-xl border bg-card space-y-4" role="region" aria-label="新手引导">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">开始使用 ComicPedia</h2>
        <button
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
          aria-label="关闭引导"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-3" role="list">
        {STEPS.map((step, index) => {
          const status = getStepStatus(step);
          return (
            <div
              key={index}
              role="listitem"
              className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                status === "current"
                  ? "bg-primary/5 border border-primary/20"
                  : status === "completed"
                  ? "opacity-60"
                  : "opacity-40"
              }`}
            >
              {/* 步骤编号/状态 */}
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  status === "completed"
                    ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                    : status === "current"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {status === "completed" ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>

              {/* 内容 */}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{step.title}</div>
                <div className="text-xs text-muted-foreground">{step.desc}</div>
                {status === "current" && (
                  <p className="text-xs text-muted-foreground mt-1">{step.detail}</p>
                )}
              </div>

              {/* 操作按钮 */}
              {status === "current" && step.href && (
                <Link
                  href={step.href}
                  className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity shrink-0 min-h-[32px] flex items-center"
                >
                  前往配置
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {/* Demo browsing hint — shown when no LLM configured */}
      {!hasLLM && (
        <div className="pt-2 border-t text-center">
          <p className="text-xs text-muted-foreground mb-2">
            还未配置 API？可以先浏览已有作品
          </p>
          <Link
            href="/gallery"
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-lg border hover:bg-accent transition-colors min-h-[32px]"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            浏览作品展示
          </Link>
        </div>
      )}
    </div>
  );
}
