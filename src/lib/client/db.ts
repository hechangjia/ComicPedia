import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { GenerateTask, Character } from '@/lib/types';
import { Series } from '@/lib/series';

// ============================================================
// 双存储数据层
// 主存储：服务端 SQLite（通过 API Routes）
// 缓存层：IndexedDB（离线降级 + 生成中高频写入）
// ============================================================

// ── IndexedDB 缓存层（保留原 schema）─────────────────────────

interface ComicDB extends DBSchema {
  comics: {
    key: string;
    value: GenerateTask;
    indexes: { 'by-date': string };
  };
  settings: {
    key: string;
    value: string | number | boolean | Record<string, unknown>;
  };
  characters: {
    key: string;
    value: Character;
    indexes: { 'by-updated': string };
  };
  series: {
    key: string;
    value: Series;
    indexes: { 'by-updated': string };
  };
}

const DB_NAME = 'comicpedia-db';
const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase<ComicDB>>;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<ComicDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('comics')) {
          const comicStore = db.createObjectStore('comics', { keyPath: 'id' });
          comicStore.createIndex('by-date', 'createdAt');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
        if (!db.objectStoreNames.contains('characters')) {
          const charStore = db.createObjectStore('characters', { keyPath: 'id' });
          charStore.createIndex('by-updated', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('series')) {
          const seriesStore = db.createObjectStore('series', { keyPath: 'id' });
          seriesStore.createIndex('by-updated', 'updatedAt');
        }
      },
    });
  }
  return dbPromise;
}

// ── API 调用层 ──────────────────────────────────────────────

async function apiCall<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error: ${res.status}`);
  }
  return res.json();
}

/** 终态集合：仅这些状态会触发 API 同步 */
const SYNC_STATUSES = new Set(['completed', 'failed', 'script_ready']);

// ── 缓存操作 ────────────────────────────────────────────────

async function cacheGet<T>(store: 'comics', key: string): Promise<T | undefined>;
async function cacheGet<T>(store: 'characters', key: string): Promise<T | undefined>;
async function cacheGet<T>(store: 'series', key: string): Promise<T | undefined>;
async function cacheGet<T>(store: 'comics' | 'characters' | 'series', key: string): Promise<T | undefined> {
  try {
    const db = await getDB();
    return (await db.get(store, key)) as T | undefined;
  } catch {
    return undefined;
  }
}

async function cacheGetAll<T>(store: 'comics'): Promise<T[]>;
async function cacheGetAll<T>(store: 'characters'): Promise<T[]>;
async function cacheGetAll<T>(store: 'series'): Promise<T[]>;
async function cacheGetAll<T>(store: 'comics' | 'characters' | 'series'): Promise<T[]> {
  try {
    const db = await getDB();
    const indexName = store === 'comics' ? 'by-date' : 'by-updated';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = await (db as any).getAllFromIndex(store, indexName);
    return (items as T[]).reverse();
  } catch {
    return [];
  }
}

async function cachePut(store: 'comics', data: GenerateTask): Promise<void>;
async function cachePut(store: 'characters', data: Character): Promise<void>;
async function cachePut(store: 'series', data: Series): Promise<void>;
async function cachePut(store: 'comics' | 'characters' | 'series', data: GenerateTask | Character | Series): Promise<void> {
  try {
    const db = await getDB();
    await db.put(store, data as never);
  } catch {
    // 缓存写入失败不阻断主流程
  }
}

async function cacheDelete(store: 'comics' | 'characters' | 'series', key: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(store, key);
  } catch {
    // 静默
  }
}

async function cacheClear(store: 'comics' | 'characters' | 'series'): Promise<void> {
  try {
    const db = await getDB();
    await db.clear(store);
  } catch {
    // 静默
  }
}

// ============================================================
// 漫画任务 CRUD
// ============================================================

export async function saveTask(task: GenerateTask) {
  // 始终写入 IndexedDB 缓存
  await cachePut('comics', task);

  // 仅终态时同步到服务端
  if (SYNC_STATUSES.has(task.status)) {
    try {
      await apiCall('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      });
    } catch {
      console.warn('[DB] 服务端同步失败，数据保留在 IndexedDB');
    }
  }
}

export async function getTask(id: string): Promise<GenerateTask | undefined> {
  // 先尝试 API
  try {
    const task = await apiCall<GenerateTask>(`/api/tasks/${id}`);
    // 如果 Zustand store 中有更新的活跃状态（generating/scripting），
    // 不要用服务端旧数据覆盖 — 活跃状态仅写 IndexedDB 不同步服务端
    const { useTaskStore } = await import("@/stores/taskStore");
    const storeTask = useTaskStore.getState().tasks[id];
    if (storeTask &&
      (storeTask.status === "generating" || storeTask.status === "scripting") &&
      task.status !== "generating" && task.status !== "scripting"
    ) {
      // Store has active state, server has stale data — keep store version
      return storeTask;
    }
    await cachePut('comics', task);
    return task;
  } catch {
    // API 不可用，降级缓存
    return cacheGet<GenerateTask>('comics', id);
  }
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export async function getAllComics(page = 1, pageSize = 100): Promise<PaginatedResult<GenerateTask>> {
  try {
    const data = await apiCall<{ tasks: GenerateTask[]; total: number; page: number; pageSize: number }>(
      `/api/tasks?page=${page}&pageSize=${pageSize}`
    );
    // Parallel cache update
    await Promise.all(data.tasks.map(t => cachePut('comics', t)));
    return {
      items: data.tasks,
      total: data.total,
      page: data.page,
      pageSize: data.pageSize,
      hasMore: data.page * data.pageSize < data.total,
    };
  } catch {
    const cached = await cacheGetAll<GenerateTask>('comics');
    return { items: cached, total: cached.length, page: 1, pageSize: cached.length, hasMore: false };
  }
}

export async function deleteComic(id: string) {
  try {
    await apiCall(`/api/tasks/${id}`, { method: 'DELETE' });
  } catch {
    // 静默
  }
  await cacheDelete('comics', id);
}

export async function clearAllComics() {
  try {
    await apiCall('/api/tasks', { method: 'DELETE' });
  } catch {
    // 静默
  }
  await cacheClear('comics');
}

// ============================================================
// 角色 CRUD
// ============================================================

export async function saveCharacter(character: Character) {
  await cachePut('characters', character);

  try {
    await apiCall('/api/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ character }),
    });
  } catch {
    console.warn('[DB] 角色同步失败，数据保留在 IndexedDB');
  }
}

export async function getCharacter(id: string): Promise<Character | undefined> {
  try {
    const char = await apiCall<Character>(`/api/characters/${id}`);
    await cachePut('characters', char);
    return char;
  } catch {
    return cacheGet<Character>('characters', id);
  }
}

export async function getAllCharacters(): Promise<Character[]> {
  try {
    const serverChars = await apiCall<Character[]>('/api/characters');
    // 合并：服务端数据为主，但保留仅存在于 IndexedDB 中的角色（服务端同步失败的）
    const localChars = await cacheGetAll<Character>('characters');
    const serverIds = new Set(serverChars.map((c) => c.id));
    const localOnly = localChars.filter((c) => !serverIds.has(c.id));

    // 更新缓存（服务端数据） — parallel
    await Promise.all(serverChars.map(c => cachePut('characters', c)));

    // 合并结果：服务端 + 本地独有（按 updatedAt 降序）
    const merged = [...serverChars, ...localOnly].sort(
      (a, b) => (new Date(b.updatedAt).getTime() || 0) - (new Date(a.updatedAt).getTime() || 0)
    );

    // 尝试将本地独有的角色重新同步到服务端 — parallel
    await Promise.allSettled(
      localOnly.map(c =>
        apiCall('/api/characters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ character: c }),
        })
      )
    );

    return merged;
  } catch {
    return cacheGetAll<Character>('characters');
  }
}

export async function deleteCharacter(id: string) {
  try {
    await apiCall(`/api/characters/${id}`, { method: 'DELETE' });
  } catch {
    // 静默
  }
  await cacheDelete('characters', id);
}

export async function clearAllCharacters() {
  try {
    const chars = await apiCall<Character[]>('/api/characters');
    await Promise.allSettled(
      chars.map((c) => apiCall(`/api/characters/${c.id}`, { method: 'DELETE' })),
    );
  } catch {
    // 静默
  }
  await cacheClear('characters');
}

// ============================================================
// 连载 CRUD
// ============================================================

export async function saveSeries(series: Series) {
  await cachePut('series', series);

  try {
    await apiCall('/api/series', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ series }),
    });
  } catch {
    console.warn('[DB] 连载同步失败，数据保留在 IndexedDB');
  }
}

export async function getSeries(id: string): Promise<Series | undefined> {
  try {
    const s = await apiCall<Series>(`/api/series/${id}`);
    await cachePut('series', s);
    return s;
  } catch {
    return cacheGet<Series>('series', id);
  }
}

export async function getAllSeries(): Promise<Series[]> {
  try {
    const list = await apiCall<Series[]>('/api/series');
    await Promise.all(list.map(s => cachePut('series', s)));
    return list;
  } catch {
    return cacheGetAll<Series>('series');
  }
}

export async function deleteSeries(id: string) {
  try {
    await apiCall(`/api/series/${id}`, { method: 'DELETE' });
  } catch {
    // 静默
  }
  await cacheDelete('series', id);
}

// ============================================================
// 导出 IndexedDB 原始访问（供迁移工具使用）
// ============================================================

export async function getIDBAllComics(): Promise<GenerateTask[]> {
  try {
    const db = await getDB();
    const tasks = await db.getAllFromIndex('comics', 'by-date');
    return tasks.reverse();
  } catch {
    return [];
  }
}

export async function getIDBAllCharacters(): Promise<Character[]> {
  try {
    const db = await getDB();
    const chars = await db.getAllFromIndex('characters', 'by-updated');
    return chars.reverse();
  } catch {
    return [];
  }
}

export async function getIDBAllSeries(): Promise<Series[]> {
  try {
    const db = await getDB();
    const list = await db.getAllFromIndex('series', 'by-updated');
    return list.reverse();
  } catch {
    return [];
  }
}
