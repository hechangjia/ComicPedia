import type { ComicPanel, GenerateTask, VisualDiagnosisPanel, VisualDiagnosisReport } from "./types";

export function markDiagnosisRunning(task: GenerateTask): GenerateTask {
  task.visualDiagnosisState = "running";
  return task;
}

export function markDiagnosisSucceeded(task: GenerateTask, report: VisualDiagnosisReport): GenerateTask {
  task.visualDiagnosisReport = report;
  task.visualDiagnosisState = "succeeded";
  task.visualDiagnosisStale = false;
  task.lastDiagnosisAt = report.generatedAt;
  return task;
}

export function markDiagnosisFailed(task: GenerateTask, _error?: Error): GenerateTask {
  task.visualDiagnosisState = "failed";
  return task;
}

export function markDiagnosisSkipped(task: GenerateTask): GenerateTask {
  task.visualDiagnosisState = "skipped";
  return task;
}

export function invalidateDiagnosis(task: GenerateTask): GenerateTask {
  if (task.visualDiagnosisReport) {
    task.visualDiagnosisStale = true;
  }
  return task;
}

export function isDiagnosisPanelStale(
  currentPanel: ComicPanel,
  diagnosisPanel: VisualDiagnosisPanel,
): boolean {
  return currentPanel.imageUrl !== diagnosisPanel.imageUrl
    || currentPanel.imagePrompt !== diagnosisPanel.promptSnapshot;
}

export function deriveDiagnosisStaleness(task: GenerateTask): boolean {
  if (task.visualDiagnosisStale) return true;
  if (!task.script || !task.visualDiagnosisReport) return false;

  return task.visualDiagnosisReport.panels.some((diagnosisPanel) => {
    const currentPanel = task.script?.panels[diagnosisPanel.panelIndex];
    if (!currentPanel) return true;
    return isDiagnosisPanelStale(currentPanel, diagnosisPanel);
  });
}
