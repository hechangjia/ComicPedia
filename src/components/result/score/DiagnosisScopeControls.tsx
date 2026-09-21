"use client";

import { useId, useState } from "react";
import type { ComicScript, VisualQualityScore } from "@/lib/types";
import { diagnosisEligibleIndices, diagnosisScopeIndices, type DiagnosisScope } from "@/lib/diagnosisScope";

interface DiagnosisScopeControlsProps {
  script?: ComicScript;
  score: VisualQualityScore;
  busy: boolean;
  onRun?: (panelIndices: number[]) => void;
}

export function DiagnosisScopeControls({ script, score, busy, onRun }: DiagnosisScopeControlsProps) {
  const id = useId();
  const [scope, setScope] = useState<DiagnosisScope>("recommended");
  const [selected, setSelected] = useState<number[]>([]);
  const eligible = diagnosisEligibleIndices(script);
  const targets = diagnosisScopeIndices(script, score, scope, selected);

  return <div className="space-y-3">
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1 space-y-1">
        <label htmlFor={id} className="block text-sm font-medium">诊断范围</label>
        <select id={id} value={scope} disabled={busy} onChange={event => setScope(event.target.value as DiagnosisScope)}
          className="min-h-11 w-full rounded-lg border bg-background px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50">
          <option value="recommended">建议检查的画格</option>
          <option value="all">全部已生成画格（{eligible.length} 格）</option>
          <option value="selected">手动选择画格</option>
        </select>
      </div>
      <button type="button" disabled={busy || !onRun || targets.length === 0}
        onClick={() => { if (!busy && targets.length > 0) onRun?.(targets); }}
        className="min-h-11 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50">{busy ? "诊断中..." : "运行深入诊断"}</button>
    </div>
    {scope === "selected" && <fieldset disabled={busy} className="space-y-2">
      <legend className="text-sm font-medium">选择要诊断的画格</legend>
      <div className="flex flex-wrap gap-2">
        {eligible.map(index => <label key={index} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <input type="checkbox" checked={selected.includes(index)} onChange={event => setSelected(previous => event.target.checked ? [...previous, index] : previous.filter(item => item !== index))} />
          第 {index + 1} 格
        </label>)}
      </div>
    </fieldset>}
    <p className="text-xs text-secondary-text" role="status">
      {busy ? "正在评审所选范围，请等待完成。"
        : eligible.length === 0 ? "没有可诊断的画格，请先完成图片生成。"
        : targets.length === 0 ? scope === "recommended" ? "评分未推荐需要深入诊断的画格。若要逐格检查，请切换到全部或手动选择。" : "请至少选择一格后再运行。"
        : `将深入诊断 ${targets.length} 格。首次评审或评分过期时，还会重新评分全部已生成画格；可能增加模型调用。`}
    </p>
  </div>;
}
