import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { GenerateTask, Character } from '@/lib/types';
import { Series } from '@/lib/series';
import { cleanupTaskState } from './eventBus';

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

/** 默认 API 超时：10 秒 */
const API_TIMEOUT_MS = 10_000;

async function apiCall<T>(url: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `API error: ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`API timeout after ${API_TIMEOUT_MS}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** 终态集合：仅这些状态会触发 API 同步 */
const SYNC_STATUSES = new Set(['completed', 'failed', 'script_ready']);

/** 本地浏览器仍在直接驱动的活跃状态：L3 为权威源，禁止 L1 回写覆盖 */
const LOCAL_ACTIVE_STATUSES = new Set(['generating', 'scripting']);

// ── 缓存操作（带错误日志）────────────────────────────────────

async function cacheGet<T>(store: 'comics', key: string): Promise<T | undefined>;
async function cacheGet<T>(store: 'characters', key: string): Promise<T | undefined>;
async function cacheGet<T>(store: 'series', key: string): Promise<T | undefined>;
async function cacheGet<T>(store: 'comics' | 'characters' | 'series', key: string): Promise<T | undefined> {
  try {
    const db = await getDB();
    return (await db.get(store, key)) as T | undefined;
  } catch (err) {
    console.error(`[IDB] cacheGet(${store}, ${key}) failed:`, err);
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
     
    const items = await (db as any).getAllFromIndex(store, indexName);
    return (items as T[]).reverse();
  } catch (err) {
    console.error(`[IDB] cacheGetAll(${store}) failed:`, err);
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
  } catch (err) {
    console.error(`[IDB] cachePut(${store}) failed:`, err);
  }
}

async function cacheDelete(store: 'comics' | 'characters' | 'series', key: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(store, key);
  } catch (err) {
    console.error(`[IDB] cacheDelete(${store}, ${key}) failed:`, err);
  }
}

async function cacheClear(store: 'comics' | 'characters' | 'series'): Promise<void> {
  try {
    const db = await getDB();
    await db.clear(store);
  } catch (err) {
    console.error(`[IDB] cacheClear(${store}) failed:`, err);
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
    } catch (err) {
      console.warn('[DB] 服务端同步失败，数据保留在 IndexedDB:', err);
    }
  }
}

export async function getTask(id: string): Promise<GenerateTask | undefined> {
  // === L1/L3 竞态修复 ===
  // 活跃状态下 L3（Zustand 内存）是权威源，不应被 L1（SQLite）覆盖。
  // 先检查 L3，如果处于活跃状态则直接返回，跳过 L1 读取和 L2 回写。
  const { useTaskStore } = await import("@/stores/taskStore");
  const storeTask = useTaskStore.getState().tasks[id];
  if (storeTask && LOCAL_ACTIVE_STATUSES.has(storeTask.status)) {
    return storeTask;
  }

  // L3 不活跃或不存在 → 读 L1（SQLite API）
  try {
    const task = await apiCall<GenerateTask>(`/api/tasks/${id}`);

    // 二次检查：在 await 期间 L3 可能已更新为活跃状态
    const freshStoreTask = useTaskStore.getState().tasks[id];
    if (freshStoreTask && LOCAL_ACTIVE_STATUSES.has(freshStoreTask.status)) {
      return freshStoreTask;
    }

    // L1 数据安全，回写 L2 缓存
    await cachePut('comics', task);
    return task;
  } catch (err) {
    console.warn(`[DB] API getTask(${id}) failed, falling back to IndexedDB:`, err);
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
    // Parallel cache update — use allSettled to not lose all if one fails
    await Promise.allSettled(data.tasks.map(t => cachePut('comics', t)));
    return {
      items: data.tasks,
      total: data.total,
      page: data.page,
      pageSize: data.pageSize,
      hasMore: data.page * data.pageSize < data.total,
    };
  } catch (err) {
    console.warn('[DB] getAllComics API failed, falling back to IndexedDB:', err);
    const cached = await cacheGetAll<GenerateTask>('comics');
    return { items: cached, total: cached.length, page: 1, pageSize: cached.length, hasMore: false };
  }
}

export async function deleteComic(id: string) {
  try {
    await apiCall(`/api/tasks/${id}`, { method: 'DELETE' });
  } catch (err) {
    console.warn(`[DB] deleteComic(${id}) API failed:`, err);
  }
  await cacheDelete('comics', id);
  cleanupTaskState(id);
}

export async function deleteComicsByIds(ids: string[]) {
  if (ids.length === 0) return;
  try {
    await apiCall('/api/tasks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
  } catch (err) {
    console.warn('[DB] deleteComicsByIds API failed:', err);
  }
  // 逐个清理本地缓存和状态
  for (const id of ids) {
    await cacheDelete('comics', id);
    cleanupTaskState(id);
  }
}

export async function clearAllComics() {
  try {
    await apiCall('/api/tasks', { method: 'DELETE' });
  } catch (err) {
    console.warn('[DB] clearAllComics API failed:', err);
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
  } catch (err) {
    console.warn('[DB] 角色同步失败，数据保留在 IndexedDB:', err);
  }
}

export async function getCharacter(id: string): Promise<Character | undefined> {
  try {
    const char = await apiCall<Character>(`/api/characters/${id}`);
    await cachePut('characters', char);
    return char;
  } catch (err) {
    console.warn(`[DB] getCharacter(${id}) API failed, falling back:`, err);
    return cacheGet<Character>('characters', id);
  }
}

export async function getAllCharacters(): Promise<Character[]> {
  try {
    const serverChars = await apiCall<Character[]>('/api/characters');

    // 更新缓存（服务端数据） — allSettled 防单点失败
    await Promise.allSettled(serverChars.map(c => cachePut('characters', c)));

    return serverChars;
  } catch (err) {
    console.warn('[DB] getAllCharacters API failed, falling back:', err);
    return cacheGetAll<Character>('characters');
  }
}

export async function deleteCharacter(id: string) {
  try {
    await apiCall(`/api/characters/${id}`, { method: 'DELETE' });
  } catch (err) {
    console.warn(`[DB] deleteCharacter(${id}) API failed:`, err);
  }
  await cacheDelete('characters', id);
}

export async function clearAllCharacters() {
  try {
    const chars = await apiCall<Character[]>('/api/characters');
    await Promise.allSettled(
      chars.map((c) => apiCall(`/api/characters/${c.id}`, { method: 'DELETE' })),
    );
  } catch (err) {
    console.warn('[DB] clearAllCharacters API failed:', err);
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
  } catch (err) {
    console.warn('[DB] 连载同步失败，数据保留在 IndexedDB:', err);
  }
}

export async function getSeries(id: string): Promise<Series | undefined> {
  try {
    const s = await apiCall<Series>(`/api/series/${id}`);
    await cachePut('series', s);
    return s;
  } catch (err) {
    console.warn(`[DB] getSeries(${id}) API failed, falling back:`, err);
    return cacheGet<Series>('series', id);
  }
}

export async function getAllSeries(): Promise<Series[]> {
  try {
    const list = await apiCall<Series[]>('/api/series');
    await Promise.allSettled(list.map(s => cachePut('series', s)));
    return list;
  } catch (err) {
    console.warn('[DB] getAllSeries API failed, falling back:', err);
    return cacheGetAll<Series>('series');
  }
}

export async function deleteSeries(id: string) {
  try {
    await apiCall(`/api/series/${id}`, { method: 'DELETE' });
  } catch (err) {
    console.warn(`[DB] deleteSeries(${id}) API failed:`, err);
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
  } catch (err) {
    console.error('[IDB] getIDBAllComics failed:', err);
    return [];
  }
}

export async function getIDBAllCharacters(): Promise<Character[]> {
  try {
    const db = await getDB();
    const chars = await db.getAllFromIndex('characters', 'by-updated');
    return chars.reverse();
  } catch (err) {
    console.error('[IDB] getIDBAllCharacters failed:', err);
    return [];
  }
}

export async function getIDBAllSeries(): Promise<Series[]> {
  try {
    const db = await getDB();
    const list = await db.getAllFromIndex('series', 'by-updated');
    return list.reverse();
  } catch (err) {
    console.error('[IDB] getIDBAllSeries failed:', err);
    return [];
  }
}
