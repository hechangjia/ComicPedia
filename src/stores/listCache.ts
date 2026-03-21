import { create } from "zustand";
import type { GenerateTask, Character } from "@/lib/types";

// ============================================================
// 列表数据缓存 Store
// 跨页面导航保持列表数据，避免重复加载
// TTL 过期后自动失效，写操作立即失效
// ============================================================

const CACHE_TTL = 60_000; // 60 seconds

interface CacheEntry<T> {
  items: T[];
  total: number;
  fetchedAt: number;
}

interface ListCacheStore {
  tasks: CacheEntry<GenerateTask> | null;
  characters: CacheEntry<Character> | null;

  setTasks: (items: GenerateTask[], total: number) => void;
  setCharacters: (items: Character[], total: number) => void;

  getTasks: () => CacheEntry<GenerateTask> | null;
  getCharacters: () => CacheEntry<Character> | null;

  invalidateTasks: () => void;
  invalidateCharacters: () => void;
  invalidateAll: () => void;
}

export const useListCache = create<ListCacheStore>((set, get) => ({
  tasks: null,
  characters: null,

  setTasks: (items, total) =>
    set({ tasks: { items, total, fetchedAt: Date.now() } }),

  setCharacters: (items, total) =>
    set({ characters: { items, total, fetchedAt: Date.now() } }),

  getTasks: () => {
    const cache = get().tasks;
    if (!cache) return null;
    if (Date.now() - cache.fetchedAt > CACHE_TTL) return null;
    return cache;
  },

  getCharacters: () => {
    const cache = get().characters;
    if (!cache) return null;
    if (Date.now() - cache.fetchedAt > CACHE_TTL) return null;
    return cache;
  },

  invalidateTasks: () => set({ tasks: null }),
  invalidateCharacters: () => set({ characters: null }),
  invalidateAll: () => set({ tasks: null, characters: null }),
}));
