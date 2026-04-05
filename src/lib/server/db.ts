import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { GenerateTask, Character, CharacterRelation, UserAPIConfigV2, ComicScript, TaskJobRecord } from "@/lib/types";
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

  CREATE TABLE IF NOT EXISTS task_jobs (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL,
    kind        TEXT NOT NULL,
    status      TEXT NOT NULL,
    panel_index INTEGER,
    provider    TEXT,
    model       TEXT,
    prompt_snapshot TEXT,
    output_file_key TEXT,
    last_error  TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    payload     TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_task_jobs_task_id ON task_jobs(task_id);
  CREATE INDEX IF NOT EXISTS idx_task_jobs_status ON task_jobs(status);
  CREATE INDEX IF NOT EXISTS idx_task_jobs_task_status ON task_jobs(task_id, status);

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

  CREATE TABLE IF NOT EXISTS character_relations (
    id TEXT PRIMARY KEY,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    type TEXT NOT NULL,
    label TEXT DEFAULT '',
    strength REAL DEFAULT 0.5,
    bidirectional INTEGER DEFAULT 1,
    evolution TEXT DEFAULT '[]',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_relations_from ON character_relations(from_id);
  CREATE INDEX IF NOT EXISTS idx_relations_to ON character_relations(to_id);

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
runAddColumnMigration("tasks", "tags TEXT DEFAULT '[]'");
runAddColumnMigration("tasks", "favorited INTEGER DEFAULT 0");
runAddColumnMigration("characters", "metadata TEXT");
runAddColumnMigration("characters", "personality TEXT");
runAddColumnMigration("task_jobs", "panel_index INTEGER");
runAddColumnMigration("task_jobs", "provider TEXT");
runAddColumnMigration("task_jobs", "model TEXT");
runAddColumnMigration("task_jobs", "prompt_snapshot TEXT");
runAddColumnMigration("task_jobs", "output_file_key TEXT");
runAddColumnMigration("task_jobs", "last_error TEXT");
runAddColumnMigration("task_jobs", "attempt_count INTEGER NOT NULL DEFAULT 0");
runAddColumnMigration("task_jobs", "payload TEXT");

// ============================================================
// Tasks CRUD
// ============================================================

const stmtInsertTask = db.prepare(`
  INSERT OR REPLACE INTO tasks (id, status, progress, script, character, error, metadata, tags, favorited, created_at, updated_at)
  VALUES (@id, @status, @progress, @script, @character, @error, @metadata, @tags, @favorited, @created_at, @updated_at)
`);

const stmtGetTask = db.prepare("SELECT * FROM tasks WHERE id = ?");
const stmtGetAllTasks = db.prepare("SELECT * FROM tasks ORDER BY created_at DESC");
const stmtGetAllTasksPaged = db.prepare("SELECT * FROM tasks ORDER BY created_at DESC LIMIT ? OFFSET ?");
const stmtCountTasks = db.prepare("SELECT COUNT(*) as total FROM tasks");
const stmtGetAllTaskIds = db.prepare("SELECT id FROM tasks");
const stmtDeleteTask = db.prepare("DELETE FROM tasks WHERE id = ?");
const stmtClearTasks = db.prepare("DELETE FROM tasks");
const stmtClearAllTaskJobs = db.prepare("DELETE FROM task_jobs");

const stmtPatchTaskTags = db.prepare("UPDATE tasks SET tags = @tags, updated_at = @updated_at WHERE id = @id");
const stmtPatchTaskFavorited = db.prepare("UPDATE tasks SET favorited = @favorited, updated_at = @updated_at WHERE id = @id");

const stmtUpsertTaskJob = db.prepare(`
  INSERT OR REPLACE INTO task_jobs
    (id, task_id, kind, status, panel_index, provider, model, prompt_snapshot, output_file_key, last_error, attempt_count, payload, created_at, updated_at)
  VALUES
    (@id, @task_id, @kind, @status, @panel_index, @provider, @model, @prompt_snapshot, @output_file_key, @last_error, @attempt_count, @payload, @created_at, @updated_at)
`);
const stmtListTaskJobsByTaskId = db.prepare("SELECT * FROM task_jobs WHERE task_id = ? ORDER BY created_at ASC, id ASC");
const stmtClearTaskJobsByTaskId = db.prepare("DELETE FROM task_jobs WHERE task_id = ?");

function taskToRow(task: GenerateTask) {
  // Pack non-core fields into a single metadata JSON column
  const metadata: Record<string, unknown> = {};
  if (task.qualityScore) metadata.qualityScore = task.qualityScore;
  if (task.visualQualityScore) metadata.visualQualityScore = task.visualQualityScore;
  if (task.reviewStatus !== undefined) metadata.reviewStatus = task.reviewStatus;
  if (task.panelReview !== undefined) metadata.panelReview = task.panelReview;
  if (task.visualRetrySummary !== undefined) metadata.visualRetrySummary = task.visualRetrySummary;
  if (task.lastReviewAt !== undefined) metadata.lastReviewAt = task.lastReviewAt;
  if (task.visualDiagnosisReport !== undefined) metadata.visualDiagnosisReport = task.visualDiagnosisReport;
  if (task.visualDiagnosisState !== undefined) metadata.visualDiagnosisState = task.visualDiagnosisState;
  if (task.visualDiagnosisStale !== undefined) metadata.visualDiagnosisStale = task.visualDiagnosisStale;
  if (task.lastDiagnosisAt !== undefined) metadata.lastDiagnosisAt = task.lastDiagnosisAt;
  if (task.scriptValidation) metadata.scriptValidation = task.scriptValidation;
  if (task.scriptRepairRounds) metadata.scriptRepairRounds = task.scriptRepairRounds;
  if (task.topicResearch) metadata.topicResearch = task.topicResearch;
  if (task.factPack) metadata.factPack = task.factPack;
  if (task.researchBrief) metadata.researchBrief = task.researchBrief;
  if (task.accuracyReview) metadata.accuracyReview = task.accuracyReview;
  if (task.accuracyErrorSummary) metadata.accuracyErrorSummary = task.accuracyErrorSummary;
  if (task.narrativeOutline) metadata.narrativeOutline = task.narrativeOutline;
  if (task.generationConfig) metadata.generationConfig = task.generationConfig;
  if (task.requestSnapshot) metadata.requestSnapshot = task.requestSnapshot;
  if (task.visualRepairExecution) metadata.visualRepairExecution = task.visualRepairExecution;
  if (task.queueSummary !== undefined) metadata.queueSummary = task.queueSummary;
  if (task.presetSnapshot !== undefined) metadata.presetSnapshot = task.presetSnapshot;

  return {
    id: task.id,
    status: task.status,
    progress: task.progress,
    script: task.script ? JSON.stringify(task.script) : null,
    character: task.character ? JSON.stringify(task.character) : null,
    error: task.error ?? null,
    metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
    tags: JSON.stringify(task.tags ?? []),
    favorited: task.favorited ? 1 : 0,
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
const VISUAL_DIAGNOSIS_STATE_VALUES = new Set<NonNullable<GenerateTask["visualDiagnosisState"]>>(["idle", "running", "succeeded", "failed", "skipped"]);
const VISUAL_DIAGNOSIS_SEVERITY_VALUES = new Set<NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["severity"]>>(["low", "medium", "high"]);
const VISUAL_DIAGNOSIS_CONFIDENCE_VALUES = new Set<NonNullable<NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["issues"][number]["confidence"]>>>(["low", "medium", "high"]);
const VISUAL_DIAGNOSIS_EVIDENCE_STRENGTH_VALUES = new Set<NonNullable<NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["issues"][number]["evidenceStrength"]>>>(["weak", "medium", "strong"]);
const VISUAL_DIAGNOSIS_ACTIONABILITY_VALUES = new Set<NonNullable<NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["issues"][number]["actionability"]>>>(["apply_directly", "confirm_first", "manual_only"]);
const VISUAL_REPAIR_MODE_VALUES = new Set<NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["repair"]["recommendedMode"]>>(["patch", "rewrite", "manual"]);
const VISUAL_DIAGNOSIS_PANEL_STATUS_VALUES = new Set<NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["status"]>>(["clean", "issues_found", "uncertain"]);
const VISUAL_DIAGNOSIS_DIMENSION_VALUES = new Set<NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["issues"][number]["affectedDimensions"]>[number]>([
  "textImageAlignment",
  "styleAdherence",
  "artifactScore",
  "compositionQuality",
  "crossPanelConsistency",
]);

function parseReviewStatus(value: unknown): GenerateTask["reviewStatus"] {
  return typeof value === "string" && REVIEW_STATUS_VALUES.has(value as GenerateTask["reviewStatus"])
    ? value as GenerateTask["reviewStatus"]
    : undefined;
}

function parseVisualDiagnosisState(value: unknown): GenerateTask["visualDiagnosisState"] {
  return typeof value === "string" && VISUAL_DIAGNOSIS_STATE_VALUES.has(value as NonNullable<GenerateTask["visualDiagnosisState"]>)
    ? value as GenerateTask["visualDiagnosisState"]
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

function parseAffectedDimensions(value: unknown): NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["issues"][number]["affectedDimensions"]> | undefined {
  if (!Array.isArray(value)) return undefined;
  if (value.some((dimension) => typeof dimension !== "string" || !VISUAL_DIAGNOSIS_DIMENSION_VALUES.has(dimension as NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["issues"][number]["affectedDimensions"]>[number]))) {
    return undefined;
  }
  return value as NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["issues"][number]["affectedDimensions"]>;
}

function parseVisualDiagnosisIssue(value: unknown): NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["issues"]>[number] | undefined {
  if (!value || typeof value !== "object") return undefined;

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.issueType !== "string" || !candidate.issueType.trim()) return undefined;
  if (typeof candidate.severity !== "string" || !VISUAL_DIAGNOSIS_SEVERITY_VALUES.has(candidate.severity as NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["severity"]>)) return undefined;
  const affectedDimensions = parseAffectedDimensions(candidate.affectedDimensions);
  if (!affectedDimensions) return undefined;
  if (typeof candidate.evidence !== "string" || !candidate.evidence.trim()) return undefined;
  if (typeof candidate.confidence !== "string" || !VISUAL_DIAGNOSIS_CONFIDENCE_VALUES.has(candidate.confidence as NonNullable<NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["issues"][number]["confidence"]>>)) return undefined;
  if (typeof candidate.evidenceStrength !== "string" || !VISUAL_DIAGNOSIS_EVIDENCE_STRENGTH_VALUES.has(candidate.evidenceStrength as NonNullable<NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["issues"][number]["evidenceStrength"]>>)) return undefined;
  if (typeof candidate.falsePositiveRisk !== "string" || !VISUAL_DIAGNOSIS_CONFIDENCE_VALUES.has(candidate.falsePositiveRisk as NonNullable<NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["issues"][number]["falsePositiveRisk"]>>)) return undefined;
  if (typeof candidate.actionability !== "string" || !VISUAL_DIAGNOSIS_ACTIONABILITY_VALUES.has(candidate.actionability as NonNullable<NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["issues"][number]["actionability"]>>)) return undefined;

  return {
    issueType: candidate.issueType,
    severity: candidate.severity as NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["severity"]>,
    affectedDimensions,
    evidence: candidate.evidence,
    confidence: candidate.confidence as NonNullable<NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["issues"][number]["confidence"]>>,
    evidenceStrength: candidate.evidenceStrength as NonNullable<NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["issues"][number]["evidenceStrength"]>>,
    falsePositiveRisk: candidate.falsePositiveRisk as NonNullable<NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["issues"][number]["falsePositiveRisk"]>>,
    actionability: candidate.actionability as NonNullable<NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["issues"][number]["actionability"]>>,
  };
}

function parseVisualRepairSuggestion(value: unknown): NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["repair"]> | undefined {
  if (!value || typeof value !== "object") return undefined;

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.recommendedMode !== "string" || !VISUAL_REPAIR_MODE_VALUES.has(candidate.recommendedMode as NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["repair"]["recommendedMode"]>)) return undefined;
  if (typeof candidate.rationale !== "string" || !candidate.rationale.trim()) return undefined;
  if (candidate.suggestedPrompt !== undefined && typeof candidate.suggestedPrompt !== "string") return undefined;
  if (candidate.suggestedNegativePrompt !== undefined && typeof candidate.suggestedNegativePrompt !== "string") return undefined;
  if (candidate.patchPositive !== undefined && (!Array.isArray(candidate.patchPositive) || candidate.patchPositive.some((item) => typeof item !== "string"))) return undefined;
  if (candidate.patchNegative !== undefined && (!Array.isArray(candidate.patchNegative) || candidate.patchNegative.some((item) => typeof item !== "string"))) return undefined;
  if (!Array.isArray(candidate.expectedImprovement) || candidate.expectedImprovement.some((item) => typeof item !== "string")) return undefined;

  return {
    recommendedMode: candidate.recommendedMode as NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["repair"]["recommendedMode"]>,
    rationale: candidate.rationale,
    suggestedPrompt: candidate.suggestedPrompt as string | undefined,
    suggestedNegativePrompt: candidate.suggestedNegativePrompt as string | undefined,
    patchPositive: candidate.patchPositive as string[] | undefined,
    patchNegative: candidate.patchNegative as string[] | undefined,
    expectedImprovement: candidate.expectedImprovement,
  };
}

function parseVisualDiagnosisPanel(value: unknown): NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"]>[number] | undefined {
  if (!value || typeof value !== "object") return undefined;

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.panelIndex !== "number") return undefined;
  if (typeof candidate.imageUrl !== "string" || !candidate.imageUrl.trim()) return undefined;
  if (typeof candidate.promptSnapshot !== "string") return undefined;
  if (typeof candidate.status !== "string" || !VISUAL_DIAGNOSIS_PANEL_STATUS_VALUES.has(candidate.status as NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["status"]>)) return undefined;
  if (typeof candidate.topIssueType !== "string" || !candidate.topIssueType.trim()) return undefined;
  if (typeof candidate.severity !== "string" || !VISUAL_DIAGNOSIS_SEVERITY_VALUES.has(candidate.severity as NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["severity"]>)) return undefined;
  if (!Array.isArray(candidate.issues)) return undefined;

  const issues = candidate.issues.flatMap((issue) => {
    const parsed = parseVisualDiagnosisIssue(issue);
    return parsed ? [parsed] : [];
  });
  if (issues.length !== candidate.issues.length) return undefined;

  const repair = parseVisualRepairSuggestion(candidate.repair);
  if (!repair) return undefined;

  return {
    panelIndex: candidate.panelIndex,
    imageUrl: candidate.imageUrl,
    promptSnapshot: candidate.promptSnapshot,
    status: candidate.status as NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["status"]>,
    topIssueType: candidate.topIssueType,
    severity: candidate.severity as NonNullable<NonNullable<GenerateTask["visualDiagnosisReport"]>["panels"][number]["severity"]>,
    issues,
    repair,
  };
}

function parseVisualDiagnosisReport(value: unknown): GenerateTask["visualDiagnosisReport"] {
  if (!value || typeof value !== "object") return undefined;

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.schemaVersion !== "number") return undefined;
  if (typeof candidate.generatedAt !== "string") return undefined;
  if (typeof candidate.sourceEvaluatedAt !== "string") return undefined;
  if (!candidate.model || typeof candidate.model !== "object") return undefined;
  const model = candidate.model as Record<string, unknown>;
  if (model.provider !== undefined && typeof model.provider !== "string") return undefined;
  if (model.model !== undefined && typeof model.model !== "string") return undefined;
  if (!candidate.summary || typeof candidate.summary !== "object") return undefined;
  const summary = candidate.summary as Record<string, unknown>;
  if (typeof summary.problemPanelCount !== "number") return undefined;
  if (typeof summary.highSeverityCount !== "number") return undefined;
  if (typeof summary.actionableCount !== "number") return undefined;
  if (typeof summary.crossPanelIssueCount !== "number") return undefined;
  if (!Array.isArray(candidate.panels)) return undefined;

  const panels = candidate.panels.flatMap((panel) => {
    const parsed = parseVisualDiagnosisPanel(panel);
    return parsed ? [parsed] : [];
  });
  if (panels.length !== candidate.panels.length) return undefined;

  return {
    schemaVersion: candidate.schemaVersion,
    generatedAt: candidate.generatedAt,
    sourceEvaluatedAt: candidate.sourceEvaluatedAt,
    model: {
      provider: model.provider as string | undefined,
      model: model.model as string | undefined,
    },
    summary: {
      problemPanelCount: summary.problemPanelCount,
      highSeverityCount: summary.highSeverityCount,
      actionableCount: summary.actionableCount,
      crossPanelIssueCount: summary.crossPanelIssueCount,
    },
    panels,
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
    visualDiagnosisReport: parseVisualDiagnosisReport(meta.visualDiagnosisReport),
    visualDiagnosisState: parseVisualDiagnosisState(meta.visualDiagnosisState),
    visualDiagnosisStale: typeof meta.visualDiagnosisStale === "boolean" ? meta.visualDiagnosisStale : undefined,
    lastDiagnosisAt: typeof meta.lastDiagnosisAt === "string" ? meta.lastDiagnosisAt : undefined,
    scriptValidation: meta.scriptValidation as GenerateTask["scriptValidation"],
    scriptRepairRounds: meta.scriptRepairRounds as number | undefined,
    topicResearch: meta.topicResearch as GenerateTask["topicResearch"],
    factPack: meta.factPack as GenerateTask["factPack"],
    researchBrief: meta.researchBrief as GenerateTask["researchBrief"],
    accuracyReview: meta.accuracyReview as GenerateTask["accuracyReview"],
    accuracyErrorSummary: meta.accuracyErrorSummary as GenerateTask["accuracyErrorSummary"],
    narrativeOutline: meta.narrativeOutline as GenerateTask["narrativeOutline"],
    generationConfig: meta.generationConfig as GenerateTask["generationConfig"],
    requestSnapshot: meta.requestSnapshot as GenerateTask["requestSnapshot"],
    visualRepairExecution: meta.visualRepairExecution as GenerateTask["visualRepairExecution"],
    queueSummary: meta.queueSummary as GenerateTask["queueSummary"],
    presetSnapshot: meta.presetSnapshot as GenerateTask["presetSnapshot"],
    tags: safeJsonParse<string[]>(row.tags as string | null) ?? [],
    favorited: (row.favorited as number) === 1,
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
  if (result.changes > 0) {
    stmtClearTaskJobsByTaskId.run(id);
  }
  return result.changes > 0;
}

export function clearAllTasks(): number {
  const result = stmtClearTasks.run();
  stmtClearAllTaskJobs.run();
  return result.changes;
}

export function getAllTaskIds(): string[] {
  const rows = stmtGetAllTaskIds.all() as { id: string }[];
  return rows.map((r) => r.id);
}

export function patchTask(id: string, patch: { tags?: string[]; favorited?: boolean }): boolean {
  const now = new Date().toISOString();
  let changed = false;
  if (patch.tags !== undefined) {
    const r = stmtPatchTaskTags.run({ id, tags: JSON.stringify(patch.tags), updated_at: now });
    if (r.changes > 0) changed = true;
  }
  if (patch.favorited !== undefined) {
    const r = stmtPatchTaskFavorited.run({ id, favorited: patch.favorited ? 1 : 0, updated_at: now });
    if (r.changes > 0) changed = true;
  }
  return changed;
}

function taskJobToRow(job: TaskJobRecord) {
  return {
    id: job.id,
    task_id: job.taskId,
    kind: job.kind,
    status: job.status,
    panel_index: job.panelIndex ?? null,
    provider: job.provider ?? null,
    model: job.model ?? null,
    prompt_snapshot: job.promptSnapshot ?? null,
    output_file_key: job.outputFileKey ?? null,
    last_error: job.lastError ?? null,
    attempt_count: job.attemptCount,
    payload: JSON.stringify(job.payload),
    created_at: job.createdAt,
    updated_at: job.updatedAt,
  };
}

function rowToTaskJob(row: Record<string, unknown>): TaskJobRecord {
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    kind: row.kind as TaskJobRecord["kind"],
    status: row.status as TaskJobRecord["status"],
    panelIndex: typeof row.panel_index === "number" ? row.panel_index : undefined,
    provider: (row.provider as string) ?? undefined,
    model: (row.model as string) ?? undefined,
    promptSnapshot: (row.prompt_snapshot as string) ?? undefined,
    outputFileKey: (row.output_file_key as string) ?? undefined,
    lastError: (row.last_error as string) ?? ((row.error as string) ?? undefined),
    attemptCount: typeof row.attempt_count === "number" ? row.attempt_count : 0,
    payload: safeJsonParse<Record<string, unknown>>(row.payload as string | null, {}) ?? {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function upsertTaskJob(job: TaskJobRecord): void {
  stmtUpsertTaskJob.run(taskJobToRow(job));
}

export function listTaskJobsByTaskId(taskId: string): TaskJobRecord[] {
  const rows = stmtListTaskJobsByTaskId.all(taskId) as Record<string, unknown>[];
  return rows.map(rowToTaskJob);
}

export function clearTaskJobsByTaskId(taskId: string): number {
  const result = stmtClearTaskJobsByTaskId.run(taskId);
  return result.changes;
}

// ============================================================
// Characters CRUD
// ============================================================

const stmtInsertChar = db.prepare(`
  INSERT OR REPLACE INTO characters
    (id, name, description, appearance, style, avatar_url, reference_entries, tags, variants, personality, metadata, created_at, updated_at)
  VALUES
    (@id, @name, @description, @appearance, @style, @avatar_url, @reference_entries, @tags, @variants, @personality, @metadata, @created_at, @updated_at)
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
    personality: c.personality ? JSON.stringify(c.personality) : null,
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
    personality: safeJsonParse(row.personality as string | null),
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
// Character Relations CRUD
// ============================================================

const stmtUpsertRelation = db.prepare(`
  INSERT OR REPLACE INTO character_relations
    (id, from_id, to_id, type, label, strength, bidirectional, evolution, created_at, updated_at)
  VALUES
    (@id, @from_id, @to_id, @type, @label, @strength, @bidirectional, @evolution, @created_at, @updated_at)
`);

const stmtGetRelation = db.prepare("SELECT * FROM character_relations WHERE id = ?");
const stmtGetRelationsFrom = db.prepare("SELECT * FROM character_relations WHERE from_id = ?");
const stmtGetRelationsTo = db.prepare("SELECT * FROM character_relations WHERE to_id = ?");
const stmtGetAllRelations = db.prepare("SELECT * FROM character_relations ORDER BY updated_at DESC");
const stmtDeleteRelation = db.prepare("DELETE FROM character_relations WHERE id = ?");
const stmtDeleteRelationsForChar = db.prepare("DELETE FROM character_relations WHERE from_id = ? OR to_id = ?");

function rowToRelation(row: Record<string, unknown>): CharacterRelation {
  return {
    id: row.id as string,
    fromId: row.from_id as string,
    toId: row.to_id as string,
    type: row.type as CharacterRelation["type"],
    label: (row.label as string) ?? "",
    strength: (row.strength as number) ?? 0.5,
    bidirectional: (row.bidirectional as number) === 1,
    evolution: safeJsonParse(row.evolution as string) ?? [],
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

export function upsertRelation(r: CharacterRelation): void {
  stmtUpsertRelation.run({
    id: r.id,
    from_id: r.fromId,
    to_id: r.toId,
    type: r.type,
    label: r.label,
    strength: r.strength,
    bidirectional: r.bidirectional ? 1 : 0,
    evolution: JSON.stringify(r.evolution),
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  });
}

export function getRelationById(id: string): CharacterRelation | null {
  const row = stmtGetRelation.get(id) as Record<string, unknown> | undefined;
  return row ? rowToRelation(row) : null;
}

export function getRelationsForCharacter(charId: string): CharacterRelation[] {
  const fromRows = stmtGetRelationsFrom.all(charId) as Record<string, unknown>[];
  const toRows = stmtGetRelationsTo.all(charId) as Record<string, unknown>[];
  const seen = new Set<string>();
  const results: CharacterRelation[] = [];
  for (const row of [...fromRows, ...toRows]) {
    const id = row.id as string;
    if (!seen.has(id)) {
      seen.add(id);
      results.push(rowToRelation(row));
    }
  }
  return results;
}

export function getAllRelations(): CharacterRelation[] {
  const rows = stmtGetAllRelations.all() as Record<string, unknown>[];
  return rows.map(rowToRelation);
}

export function deleteRelation(id: string): boolean {
  const result = stmtDeleteRelation.run(id);
  return result.changes > 0;
}

export function deleteRelationsForCharacter(charId: string): number {
  const result = stmtDeleteRelationsForChar.run(charId, charId);
  return result.changes;
}

// ============================================================
// Arc Snapshot Extraction (for series continuity)
// ============================================================

export interface ArcSnapshot {
  episodeNumber: number;
  taskId: string;
  title: string;
  characterSummary: string;
}

/**
 * Extract character appearance summaries from completed episodes in a series.
 * Parses script JSON from each task, finds panels where specified characters appear,
 * and produces a token-budgeted text summary per episode.
 *
 * @param taskIds - task IDs from series.episodes (in episode order)
 * @param characterNames - character names to search for in panels
 * @param maxEpisodes - max episodes to include (default 5)
 * @param tokensPerEpisode - approximate token budget per episode (default 200)
 */
export function getEpisodeArcSnapshots(
  taskIds: string[],
  characterNames: string[],
  maxEpisodes: number = 5,
  tokensPerEpisode: number = 200,
): ArcSnapshot[] {
  if (taskIds.length === 0 || characterNames.length === 0) return [];

  const snapshots: ArcSnapshot[] = [];
  // Process most recent episodes first, then reverse for chronological order
  const recentTaskIds = taskIds.slice(-maxEpisodes);

  for (let i = 0; i < recentTaskIds.length; i++) {
    const taskId = recentTaskIds[i];
    const row = stmtGetTask.get(taskId) as Record<string, unknown> | undefined;
    if (!row) continue;
    if (row.status !== "completed") continue;

    let script: ComicScript | undefined;
    try {
      script = safeJsonParse<ComicScript>(row.script as string | null);
    } catch { continue; }
    if (!script?.panels) continue;

    const relevantPanels: { scene: string; dialogue: string }[] = [];
    for (const panel of script.panels) {
      const combined = `${panel.scene || ""} ${panel.dialogue || ""}`.toLowerCase();
      const hasCharacter = characterNames.some(name => combined.includes(name.toLowerCase()));
      if (hasCharacter) {
        relevantPanels.push({ scene: panel.scene || "", dialogue: panel.dialogue || "" });
      }
    }

    if (relevantPanels.length === 0) continue;

    // Build summary within token budget (~4 chars per token)
    const charLimit = tokensPerEpisode * 4;
    let summary = "";
    for (const p of relevantPanels) {
      const line = p.dialogue
        ? `[${p.scene}] ${p.dialogue}`
        : `[${p.scene}]`;
      if (summary.length + line.length + 2 > charLimit) break;
      summary += (summary ? "; " : "") + line;
    }

    snapshots.push({
      episodeNumber: taskIds.indexOf(taskId) + 1,
      taskId,
      title: script.title || `Episode ${taskIds.indexOf(taskId) + 1}`,
      characterSummary: summary,
    });
  }

  return snapshots;
}

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
