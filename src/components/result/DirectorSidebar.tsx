// src/components/result/DirectorSidebar.tsx

"use client";

import { useState, useCallback } from "react";
import type { GenerateTask } from "@/lib/types";
import { generateReport, generateRhythmVisualization, type DirectorAnalysisReport } from "@/lib/directorAgent";
import { RhythmVisualizer } from "@/components/director/RhythmVisualizer";

interface DirectorSidebarProps {
  task: GenerateTask;
}

const SEVERITY_COLORS = {
  critical: "bg-red-100 text-red-800 border-red-200",
  warning: "bg-amber-100 text-amber-800 border-amber-200",
  info: "bg-blue-100 text-blue-800 border-blue-200",
};

const SEVERITY_ICONS = {
  critical: "🔴",
  warning: "🟡",
  info: "🔵",
};

export function DirectorSidebar({ task }: DirectorSidebarProps) {
  const [report, setReport] = useState<DirectorAnalysisReport | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showRhythmVisualizer, setShowRhythmVisualizer] = useState(false);

  const handleAnalyze = useCallback(async () => {
    if (!task.script) return;

    setIsAnalyzing(true);
    try {
      const result = await generateReport(task.script, task);
      setReport(result);
    } catch (error) {
      console.error("Director analysis failed:", error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [task]);

  const handleReset = useCallback(() => {
    setReport(null);
    setShowRhythmVisualizer(false);
  }, []);

  if (!task.script) {
    return (
      <div className="p-4 border rounded-lg bg-gray-50">
        <p className="text-gray-500 text-sm">脚本未就绪，无法分析</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">🎬 AI 导演助手</h3>
      </div>

      {/* 控制按钮 */}
      <div className="flex gap-2">
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isAnalyzing ? "分析中..." : "分析脚本"}
        </button>
        {report && (
          <button
            onClick={handleReset}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            重置
          </button>
        )}
      </div>

      {/* 分析结果 */}
      {report && (
        <div className="space-y-4">
          {/* 总体评分 */}
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-indigo-600">
              {report.overallScore}
              <span className="text-sm text-gray-500 font-normal">/100</span>
            </div>
            <div className="text-sm text-gray-600">总体评分</div>
          </div>

          {/* 叙事建议 */}
          {report.narrativeSuggestions.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium text-gray-700">
                📖 叙事建议 ({report.narrativeSuggestions.length})
              </h4>
              <div className="space-y-2">
                {report.narrativeSuggestions.slice(0, 5).map((suggestion) => (
                  <div
                    key={suggestion.id}
                    className={`p-3 rounded-lg border text-sm ${SEVERITY_COLORS[suggestion.severity]}`}
                  >
                    <div className="flex items-start gap-2">
                      <span>{SEVERITY_ICONS[suggestion.severity]}</span>
                      <div>
                        {suggestion.panelIndex !== undefined && (
                          <span className="font-medium">第 {suggestion.panelIndex + 1} 格：</span>
                        )}
                        <span>{suggestion.title}</span>
                      </div>
                    </div>
                    <p className="mt-1 opacity-80">{suggestion.description}</p>
                    {suggestion.suggestion && (
                      <p className="mt-1 font-medium">建议：{suggestion.suggestion}</p>
                    )}
                  </div>
                ))}
                {report.narrativeSuggestions.length > 5 && (
                  <p className="text-sm text-gray-500 text-center">
                    还有 {report.narrativeSuggestions.length - 5} 条建议
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 分镜建议 */}
          {report.shotSuggestions.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium text-gray-700">
                🎥 分镜建议 ({report.shotSuggestions.length})
              </h4>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {report.shotSuggestions.map((suggestion) => (
                  <div key={suggestion.panelIndex} className="p-2 bg-gray-50 rounded text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">第 {suggestion.panelIndex + 1} 格</span>
                      <span className="text-indigo-600 text-xs bg-indigo-50 px-2 py-0.5 rounded">
                        {suggestion.suggestedShotIntent}
                      </span>
                    </div>
                    <div className="text-gray-600 mt-1">
                      构图：{suggestion.suggestedComposition}
                    </div>
                    <div className="text-gray-500 text-xs mt-1">
                      {suggestion.rationale}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 节奏可视化器开关 */}
          <button
            onClick={() => setShowRhythmVisualizer(!showRhythmVisualizer)}
            className="w-full px-4 py-2 border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 transition-colors"
          >
            {showRhythmVisualizer ? "收起节奏分析" : "展开节奏分析 →"}
          </button>

          {/* 节奏可视化器 */}
          {showRhythmVisualizer && (
            <div className="border-t pt-4">
              <RhythmVisualizer
                visualizationData={generateRhythmVisualization(report.rhythmAnalysis)}
                rhythmAnalysis={report.rhythmAnalysis}
              />
            </div>
          )}

          {/* 进入导演工作台（MVP 占位） */}
          <button
            disabled
            className="w-full px-4 py-2 border border-gray-200 text-gray-400 rounded-lg cursor-not-allowed"
          >
            进入导演工作台（敬请期待）
          </button>
        </div>
      )}
    </div>
  );
}
