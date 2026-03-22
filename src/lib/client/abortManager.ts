import { GenerateTask } from "@/lib/types";
import { saveTask, getTask } from "./db";
import { notifyListeners } from "./eventBus";

// ============================================================
// AbortController 管理
// ============================================================

/** 每个面板的生成可独立取消 */
export const abortControllers: Map<string, AbortController> = new Map();

/** 生成 abort key（taskId + panelIndex 或特殊标签） */
export function abortKey(taskId: string, panelIndex: number | string): string {
  return `${taskId}:${panelIndex}`;
}

/**
 * 取消指定面板的图片生成。
 * 如果 panelIndex 为 -1，取消该任务的所有面板生成。
 */
export function cancelGeneration(taskId: string, panelIndex: number = -1): void {
  if (panelIndex === -1) {
    for (const [key, controller] of abortControllers.entries()) {
      if (key.startsWith(`${taskId}:`)) {
        controller.abort();
        abortControllers.delete(key);
      }
    }
  } else {
    const key = abortKey(taskId, panelIndex);
    const controller = abortControllers.get(key);
    if (controller) {
      controller.abort();
      abortControllers.delete(key);
    }
  }

  // 更新被取消面板的状态（带错误处理）
  getTask(taskId).then(async (task) => {
    if (!task?.script) return;
    let changed = false;

    const panelsToCancel = panelIndex === -1
      ? task.script.panels
      : [task.script.panels[panelIndex]].filter(Boolean);

    for (const panel of panelsToCancel) {
      if (panel.status === "generating") {
        if (panel.imageVersions && panel.imageVersions.length > 0) {
          const lastVersion = panel.imageVersions[panel.imageVersions.length - 1];
          panel.imageUrl = lastVersion.imageUrl;
          panel.status = "completed";
        } else {
          panel.status = "failed";
        }
        changed = true;
      }
    }

    if (changed) {
      const hasGenerating = task.script.panels.some((p) => p.status === "generating");
      if (!hasGenerating) {
        const allCompleted = task.script.panels.every((p) => p.status === "completed");
        task.status = allCompleted ? "completed" : "script_ready";
      }
      task.updatedAt = new Date();
      await saveTask(task);
      notifyListeners(task);
    }
  }).catch((err) => {
    console.error(`[AbortManager] Failed to update cancelled task ${taskId}:`, err);
  });
}

/**
 * 恢复僵尸状态的任务。
 * 当页面刷新导致内存中的 AbortController 丢失时，
 * IndexedDB 中的任务可能卡在 generating/scripting 状态。
 */
export async function recoverZombieTask(taskId: string): Promise<boolean> {
  const task = await getTask(taskId);
  if (!task) return false;

  if (task.status !== "generating" && task.status !== "scripting") return false;

  const hasActiveController = Array.from(abortControllers.keys()).some(
    (key) => key.startsWith(`${taskId}:`)
  );
  if (hasActiveController) return false;

  let changed = false;

  if (task.status === "scripting") {
    if (task.script) {
      task.status = "script_ready";
    } else {
      task.status = "failed";
      task.error = "脚本生成被中断，请重新创建";
    }
    changed = true;
  } else if (task.status === "generating" && task.script) {
    for (const panel of task.script.panels) {
      if (panel.status === "generating") {
        if (panel.imageVersions && panel.imageVersions.length > 0) {
          const lastVersion = panel.imageVersions[panel.imageVersions.length - 1];
          panel.imageUrl = lastVersion.imageUrl;
          panel.status = "completed";
        } else if (panel.imageUrl && panel.imageUrl.startsWith("data:image")) {
          panel.status = "completed";
        } else {
          panel.status = "pending";
        }
      }
    }

    const allCompleted = task.script.panels.every((p) => p.status === "completed");
    task.status = allCompleted ? "completed" : "script_ready";
    task.progress = allCompleted ? 100 : 30 + Math.floor(
      (task.script.panels.filter((p) => p.status === "completed").length / task.script.panels.length) * 70
    );
    changed = true;
  }

  if (changed) {
    task.updatedAt = new Date();
    await saveTask(task);
    notifyListeners(task);
  }

  return changed;
}
