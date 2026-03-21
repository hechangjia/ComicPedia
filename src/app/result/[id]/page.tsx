"use client";

import { useState, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ComicStyle } from "@/lib/types";import { cancelGeneration } from "@/lib/client/generator";
import { downloadTextFile } from "@/lib/downloadUtils";
import { GeneratingAnimation } from "@/components/GeneratingAnimation";
import { TitleSkeleton, ComicGridSkeleton } from "@/components/Skeleton";
import { useTaskSubscription } from "@/hooks/useTaskSubscription";
import { useTaskActions } from "@/hooks/useTaskActions";
import { getStoredConfigs } from "@/hooks/useAPIConfig";
import { StyleSwitcher } from "@/components/result/StyleSwitcher";
import { ScriptReadyBar } from "@/components/result/ScriptReadyBar";
import { CompletedActions } from "@/components/result/CompletedActions";
import { PanelGrid } from "@/components/result/PanelGrid";
import { QualityScorePanel } from "@/components/result/QualityScorePanel";
import "@/app/result/print.css";

const ReferenceImagePanel = dynamic(() =>
  import("@/components/ReferenceImagePanel").then((m) => ({ default: m.ReferenceImagePanel }))
);
const DynamicPlayer = dynamic(() =>
  import("@/components/DynamicPlayer").then((m) => ({ default: m.DynamicPlayer }))
);

export default function ResultPage() {
  const params = useParams();
  const taskId = params.id as string;

  const { task, setTask, error } = useTaskSubscription(taskId);

  // --- Model selection ---
  const storedConfigs = useMemo(() => getStoredConfigs(), []);
  const [selectedImageId, setSelectedImageId] = useState(storedConfigs.activeImageId ?? "");
  const [selectedLLMId, setSelectedLLMId] = useState(storedConfigs.activeLLMId ?? "");
  const imageIdRef = useRef(selectedImageId);
  imageIdRef.current = selectedImageId;
  const llmIdRef = useRef(selectedLLMId);
  llmIdRef.current = selectedLLMId;

  const {
    handlePanelUpdate,
    handleRegenerate,
    handleCancel,
    handleVersionChange,
    handleGenerateAll,
    handleReferenceImageChange,
    handleReferenceImagesChange,
    handleControlModeChange,
    handleRegenerateRef,
    handleImg2Img,
    handleRefVersionChange,
    handleRefEntriesChange,
    handleRegenerateScript,
    handleChangeStyle,
    generatingAll,
    actionError,
    clearActionError,
  } = useTaskActions(taskId, setTask, imageIdRef, llmIdRef);

  const [viewMode, setViewMode] = useState<"edit" | "read" | "play">("edit");

  // 导出 Markdown
  const handleExportMarkdown = () => {
    if (!task?.script) return;
    const lines: string[] = [];

    lines.push(`# ${task.script.title}`);
    lines.push("");
    lines.push(`> 主题：${task.script.topic}`);
    lines.push(`> 风格：${task.script.style}`);
    lines.push(`> 生成时间：${new Date().toLocaleString("zh-CN")}`);
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("> **提示**：图片请配合 ZIP 打包下载使用，或使用「合成大图」功能导出。");
    lines.push("");

    task.script.panels.forEach((panel, index) => {
      lines.push(`## 第 ${index + 1} 格`);
      lines.push("");
      lines.push(`**场景描述：** ${panel.scene}`);
      lines.push("");
      lines.push(`**对话/旁白：** ${panel.dialogue}`);
      lines.push("");
      lines.push(`**图片提示词：**`);
      lines.push("```");
      lines.push(panel.imagePrompt);
      lines.push("```");
      lines.push("");
      if (panel.imageUrl && !panel.imageUrl.startsWith("data:")) {
        lines.push(`**图片：** ![第${index + 1}格](${panel.imageUrl})`);
        lines.push("");
      } else if (panel.imageUrl && !panel.imageUrl.startsWith("data:text/plain")) {
        lines.push(`**图片：** \`panel_${String(index + 1).padStart(2, "0")}.png\` (请使用 ZIP 打包下载)`);
        lines.push("");
      }
      lines.push("---");
      lines.push("");
    });

    const markdown = lines.join("\n");
    const filename = `${task.script.title || "comic"}_${new Date().toISOString().slice(0, 10)}.md`;
    downloadTextFile(markdown, filename, "text/markdown;charset=utf-8");
  };

  // ── 渲染：错误 ──
  if (error) {
    return (
      <div className="max-w-2xl mx-auto text-center space-y-4">
        <div className="p-6 rounded-xl border bg-red-50 dark:bg-red-900/20">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
        <Link
          href="/"
          className="inline-block px-6 py-2 rounded-lg bg-primary text-primary-foreground min-h-[44px]"
        >
          返回首页
        </Link>
      </div>
    );
  }

  // ── 渲染：加载中 ──
  if (!task) {
    return (
      <div className="max-w-4xl mx-auto space-y-8">
        <TitleSkeleton />
        <ComicGridSkeleton count={4} />
      </div>
    );
  }

  const isScripting = task.status === "scripting" || task.status === "pending";
  const isScriptReady = task.status === "script_ready";
  const isGenerating = task.status === "generating";
  const isCompleted = task.status === "completed";
  const showAnimation = isScripting || isGenerating;

  const totalPanels = task.script?.panels.length ?? 0;
  const completedPanels = task.script?.panels.filter(p => p.status === "completed").length ?? 0;
  const pendingPanels = totalPanels - completedPanels;

  // ── 渲染：主页面 ──
  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8 print-container">
      {/* 返回按钮 */}
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground no-print min-h-[44px]"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        返回
      </Link>

      {/* 标题 */}
      <div className="text-center space-y-2 print-title">
        <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
          {task.script?.title || "生成中..."}
        </h1>
        {task.script?.topic && (
          <p className="text-muted-foreground text-sm sm:text-base no-print">{task.script.topic}</p>
        )}

        {/* Topic research result */}
        {task.topicResearch && (
          <details className="text-left mx-auto max-w-lg no-print">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              AI Topic Research
            </summary>
            <div className="mt-2 p-3 rounded-lg bg-muted/50 text-xs space-y-2">
              <p className="text-foreground/80">{task.topicResearch.expandedDescription}</p>
              {task.topicResearch.keyFacts.length > 0 && (
                <ul className="list-disc pl-4 text-muted-foreground space-y-0.5">
                  {task.topicResearch.keyFacts.map((fact, i) => (
                    <li key={i}>{fact}</li>
                  ))}
                </ul>
              )}
              {task.topicResearch.narrativeAngle && (
                <p className="text-muted-foreground italic">
                  Narrative: {task.topicResearch.narrativeAngle}
                </p>
              )}
            </div>
          </details>
        )}

        {/* 阅读/编辑模式切换 */}
        {(isCompleted || isScriptReady) && task.script?.panels && (
          <div className="flex justify-center gap-1 p-1 rounded-lg bg-muted/50 w-fit mx-auto no-print">
            <button
              onClick={() => setViewMode("edit")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === "edit"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              编辑模式
            </button>
            <button
              onClick={() => setViewMode("read")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === "read"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              阅读模式
            </button>
            <button
              onClick={() => setViewMode("play")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === "play"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              播放模式
            </button>
          </div>
        )}
      </div>

      {/* 风格切换条 */}
      {(isScriptReady || isCompleted) && task.script && (
        <StyleSwitcher
          currentStyle={task.script.style}
          generatingAll={generatingAll}
          onChangeStyle={handleChangeStyle}
        />
      )}

      {/* 生成动画 */}
      {showAnimation && (
        <div className="no-print space-y-3">
          <GeneratingAnimation
            status={task.status as "scripting" | "generating" | "pending"}
            progress={task.progress}
            taskId={taskId}
            totalPanels={totalPanels}
            completedPanels={completedPanels}
          />
          {isGenerating && (
            <div className="flex justify-center">
              <button
                onClick={() => cancelGeneration(taskId, -1)}
                className="px-4 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2 min-h-[40px]"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                取消生成
              </button>
            </div>
          )}
        </div>
      )}

      {/* script_ready 状态提示 + 全部生成按钮 */}
      {isScriptReady && task.script && (
        <ScriptReadyBar
          completedPanels={completedPanels}
          totalPanels={totalPanels}
          pendingPanels={pendingPanels}
          generatingAll={generatingAll}
          llmConfigs={storedConfigs.llmConfigs}
          imageConfigs={storedConfigs.imageConfigs}
          activeLLMId={storedConfigs.activeLLMId ?? ""}
          activeImageId={storedConfigs.activeImageId ?? ""}
          selectedLLMId={selectedLLMId}
          selectedImageId={selectedImageId}
          onSelectedLLMIdChange={setSelectedLLMId}
          onSelectedImageIdChange={setSelectedImageId}
          onRegenerateScript={handleRegenerateScript}
          onGenerateAll={handleGenerateAll}
        />
      )}

      {/* 参考图设置 */}
      {(isScriptReady || isCompleted) && task.script && (
        <ReferenceImagePanel
          referenceImage={task.script.referenceImage}
          referenceImages={task.script.referenceImages}
          controlMode={task.script.controlMode}
          onImageChange={handleReferenceImageChange}
          onImagesChange={handleReferenceImagesChange}
          onControlModeChange={handleControlModeChange}
          title={task.script.title}
          referenceEntries={task.script.referenceEntries}
          onEntriesChange={handleRefEntriesChange}
          onRegenerateRef={handleRegenerateRef}
          onImg2Img={handleImg2Img}
          onRefVersionChange={handleRefVersionChange}
        />
      )}

      {/* 错误状态 */}
      {task.status === "failed" && (
        <div className="p-4 rounded-xl border bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 no-print">
          生成失败：{task.error || "未知错误"}
        </div>
      )}

      {/* 操作错误提示（瞬态） */}
      {actionError && (
        <div className="p-3 rounded-xl border bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-sm flex items-center justify-between no-print">
          <span>{actionError}</span>
          <button
            onClick={clearActionError}
            className="ml-2 p-1 rounded hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* 漫画面板 */}
      {task.script?.panels && viewMode === "play" ? (
        <DynamicPlayer panels={task.script.panels} title={task.script.title} />
      ) : task.script?.panels && (
        <PanelGrid
          panels={task.script.panels}
          title={task.script.title}
          taskId={taskId}
          taskStatus={task.status}
          viewMode={viewMode === "read" ? "read" : "edit"}
          onPanelUpdate={handlePanelUpdate}
          onRegenerate={handleRegenerate}
          onCancel={handleCancel}
          onVersionChange={handleVersionChange}
        />
      )}

      {/* AI 质量评分 */}
      {isCompleted && task.script && (
        <QualityScorePanel script={task.script} />
      )}

      {/* 操作按钮 */}
      {isCompleted && task.script && (
        <CompletedActions
          script={task.script}
          imageConfigs={storedConfigs.imageConfigs}
          activeImageId={storedConfigs.activeImageId ?? ""}
          selectedImageId={selectedImageId}
          onSelectedImageIdChange={setSelectedImageId}
          onExportMarkdown={handleExportMarkdown}
        />
      )}
    </div>
  );
}
