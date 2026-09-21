import type { VisualDiagnosisPanel } from "./types";

type RepairMode = "patch" | "rewrite";

/** A diagnosis suggestion is not permission to change a clean or unconfirmed panel. */
export function canRepairDiagnosisPanel(panel: VisualDiagnosisPanel, mode: RepairMode): boolean {
  return panel.status === "issues_found"
    && panel.issues.length > 0
    && panel.repair.recommendedMode === mode
    && !panel.issues.some((issue) => issue.actionability === "manual_only");
}

export function canBatchPatchDiagnosisPanel(panel: VisualDiagnosisPanel): boolean {
  return canRepairDiagnosisPanel(panel, "patch")
    && panel.issues.every((issue) => issue.actionability === "apply_directly" && issue.falsePositiveRisk !== "high");
}

/** UI preflight only: source bytes and concurrent server writes require server-side fencing. */
export function assertDiagnosisRepairCurrent(
  panel: VisualDiagnosisPanel,
  mode: RepairMode,
  current: { imageUrl?: string; imagePrompt: string } | undefined,
  stale: boolean,
): void {
  if (stale) throw new Error("诊断结果已过期，请重新诊断后再修复");
  if (!current) throw new Error(`Panel ${panel.panelIndex + 1} 不存在`);
  if (current.imageUrl !== panel.imageUrl || current.imagePrompt !== panel.promptSnapshot) {
    throw new Error("面板素材或提示词已变更，请重新诊断后再修复");
  }
  if (!canRepairDiagnosisPanel(panel, mode)) throw new Error("当前诊断不支持此修复操作，请先人工确认或重新诊断");
}
