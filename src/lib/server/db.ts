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
    metadata          TEXT,
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

`);


function runAddColumnMigration(table: string, columnDDL: string) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDDL}`);
  } catch (error) {
    if (error instanceof Error && /duplicate column name/i.test(error.message)) {
      return;
    }
    throw error;
  }
}

// ── Schema migration: add extensible metadata column ──
runAddColumnMigration("tasks", "metadata TEXT");
runAddColumnMigration("characters", "metadata TEXT");

// ============================================================
// Tasks CRUD
// ============================================================

const stmtInsertTask = db.prepare(`
  INSERT OR REPLACE INTO tasks (id, status, progress, script, character, error, metadata, created_at, updated_at)
  VALUES (@id, @status, @progress, @script, @character, @error, @metadata, @created_at, @updated_at)
`);

const stmtGetTask = db.prepare("SELECT * FROM tasks WHERE id = ?");
const stmtGetAllTasks = db.prepare("SELECT * FROM tasks ORDER BY created_at DESC");
const stmtGetAllTasksPaged = db.prepare("SELECT * FROM tasks ORDER BY created_at DESC LIMIT ? OFFSET ?");
const stmtCountTasks = db.prepare("SELECT COUNT(*) as total FROM tasks");
const stmtGetAllTaskIds = db.prepare("SELECT id FROM tasks");
const stmtDeleteTask = db.prepare("DELETE FROM tasks WHERE id = ?");
const stmtClearTasks = db.prepare("DELETE FROM tasks");

function taskToRow(task: GenerateTask) {
  // Pack non-core fields into a single metadata JSON column
  const metadata: Record<string, unknown> = {};
  if (task.qualityScore) metadata.qualityScore = task.qualityScore;
  if (task.visualQualityScore) metadata.visualQualityScore = task.visualQualityScore;
  if (task.reviewStatus !== undefined) metadata.reviewStatus = task.reviewStatus;
  if (task.panelReview !== undefined) metadata.panelReview = task.panelReview;
  if (task.visualRetrySummary !== undefined) metadata.visualRetrySummary = task.visualRetrySummary;
  if (task.lastReviewAt !== undefined) metadata.lastReviewAt = task.lastReviewAt;
  if (task.scriptValidation) metadata.scriptValidation = task.scriptValidation;
  if (task.scriptRepairRounds) metadata.scriptRepairRounds = task.scriptRepairRounds;
  if (task.topicResearch) metadata.topicResearch = task.topicResearch;
  if (task.factPack) metadata.factPack = task.factPack;
  if (task.researchBrief) metadata.researchBrief = task.researchBrief;
  if (task.accuracyReview) metadata.accuracyReview = task.accuracyReview;
  if (task.accuracyErrorSummary) metadata.accuracyErrorSummary = task.accuracyErrorSummary;
  if (task.narrativeOutline) metadata.narrativeOutline = task.narrativeOutline;
  if (task.generationConfig) metadata.generationConfig = task.generationConfig;

  return {
    id: task.id,
    status: task.status,
    progress: task.progress,
    script: task.script ? JSON.stringify(task.script) : null,
    character: task.character ? JSON.stringify(task.character) : null,
    error: task.error ?? null,
    metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
    created_at: task.createdAt instanceof Date ? task.createdAt.toISOString() : String(task.createdAt),
    updated_at: task.updatedAt instanceof Date ? task.updatedAt.toISOString() : String(task.updatedAt),
  };
}

/** Safe JSON.parse — returns undefined on corrupted data instead of crashing */
function safeJsonParse<T>(json: string | null | undefined, fallback?: T): T | undefined {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch (err) {
    console.error('[DB] JSON parse failed for data:', json.slice(0, 100), err);
    return fallback;
  }
}

const REVIEW_STATUS_VALUES = new Set<GenerateTask["reviewStatus"]>(["unreviewed", "reviewed", "needs_repair"]);
const PANEL_REVIEW_STATUS_VALUES = new Set<NonNullable<GenerateTask["panelReview"]>[number]["status"]>(["reviewed", "needs_repair", "retrying", "failed"]);
const VISUAL_RETRY_CYCLE_STATUS_VALUES = new Set<NonNullable<GenerateTask["visualRetrySummary"]>["status"]>(["running", "completed", "failed", "skipped"]);
const VISUAL_RETRY_OUTCOME_STATUS_VALUES = new Set<NonNullable<NonNullable<GenerateTask["visualRetrySummary"]>["outcomes"]>[number]["status"]>(["retrying", "completed", "failed"]);

function parseReviewStatus(value: unknown): GenerateTask["reviewStatus"] {
  return typeof value === "string" && REVIEW_STATUS_VALUES.has(value as GenerateTask["reviewStatus"])
    ? value as GenerateTask["reviewStatus"]
    : undefined;
}

function parsePanelReview(value: unknown): GenerateTask["panelReview"] {
  if (!Array.isArray(value)) return undefined;

  const panelReview = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.panelIndex !== "number" || typeof candidate.score !== "number") return [];
    if (typeof candidate.status !== "string" || !PANEL_REVIEW_STATUS_VALUES.has(candidate.status as NonNullable<GenerateTask["panelReview"]>[number]["status"])) return [];
    if (!Array.isArray(candidate.issues) || candidate.issues.some((issue) => typeof issue !== "string")) return [];

    return [{
      panelIndex: candidate.panelIndex,
      status: candidate.status as NonNullable<GenerateTask["panelReview"]>[number]["status"],
      score: candidate.score,
      issues: candidate.issues,
    }];
  });

  return panelReview;
}

function parseVisualRetrySummary(value: unknown): GenerateTask["visualRetrySummary"] {
  if (!value || typeof value !== "object") return undefined;

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.status !== "string" || !VISUAL_RETRY_CYCLE_STATUS_VALUES.has(candidate.status as NonNullable<GenerateTask["visualRetrySummary"]>["status"])) return undefined;
  if (typeof candidate.startedAt !== "string") return undefined;
  if (candidate.finishedAt !== undefined && typeof candidate.finishedAt !== "string") return undefined;
  if (typeof candidate.initialOverallScore !== "number") return undefined;
  if (candidate.finalOverallScore !== undefined && typeof candidate.finalOverallScore !== "number") return undefined;
  if (!Array.isArray(candidate.attemptedPanels) || candidate.attemptedPanels.some((panelIndex) => typeof panelIndex !== "number")) return undefined;
  if (!Array.isArray(candidate.outcomes)) return undefined;

  const outcomes = candidate.outcomes.flatMap((outcome) => {
    if (!outcome || typeof outcome !== "object") return [];
    const parsed = outcome as Record<string, unknown>;
    if (typeof parsed.panelIndex !== "number") return [];
    if (typeof parsed.status !== "string" || !VISUAL_RETRY_OUTCOME_STATUS_VALUES.has(parsed.status as NonNullable<NonNullable<GenerateTask["visualRetrySummary"]>["outcomes"]>[number]["status"])) return [];
    return [{
      panelIndex: parsed.panelIndex,
      status: parsed.status as NonNullable<NonNullable<GenerateTask["visualRetrySummary"]>["outcomes"]>[number]["status"],
    }];
  });

  if (outcomes.length !== candidate.outcomes.length) return undefined;

  return {
    status: candidate.status as NonNullable<GenerateTask["visualRetrySummary"]>["status"],
    startedAt: candidate.startedAt,
    finishedAt: candidate.finishedAt as string | undefined,
    initialOverallScore: candidate.initialOverallScore,
    finalOverallScore: candidate.finalOverallScore as number | undefined,
    attemptedPanels: candidate.attemptedPanels,
    outcomes,
  };
}

function rowToTask(row: Record<string, unknown>): GenerateTask {
  const meta = safeJsonParse<Record<string, unknown>>(row.metadata as string | null) ?? {};

  return {
    id: row.id as string,
    status: row.status as GenerateTask["status"],
    progress: row.progress as number,
    script: safeJsonParse(row.script as string | null),
    character: safeJsonParse(row.character as string | null),
    error: (row.error as string) ?? undefined,
    qualityScore: meta.qualityScore as GenerateTask["qualityScore"],
    visualQualityScore: meta.visualQualityScore as GenerateTask["visualQualityScore"],
    reviewStatus: parseReviewStatus(meta.reviewStatus),
    panelReview: parsePanelReview(meta.panelReview),
    visualRetrySummary: parseVisualRetrySummary(meta.visualRetrySummary),
    lastReviewAt: typeof meta.lastReviewAt === "string" ? meta.lastReviewAt : undefined,
    scriptValidation: meta.scriptValidation as GenerateTask["scriptValidation"],
    scriptRepairRounds: meta.scriptRepairRounds as number | undefined,
    topicResearch: meta.topicResearch as GenerateTask["topicResearch"],
    factPack: meta.factPack as GenerateTask["factPack"],
    researchBrief: meta.researchBrief as GenerateTask["researchBrief"],
    accuracyReview: meta.accuracyReview as GenerateTask["accuracyReview"],
    accuracyErrorSummary: meta.accuracyErrorSummary as GenerateTask["accuracyErrorSummary"],
    narrativeOutline: meta.narrativeOutline as GenerateTask["narrativeOutline"],
    generationConfig: meta.generationConfig as GenerateTask["generationConfig"],
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
    (id, name, description, appearance, style, avatar_url, reference_entries, tags, variants, metadata, created_at, updated_at)
  VALUES
    (@id, @name, @description, @appearance, @style, @avatar_url, @reference_entries, @tags, @variants, @metadata, @created_at, @updated_at)
`);

const stmtGetChar = db.prepare("SELECT * FROM characters WHERE id = ?");
const stmtGetAllChars = db.prepare("SELECT * FROM characters ORDER BY updated_at DESC");
const stmtGetAllCharsPaged = db.prepare("SELECT * FROM characters ORDER BY updated_at DESC LIMIT ? OFFSET ?");
const stmtCountChars = db.prepare("SELECT COUNT(*) as total FROM characters");
const stmtDeleteChar = db.prepare("DELETE FROM characters WHERE id = ?");
const stmtClearChars = db.prepare("DELETE FROM characters");

function parseCharacterVisualScore(value: unknown): Character["visualScore"] {
  if (!value || typeof value !== "object") return undefined;

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.overall !== "number"
    || typeof candidate.featureClarity !== "number"
    || typeof candidate.consistency !== "number"
    || typeof candidate.imageQuality !== "number"
    || typeof candidate.evaluatedAt !== "string"
  ) {
    return undefined;
  }
  if (!Array.isArray(candidate.issues) || candidate.issues.some((issue) => typeof issue !== "string")) return undefined;
  if (!Array.isArray(candidate.suggestions) || candidate.suggestions.some((suggestion) => typeof suggestion !== "string")) return undefined;

  return {
    overall: candidate.overall,
    featureClarity: candidate.featureClarity,
    consistency: candidate.consistency,
    imageQuality: candidate.imageQuality,
    issues: candidate.issues,
    suggestions: candidate.suggestions,
    evaluatedAt: candidate.evaluatedAt,
  };
}

function charToRow(c: Character) {
  const metadata: Record<string, unknown> = {};
  if (c.visualScore !== undefined) metadata.visualScore = c.visualScore;
  if (c.reviewStatus !== undefined) metadata.reviewStatus = c.reviewStatus;
  if (c.lastReviewAt !== undefined) metadata.lastReviewAt = c.lastReviewAt;

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
    metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

function rowToChar(row: Record<string, unknown>): Character {
  const meta = safeJsonParse<Record<string, unknown>>(row.metadata as string | null) ?? {};

  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    appearance: safeJsonParse(row.appearance as string) ?? { gender: '', age: '', hair: '', eyes: '', clothing: '' },
    style: row.style as Character["style"],
    avatarUrl: (row.avatar_url as string) ?? null,
    referenceEntries: safeJsonParse(row.reference_entries as string) ?? [],
    tags: safeJsonParse(row.tags as string) ?? [],
    variants: safeJsonParse(row.variants as string | null),
    visualScore: parseCharacterVisualScore(meta.visualScore),
    reviewStatus: parseReviewStatus(meta.reviewStatus),
    lastReviewAt: typeof meta.lastReviewAt === "string" ? meta.lastReviewAt : undefined,
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
    characterIds: safeJsonParse(row.character_ids as string | null),
    episodes: safeJsonParse(row.episodes as string) ?? [],
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
  if (!row) return null;
  return safeJsonParse<UserAPIConfigV2>(row.data) ?? null;
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
