"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  getStreamTextServerSnapshot,
  getStreamTextSnapshot,
  subscribeStreamText,
} from "@/lib/client/eventBus";

interface GeneratingAnimationProps {
  status: "scripting" | "generating" | "pending";
  progress: number;
  /** Task ID — used to subscribe to streamText channel */
  taskId: string;
  /** 总面板数（图片生成阶段） */
  totalPanels?: number;
  /** 已完成面板数（图片生成阶段） */
  completedPanels?: number;
  /** 质量档位 — fine 模式显示额外阶段 */
  qualityLevel?: "fast" | "standard" | "fine";
}

const statusMessages = {
  pending: ["准备中...", "初始化任务..."],
  scripting: [
    "AI 正在构思故事...",
    "设计分镜画面...",
    "编写对话内容...",
    "优化叙事结构...",
  ],
  generating: [
    "绘制漫画图片...",
    "AI 画师创作中...",
    "渲染精美画面...",
    "调整细节效果...",
  ],
};

const generationStartTimes = new Map<string, number>();

function subscribeHasStreamText(taskId: string, status: string, listener: () => void) {
  if (status !== "scripting") {
    return () => {};
  }

  return subscribeStreamText(taskId, () => listener());
}

function getHasStreamTextSnapshot(taskId: string, status: string) {
  return status === "scripting" && getStreamTextSnapshot(taskId).length > 0;
}

/** Subscribe to streamText with a single render on first token, then update DOM directly */
function useStreamText(taskId: string, status: string) {
  const textRef = useRef<HTMLPreElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasText = useSyncExternalStore(
    (listener) => subscribeHasStreamText(taskId, status, listener),
    () => getHasStreamTextSnapshot(taskId, status),
    () => false,
  );

  useEffect(() => {
    if (status !== "scripting") {
      if (textRef.current) {
        textRef.current.textContent = "";
      }
      return;
    }

    const applyText = (text: string) => {
      if (textRef.current) {
        textRef.current.textContent = text;
      }
      if (containerRef.current) {
        requestAnimationFrame(() => {
          if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
          }
        });
      }
    };

    applyText(getStreamTextSnapshot(taskId));
    return subscribeStreamText(taskId, applyText);
  }, [taskId, status]);

  return { textRef, containerRef, hasText };
}

/** 估算剩余时间（基于已完成面板的平均耗时） */
function useTimeEstimate(taskId: string, completedPanels: number, totalPanels: number) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (totalPanels <= 0 || completedPanels >= totalPanels) {
      generationStartTimes.delete(taskId);
      return;
    }

    if (completedPanels === 0) {
      if (!generationStartTimes.has(taskId)) {
        generationStartTimes.set(taskId, Date.now());
      }
      return;
    }

    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [completedPanels, taskId, totalPanels]);

  useEffect(() => {
    return () => {
      generationStartTimes.delete(taskId);
    };
  }, [taskId]);

  return useMemo(() => {
    if (totalPanels <= 0 || completedPanels >= totalPanels) {
      return null;
    }

    if (completedPanels === 0 || now === null) {
      return null;
    }

    const startTime = generationStartTimes.get(taskId);
    if (!startTime) return null;

    const elapsed = (now - startTime) / 1000;
    const avgPerPanel = elapsed / completedPanels;
    const remainingSec = Math.round(avgPerPanel * (totalPanels - completedPanels));

    if (remainingSec <= 0) return null;
    if (remainingSec < 60) return `约 ${remainingSec} 秒`;
    return `约 ${Math.ceil(remainingSec / 60)} 分钟`;
  }, [completedPanels, now, taskId, totalPanels]);
}

export function GeneratingAnimation({
  status,
  progress,
  taskId,
  totalPanels = 0,
  completedPanels = 0,
  qualityLevel = "standard",
}: GeneratingAnimationProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const messages = statusMessages[status] || statusMessages.pending;
  const timeEstimate = useTimeEstimate(taskId, completedPanels, totalPanels);
  const { textRef, containerRef, hasText } = useStreamText(taskId, status);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [messages.length]);

  const isGenerating = status === "generating";

  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-6">
      <div className="relative w-32 h-32">
        <div className="absolute inset-0 rounded-full border-4 border-muted" />
        <div
          className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin"
          style={{ animationDuration: "1.5s" }}
        />

        <div className="absolute inset-0 flex items-center justify-center">
          {status === "scripting" ? (
            <svg
              className="w-12 h-12 text-primary animate-pulse"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
          ) : (
            <svg
              className="w-12 h-12 text-primary animate-pulse"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          )}
        </div>

        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-primary-foreground text-sm font-medium">
          {progress}%
        </div>
      </div>

      <div className="text-center space-y-2">
        <p className="text-lg font-medium text-foreground animate-fade-in">
          {messages[messageIndex]}
        </p>
        <p className="text-sm text-muted-foreground">
          {status === "scripting"
            ? "正在生成分镜脚本"
            : isGenerating && totalPanels > 0
            ? `正在生成第 ${Math.min(completedPanels + 1, totalPanels)}/${totalPanels} 张图片`
            : "正在生成漫画图片"}
        </p>
      </div>

      <div className="flex items-center gap-2 text-xs flex-wrap justify-center">
        {qualityLevel !== "fast" && (
          <>
            <StepIndicator step={1} label="主题研究" active={status === "scripting" && progress < 10} done={progress >= 10} />
            <StepConnector done={progress >= 10} />
            <StepIndicator step={2} label="叙事大纲" active={status === "scripting" && progress >= 10 && progress < 15} done={progress >= 15} />
            <StepConnector done={progress >= 15} />
          </>
        )}
        <StepIndicator
          step={qualityLevel === "fast" ? 1 : 3}
          label="脚本生成"
          active={status === "scripting" && (qualityLevel === "fast" || progress >= 15)}
          done={status === "generating" || progress >= 30}
        />
        <StepConnector done={status === "generating"} />
        <StepIndicator
          step={qualityLevel === "fast" ? 2 : 4}
          label="图片生成"
          active={status === "generating"}
          done={completedPanels >= totalPanels && totalPanels > 0}
        />
        {qualityLevel === "fine" && (
          <>
            <StepConnector done={completedPanels >= totalPanels && totalPanels > 0} />
            <StepIndicator
              step={5}
              label="视觉评审"
              active={false}
              done={false}
            />
          </>
        )}
      </div>

      <div className="w-64 space-y-1">
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        {isGenerating && totalPanels > 0 && (
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{completedPanels}/{totalPanels} 张完成</span>
            {timeEstimate && <span>剩余 {timeEstimate}</span>}
          </div>
        )}
      </div>

      {!(isGenerating && totalPanels > 0) && (
        <p className="text-xs text-muted-foreground">
          预计需要 1-2 分钟，请耐心等待
        </p>
      )}

      {status === "scripting" && hasText && (
        <div
          ref={containerRef}
          className="w-full max-w-2xl max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/50 p-4 text-left"
        >
          <p className="text-xs text-muted-foreground mb-2 font-medium">
            脚本生成中...
          </p>
          <pre
            ref={textRef}
            className="text-sm text-foreground whitespace-pre-wrap break-words font-mono leading-relaxed"
          />
        </div>
      )}
    </div>
  );
}

function StepIndicator({ step, label, active, done }: { step: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
        done ? "bg-green-500 text-white" :
        active ? "bg-primary text-primary-foreground animate-pulse" :
        "bg-muted text-muted-foreground"
      }`}>
        {done ? (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : step}
      </div>
      <span className={`transition-colors ${
        done ? "text-green-600 dark:text-green-400" :
        active ? "text-foreground font-medium" :
        "text-muted-foreground"
      }`}>{label}</span>
    </div>
  );
}

function StepConnector({ done }: { done: boolean }) {
  return (
    <div className={`w-6 h-px transition-colors ${done ? "bg-green-500" : "bg-muted-foreground/30"}`} />
  );
}
