import { create } from "zustand";
import { GenerateTask } from "@/lib/types";
import { getTask } from "@/lib/client/db";

// ============================================================
// Task 进度 Store
// 替代 generator.ts 中的手动 Map<string, ProgressCallback[]> 事件总线。
// generator 通过 updateTask 推送变更，组件通过 selector 订阅。
// ============================================================

interface TaskStore {
  /** 内存中的任务快照（仅当前活跃/被查看的任务） */
  tasks: Record<string, GenerateTask>;

  /** 由 generator 调用：推送任务最新状态到 store */
  updateTask: (task: GenerateTask) => void;

  /**
   * 从 IndexedDB 水合一个任务到 store。
   * 如果 store 中已存在且 updatedAt 更新则跳过。
   */
  loadTask: (taskId: string) => Promise<GenerateTask | undefined>;

  /** 从内存中移除（不影响 IndexedDB） */
  evictTask: (taskId: string) => void;
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: {},

  updateTask: (task) =>
    set((state) => ({
      tasks: { ...state.tasks, [task.id]: task },
    })),

  loadTask: async (taskId) => {
    // store 中已有则直接返回
    const existing = get().tasks[taskId];
    if (existing) return existing;

    const task = await getTask(taskId);
    if (task) {
      set((state) => ({ tasks: { ...state.tasks, [taskId]: task } }));
    }
    return task;
  },

  evictTask: (id) =>
    set((state) => {
      const { [id]: _, ...rest } = state.tasks;
      return { tasks: rest };
    }),
}));

// ============================================================
// Selector 快捷方式
// ============================================================

/** 获取单个任务的 selector，适合在组件中使用 */
export function useTask(taskId: string | undefined): GenerateTask | undefined {
  return useTaskStore((state) => (taskId ? state.tasks[taskId] : undefined));
}
