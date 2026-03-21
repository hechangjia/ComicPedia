import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { GenerateTask, Character, UserAPIConfigV2 } from "@/lib/types";
import type { Series } from "@/lib/series";

// ============================================================
// SQLite 数据库初始化（单例）
// ============================================================

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "comicpedia.db");

fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY,
    status      TEXT NOT NULL DEFAULT 'pending',
    progress    INTEGER NOT NULL DEFAULT 0,
    script      TEXT,
    character   TEXT,
    error       TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);
  CREATE INDEX IF NOT EXISTS idx_tasks_status  ON tasks(status);

  CREATE TABLE IF NOT EXISTS characters (
    id                TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    description       TEXT NOT NULL DEFAULT '',
    appearance        TEXT NOT NULL,
    style             TEXT NOT NULL DEFAULT 'anime',
    avatar_url        TEXT,
    reference_entries TEXT NOT NULL DEFAULT '[]',
    tags              TEXT NOT NULL DEFAULT '[]',
    variants          TEXT,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_chars_updated ON characters(updated_at);

  CREATE TABLE IF NOT EXISTS series (
    id                    TEXT PRIMARY KEY,
    title                 TEXT NOT NULL,
    description           TEXT NOT NULL DEFAULT '',
    content_type          TEXT NOT NULL,
    style                 TEXT NOT NULL,
    character_description TEXT,
    character_ids         TEXT,
    episodes              TEXT NOT NULL DEFAULT '[]',
    cover_url             TEXT,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_series_updated ON series(updated_at);

  CREATE TABLE IF NOT EXISTS config (
    id         TEXT PRIMARY KEY DEFAULT 'main',
    version    INTEGER NOT NULL DEFAULT 2,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS images (
    key        TEXT PRIMARY KEY,
    file_path  TEXT NOT NULL,
    size       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS trash (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    name        TEXT NOT NULL DEFAULT '',
    data        TEXT NOT NULL,
    image_dir   TEXT,
    deleted_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_trash_deleted ON trash(deleted_at);

  CREATE TABLE IF NOT EXISTS job_queue (
    id            TEXT PRIMARY KEY,
    task_id       TEXT NOT NULL,
    type          TEXT NOT NULL DEFAULT 'image',
    status        TEXT NOT NULL DEFAULT 'pending',
    priority      INTEGER NOT NULL DEFAULT 0,
    payload       TEXT NOT NULL,
    result        TEXT,
    error         TEXT,
    attempts      INTEGER NOT NULL DEFAULT 0,
    max_attempts  INTEGER NOT NULL DEFAULT 3,
    created_at    TEXT NOT NULL,
    started_at    TEXT,
    completed_at  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_status ON job_queue(status, priority DESC, created_at);
  CREATE INDEX IF NOT EXISTS idx_jobs_task ON job_queue(task_id);
`);

// ============================================================
// Tasks CRUD
// ============================================================

const stmtInsertTask = db.prepare(`
  INSERT OR REPLACE INTO tasks (id, status, progress, script, character, error, created_at, updated_at)
  VALUES (@id, @status, @progress, @script, @character, @error, @created_at, @updated_at)
`);

const stmtGetTask = db.prepare("SELECT * FROM tasks WHERE id = ?");
const stmtGetAllTasks = db.prepare("SELECT * FROM tasks ORDER BY created_at DESC");
const stmtGetAllTasksPaged = db.prepare("SELECT * FROM tasks ORDER BY created_at DESC LIMIT ? OFFSET ?");
const stmtCountTasks = db.prepare("SELECT COUNT(*) as total FROM tasks");
const stmtGetAllTaskIds = db.prepare("SELECT id FROM tasks");
const stmtDeleteTask = db.prepare("DELETE FROM tasks WHERE id = ?");
const stmtClearTasks = db.prepare("DELETE FROM tasks");

function taskToRow(task: GenerateTask) {
  return {
    id: task.id,
    status: task.status,
    progress: task.progress,
    script: task.script ? JSON.stringify(task.script) : null,
    character: task.character ? JSON.stringify(task.character) : null,
    error: task.error ?? null,
    created_at: task.createdAt instanceof Date ? task.createdAt.toISOString() : String(task.createdAt),
    updated_at: task.updatedAt instanceof Date ? task.updatedAt.toISOString() : String(task.updatedAt),
  };
}

function rowToTask(row: Record<string, unknown>): GenerateTask {
  return {
    id: row.id as string,
    status: row.status as GenerateTask["status"],
    progress: row.progress as number,
    script: row.script ? JSON.parse(row.script as string) : undefined,
    character: row.character ? JSON.parse(row.character as string) : undefined,
    error: (row.error as string) ?? undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export function upsertTask(task: GenerateTask): void {
  stmtInsertTask.run(taskToRow(task));
}

export function getTaskById(id: string): GenerateTask | null {
  const row = stmtGetTask.get(id) as Record<string, unknown> | undefined;
  return row ? rowToTask(row) : null;
}

export function getAllTasks(): GenerateTask[] {
  const rows = stmtGetAllTasks.all() as Record<string, unknown>[];
  return rows.map(rowToTask);
}

export function getTasksPaginated(page: number = 1, pageSize: number = 50): { tasks: GenerateTask[]; total: number } {
  const offset = (page - 1) * pageSize;
  const totalRow = stmtCountTasks.get() as { total: number };
  const rows = stmtGetAllTasksPaged.all(pageSize, offset) as Record<string, unknown>[];
  return { tasks: rows.map(rowToTask), total: totalRow.total };
}

export function deleteTask(id: string): boolean {
  const result = stmtDeleteTask.run(id);
  return result.changes > 0;
}

export function clearAllTasks(): number {
  const result = stmtClearTasks.run();
  return result.changes;
}

export function getAllTaskIds(): string[] {
  const rows = stmtGetAllTaskIds.all() as { id: string }[];
  return rows.map((r) => r.id);
}

// ============================================================
// Characters CRUD
// ============================================================

const stmtInsertChar = db.prepare(`
  INSERT OR REPLACE INTO characters
    (id, name, description, appearance, style, avatar_url, reference_entries, tags, variants, created_at, updated_at)
  VALUES
    (@id, @name, @description, @appearance, @style, @avatar_url, @reference_entries, @tags, @variants, @created_at, @updated_at)
`);

const stmtGetChar = db.prepare("SELECT * FROM characters WHERE id = ?");
const stmtGetAllChars = db.prepare("SELECT * FROM characters ORDER BY updated_at DESC");
const stmtGetAllCharsPaged = db.prepare("SELECT * FROM characters ORDER BY updated_at DESC LIMIT ? OFFSET ?");
const stmtCountChars = db.prepare("SELECT COUNT(*) as total FROM characters");
const stmtDeleteChar = db.prepare("DELETE FROM characters WHERE id = ?");
const stmtClearChars = db.prepare("DELETE FROM characters");

function charToRow(c: Character) {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    appearance: JSON.stringify(c.appearance),
    style: c.style,
    avatar_url: c.avatarUrl,
    reference_entries: JSON.stringify(c.referenceEntries),
    tags: JSON.stringify(c.tags),
    variants: c.variants ? JSON.stringify(c.variants) : null,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

function rowToChar(row: Record<string, unknown>): Character {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    appearance: JSON.parse(row.appearance as string),
    style: row.style as Character["style"],
    avatarUrl: (row.avatar_url as string) ?? null,
    referenceEntries: JSON.parse(row.reference_entries as string),
    tags: JSON.parse(row.tags as string),
    variants: row.variants ? JSON.parse(row.variants as string) : undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function upsertCharacter(c: Character): void {
  stmtInsertChar.run(charToRow(c));
}

export function getCharacterById(id: string): Character | null {
  const row = stmtGetChar.get(id) as Record<string, unknown> | undefined;
  return row ? rowToChar(row) : null;
}

export function getAllCharacters(): Character[] {
  const rows = stmtGetAllChars.all() as Record<string, unknown>[];
  return rows.map(rowToChar);
}

export function getCharactersPaginated(page: number = 1, pageSize: number = 50): { characters: Character[]; total: number } {
  const offset = (page - 1) * pageSize;
  const totalRow = stmtCountChars.get() as { total: number };
  const rows = stmtGetAllCharsPaged.all(pageSize, offset) as Record<string, unknown>[];
  return { characters: rows.map(rowToChar), total: totalRow.total };
}

export function deleteCharacter(id: string): boolean {
  const result = stmtDeleteChar.run(id);
  return result.changes > 0;
}

export function clearAllCharacters(): number {
  const result = stmtClearChars.run();
  return result.changes;
}

// ============================================================
// Series CRUD
// ============================================================

const stmtInsertSeries = db.prepare(`
  INSERT OR REPLACE INTO series
    (id, title, description, content_type, style, character_description, character_ids, episodes, cover_url, created_at, updated_at)
  VALUES
    (@id, @title, @description, @content_type, @style, @character_description, @character_ids, @episodes, @cover_url, @created_at, @updated_at)
`);

const stmtGetSeries = db.prepare("SELECT * FROM series WHERE id = ?");
const stmtGetAllSeries = db.prepare("SELECT * FROM series ORDER BY updated_at DESC");
const stmtDeleteSeries = db.prepare("DELETE FROM series WHERE id = ?");

function seriesToRow(s: Series) {
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    content_type: s.contentType,
    style: s.style,
    character_description: s.characterDescription ?? null,
    character_ids: s.characterIds ? JSON.stringify(s.characterIds) : null,
    episodes: JSON.stringify(s.episodes),
    cover_url: s.coverUrl ?? null,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

function rowToSeries(row: Record<string, unknown>): Series {
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string,
    contentType: row.content_type as Series["contentType"],
    style: row.style as Series["style"],
    characterDescription: (row.character_description as string) ?? undefined,
    characterIds: row.character_ids ? JSON.parse(row.character_ids as string) : undefined,
    episodes: JSON.parse(row.episodes as string),
    coverUrl: (row.cover_url as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function upsertSeries(s: Series): void {
  stmtInsertSeries.run(seriesToRow(s));
}

export function getSeriesById(id: string): Series | null {
  const row = stmtGetSeries.get(id) as Record<string, unknown> | undefined;
  return row ? rowToSeries(row) : null;
}

export function getAllSeriesList(): Series[] {
  const rows = stmtGetAllSeries.all() as Record<string, unknown>[];
  return rows.map(rowToSeries);
}

export function deleteSeries(id: string): boolean {
  const result = stmtDeleteSeries.run(id);
  return result.changes > 0;
}

// ============================================================
// Config CRUD
// ============================================================

const stmtGetConfig = db.prepare("SELECT data FROM config WHERE id = 'main'");
const stmtUpsertConfig = db.prepare(`
  INSERT OR REPLACE INTO config (id, version, data, updated_at)
  VALUES ('main', 2, @data, @updated_at)
`);

export function getConfig(): UserAPIConfigV2 | null {
  const row = stmtGetConfig.get() as { data: string } | undefined;
  return row ? JSON.parse(row.data) : null;
}

export function saveConfig(config: UserAPIConfigV2): void {
  stmtUpsertConfig.run({
    data: JSON.stringify(config),
    updated_at: config.updatedAt || new Date().toISOString(),
  });
}

// ============================================================
// Images registry
// ============================================================

const stmtRegisterImage = db.prepare(`
  INSERT OR REPLACE INTO images (key, file_path, size, created_at)
  VALUES (@key, @file_path, @size, @created_at)
`);

const stmtGetImagePath = db.prepare("SELECT file_path FROM images WHERE key = ?");
const stmtDeleteImage = db.prepare("DELETE FROM images WHERE key = ?");

export function registerImage(key: string, filePath: string, size: number): void {
  stmtRegisterImage.run({
    key,
    file_path: filePath,
    size,
    created_at: new Date().toISOString(),
  });
}

export function getImagePath(key: string): string | null {
  const row = stmtGetImagePath.get(key) as { file_path: string } | undefined;
  return row?.file_path ?? null;
}

export function deleteImage(key: string): boolean {
  const result = stmtDeleteImage.run(key);
  return result.changes > 0;
}

export function deleteImagesByPrefix(prefix: string): number {
  const stmt = db.prepare("DELETE FROM images WHERE key LIKE ?");
  const result = stmt.run(`${prefix}%`);
  return result.changes;
}

// ============================================================
// Trash (soft-delete)
// ============================================================

export interface TrashItem {
  id: string;
  type: "task" | "character";
  name: string;
  data: string; // JSON string of the original record
  imageDir: string | null;
  deletedAt: string;
}

const stmtInsertTrash = db.prepare(`
  INSERT OR REPLACE INTO trash (id, type, name, data, image_dir, deleted_at)
  VALUES (@id, @type, @name, @data, @image_dir, @deleted_at)
`);

const stmtGetTrash = db.prepare("SELECT * FROM trash WHERE id = ?");
const stmtGetAllTrash = db.prepare("SELECT * FROM trash ORDER BY deleted_at DESC");
const stmtDeleteTrash = db.prepare("DELETE FROM trash WHERE id = ?");
const stmtClearTrash = db.prepare("DELETE FROM trash");

function rowToTrash(row: Record<string, unknown>): TrashItem {
  return {
    id: row.id as string,
    type: row.type as "task" | "character",
    name: row.name as string,
    data: row.data as string,
    imageDir: (row.image_dir as string) || null,
    deletedAt: row.deleted_at as string,
  };
}

export function addToTrash(item: Omit<TrashItem, "deletedAt">): void {
  stmtInsertTrash.run({
    id: item.id,
    type: item.type,
    name: item.name,
    data: item.data,
    image_dir: item.imageDir,
    deleted_at: new Date().toISOString(),
  });
}

export function getTrashItem(id: string): TrashItem | null {
  const row = stmtGetTrash.get(id) as Record<string, unknown> | undefined;
  return row ? rowToTrash(row) : null;
}

export function getAllTrash(): TrashItem[] {
  const rows = stmtGetAllTrash.all() as Record<string, unknown>[];
  return rows.map(rowToTrash);
}

export function removeFromTrash(id: string): boolean {
  const result = stmtDeleteTrash.run(id);
  return result.changes > 0;
}

export function clearTrash(): number {
  const result = stmtClearTrash.run();
  return result.changes;
}

// ============================================================
// Auto-seed demo data on first startup (empty tasks table)
// ============================================================

function autoSeedDemo(): void {
  try {
    const count = db.prepare("SELECT COUNT(*) as cnt FROM tasks").get() as { cnt: number };
    if (count.cnt > 0) return;

    // Lazy import to avoid circular dependency at module load
    const { loadDemoSeed } = require("./demoSeed");
    const demoTasks = loadDemoSeed();
    if (demoTasks.length === 0) return;

    for (const task of demoTasks) {
      stmtInsertTask.run(taskToRow(task));
    }
    console.log(`[DB] Auto-seeded ${demoTasks.length} demo tasks`);
  } catch (error) {
    // Non-fatal: seed failure should not prevent app startup
    console.warn("[DB] Demo auto-seed skipped:", error);
  }
}

autoSeedDemo();

// ============================================================
// Batch operations (for migration)
// ============================================================

export const batchUpsertTasks = db.transaction((tasks: GenerateTask[]) => {
  for (const task of tasks) {
    stmtInsertTask.run(taskToRow(task));
  }
});

export const batchUpsertCharacters = db.transaction((chars: Character[]) => {
  for (const c of chars) {
    stmtInsertChar.run(charToRow(c));
  }
});

export const batchUpsertSeries = db.transaction((list: Series[]) => {
  for (const s of list) {
    stmtInsertSeries.run(seriesToRow(s));
  }
});

// ============================================================
// Job Queue (for AnimePedia server-side generation)
// ============================================================

export interface JobRecord {
  id: string;
  taskId: string;
  type: string;
  status: "pending" | "running" | "completed" | "failed";
  priority: number;
  payload: string;
  result: string | null;
  error: string | null;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

const stmtInsertJob = db.prepare(`
  INSERT INTO job_queue (id, task_id, type, status, priority, payload, max_attempts, created_at)
  VALUES (@id, @task_id, @type, 'pending', @priority, @payload, @max_attempts, @created_at)
`);

const stmtClaimJob = db.prepare(`
  UPDATE job_queue SET status = 'running', started_at = @now, attempts = attempts + 1
  WHERE id = (
    SELECT id FROM job_queue WHERE status = 'pending' ORDER BY priority DESC, created_at LIMIT 1
  )
  RETURNING *
`);

const stmtCompleteJob = db.prepare(`
  UPDATE job_queue SET status = 'completed', result = @result, completed_at = @now WHERE id = @id
`);

const stmtFailJob = db.prepare(`
  UPDATE job_queue SET status = CASE WHEN attempts < max_attempts THEN 'pending' ELSE 'failed' END,
  error = @error WHERE id = @id
`);

const stmtGetJobsByTask = db.prepare("SELECT * FROM job_queue WHERE task_id = ? ORDER BY created_at");
const stmtGetJob = db.prepare("SELECT * FROM job_queue WHERE id = ?");
const stmtDeleteJobsByTask = db.prepare("DELETE FROM job_queue WHERE task_id = ?");

function rowToJob(row: Record<string, unknown>): JobRecord {
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    type: row.type as string,
    status: row.status as JobRecord["status"],
    priority: row.priority as number,
    payload: row.payload as string,
    result: (row.result as string) || null,
    error: (row.error as string) || null,
    attempts: row.attempts as number,
    maxAttempts: row.max_attempts as number,
    createdAt: row.created_at as string,
    startedAt: (row.started_at as string) || null,
    completedAt: (row.completed_at as string) || null,
  };
}

export function createJob(job: {
  id: string;
  taskId: string;
  type: string;
  priority?: number;
  payload: string;
  maxAttempts?: number;
}): void {
  stmtInsertJob.run({
    id: job.id,
    task_id: job.taskId,
    type: job.type,
    priority: job.priority ?? 0,
    payload: job.payload,
    max_attempts: job.maxAttempts ?? 3,
    created_at: new Date().toISOString(),
  });
}

export function claimNextJob(): JobRecord | null {
  const row = stmtClaimJob.get({ now: new Date().toISOString() }) as Record<string, unknown> | undefined;
  return row ? rowToJob(row) : null;
}

export function completeJob(id: string, result: string): void {
  stmtCompleteJob.run({ id, result, now: new Date().toISOString() });
}

export function failJob(id: string, error: string): void {
  stmtFailJob.run({ id, error });
}

export function getJobsByTaskId(taskId: string): JobRecord[] {
  const rows = stmtGetJobsByTask.all(taskId) as Record<string, unknown>[];
  return rows.map(rowToJob);
}

export function getJobById(id: string): JobRecord | null {
  const row = stmtGetJob.get(id) as Record<string, unknown> | undefined;
  return row ? rowToJob(row) : null;
}

export function deleteJobsByTaskId(taskId: string): number {
  const result = stmtDeleteJobsByTask.run(taskId);
  return result.changes;
}
