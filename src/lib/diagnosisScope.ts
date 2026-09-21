import type { ComicScript, VisualDiagnosisReport, VisualQualityScore } from "./types";
import { pickDiagnosisCandidates } from "./vlmDiagnosis";

export type DiagnosisScope = "recommended" | "all" | "selected";

export function diagnosisEligibleIndices(script?: ComicScript): number[] {
  return script?.panels.flatMap((panel, index) => panel.status === "completed" && panel.imageUrl ? [index] : []) ?? [];
}

/** The submitted indices must match the scope the user saw, never an implicit wider fallback. */
export function diagnosisScopeIndices(script: ComicScript | undefined, score: VisualQualityScore, scope: DiagnosisScope, selected: number[] = []): number[] {
  const eligible = diagnosisEligibleIndices(script);
  const requested = scope === "all" ? eligible : scope === "selected" ? selected : pickDiagnosisCandidates(score);
  return eligible.filter(index => requested.includes(index));
}

/** Coverage counts actual current evidence, not a successful job or a good numerical score. */
export function diagnosisCoverage(script?: ComicScript, report?: VisualDiagnosisReport | null, stale = false) {
  const eligibleIndices = diagnosisEligibleIndices(script);
  const current = new Set<number>();
  const obsolete = new Set<number>();
  for (const panel of report?.panels ?? []) {
    const source = script?.panels[panel.panelIndex];
    if (!stale && eligibleIndices.includes(panel.panelIndex) && source?.imageUrl === panel.imageUrl && source.imagePrompt === panel.promptSnapshot) {
      current.add(panel.panelIndex);
    } else {
      obsolete.add(panel.panelIndex);
    }
  }
  return {
    eligibleIndices,
    currentIndices: eligibleIndices.filter(index => current.has(index)),
    unreviewedIndices: eligibleIndices.filter(index => !current.has(index)),
    obsoleteCount: obsolete.size,
  };
}
