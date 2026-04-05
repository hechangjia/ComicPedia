// src/components/director/RhythmVisualizer.tsx

"use client";

import type { RhythmAnalysis, RhythmVisualizationData } from "@/lib/directorAgent/types";

interface RhythmVisualizerProps {
  visualizationData: RhythmVisualizationData;
  rhythmAnalysis: RhythmAnalysis;
}

export function RhythmVisualizer({ visualizationData, rhythmAnalysis }: RhythmVisualizerProps) {
  const { labels, intensityData, densityData, suggestedCurve } = visualizationData;

  // 曲线类型描述
  const curveTypeDescriptions: Record<string, string> = {
    "progressive": "渐进式 - 节奏逐渐上升",
    "front-loaded": "前重式 - 开头信息密度高",
    "spiral": "螺旋式 - 多个节奏峰值",
    "sandwich": "三明治式 - 头尾高，中间低",
    "unbalanced": "不平衡 - 建议调整",
  };

  const maxHeight = 100;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">🎬 叙事节奏分析</h3>
        <span className="text-sm text-gray-500">
          类型：{curveTypeDescriptions[rhythmAnalysis.curveType] || rhythmAnalysis.curveType}
        </span>
      </div>

      <div className="h-64 w-full bg-white rounded-lg border p-4">
        {/* 简单的 CSS 条形图 */}
        <div className="flex items-end justify-around h-full gap-2 pb-8">
          {labels.map((label, index) => (
            <div key={index} className="flex flex-col items-center gap-1 flex-1">
              {/* 建议曲线 */}
              <div className="relative w-full flex items-end justify-center">
                <div
                  className="absolute bottom-0 w-1 bg-amber-200 rounded-t"
                  style={{ height: `${suggestedCurve[index] * maxHeight}px` }}
                />
                {/* 实际强度 */}
                <div
                  className="relative w-3 bg-indigo-500 rounded-t z-10"
                  style={{ height: `${intensityData[index] * maxHeight}px` }}
                />
                {/* 实际密度 */}
                <div
                  className="relative w-2 bg-emerald-500 rounded-t z-10 ml-0.5"
                  style={{ height: `${densityData[index] * maxHeight}px` }}
                />
              </div>
              <span className="text-xs text-gray-500">{label}</span>
            </div>
          ))}
        </div>

        {/* 图例 */}
        <div className="flex justify-center gap-6 text-xs mt-2">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-indigo-500 rounded"></div>
            <span>实际强度</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-emerald-500 rounded"></div>
            <span>实际密度</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-amber-200 rounded"></div>
            <span>建议曲线</span>
          </div>
        </div>
      </div>

      {rhythmAnalysis.suggestions.length > 0 && (
        <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
          <h4 className="font-medium text-amber-800 mb-2">💡 节奏建议</h4>
          <ul className="space-y-2">
            {rhythmAnalysis.suggestions.map((suggestion) => (
              <li key={suggestion.id} className="text-sm text-amber-700">
                {suggestion.panelIndex !== undefined && (
                  <span className="font-medium">第 {suggestion.panelIndex + 1} 格：</span>
                )}
                {suggestion.description}
                {suggestion.suggestion && (
                  <span className="block text-amber-600 ml-4 mt-1">
                    建议：{suggestion.suggestion}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
