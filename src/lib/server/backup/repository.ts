import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { ARTWORK_TABLES, ArtworkArchiveError, type ArtworkRecords, type ArtworkTable } from "./archive";

const JSON_COLUMNS: Record<ArtworkTable, string[]> = {
  tasks: ["script", "character", "metadata", "tags"],
  characters: ["appearance", "reference_entries", "tags", "variants", "metadata", "personality"],
  series: ["character_ids", "episodes"], character_relations: ["evolution"],
};
const ACTIVE_TASKS = new Set(["pending", "scripting", "generating", "created", "research_running", "script_running", "calibrating", "image_queue_running", "deep_review_running"]);
const ACTIVE_JOBS = new Set(["queued", "calibrating", "generating", "persisting", "light_check"]);
const RESTORABLE = new Set(["completed", "failed", "script_ready", "image_queue_paused", "deep_review_paused"]);
type Row = Record<string, unknown>;
type Column = { name: string; type: string; notnull: number; pk: number };
const object = (value: unknown): value is Row => !!value && typeof value === "object" && !Array.isArray(value);
function validateNested(table: ArtworkTable, row: Row) {
  const invalid = () => { throw new ArtworkArchiveError("归档嵌套数据结构无效"); };
  const arrays = table === "tasks" ? ["tags"] : table === "characters" ? ["reference_entries", "tags", "variants"] : table === "series" ? ["character_ids", "episodes"] : ["evolution"];
  const objects = table === "tasks" ? ["script", "character", "metadata"] : table === "characters" ? ["appearance", "personality", "metadata"] : [];
  for (const key of arrays) if (row[key] !== null && !Array.isArray(row[key])) invalid();
  for (const key of objects) if (row[key] !== null && !object(row[key])) invalid();
  if (Array.isArray(row.tags) && row.tags.some(tag => typeof tag !== "string")) invalid();
  if (object(row.script)) {
    if (!Array.isArray(row.script.panels)) invalid();
    for (const panel of row.script.panels as unknown[]) {
      if (!object(panel) || !Number.isSafeInteger(panel.id) || !["pending", "generating", "completed", "failed"].includes(String(panel.status))) invalid();
      const item = panel as Row;
      for (const key of ["scene", "dialogue", "imagePrompt"]) if (typeof item[key] !== "string") invalid();
      if (item.imageVersions !== undefined && (!Array.isArray(item.imageVersions) || item.imageVersions.some(version => !object(version) || typeof version.imageUrl !== "string"))) invalid();
    }
  }
  if (Array.isArray(row.reference_entries) && row.reference_entries.some(entry => !object(entry) || typeof entry.imageUrl !== "string" || !Array.isArray(entry.versions))) invalid();
  if (Array.isArray(row.episodes) && row.episodes.some(episode => !object(episode) || typeof episode.taskId !== "string" || typeof episode.title !== "string" || !Number.isSafeInteger(episode.episodeNumber) || !["draft", "completed"].includes(String(episode.status)))) invalid();
}
const quoted = (name: string) => `"${name.replace(/"/g, '""')}"`;
export interface RestoredImage { key: string; filePath: string; size: number }

/** One transaction covers all artwork families, queue invalidation and the media registry. */
export class ArtworkRepository {
  constructor(private db: Database.Database) {}
  private rawState() {
    return {
      records: Object.fromEntries(ARTWORK_TABLES.map(table => [table, this.db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()])) as ArtworkRecords,
      jobs: this.db.prepare("SELECT * FROM task_jobs ORDER BY id").all() as Row[],
      images: this.db.prepare("SELECT * FROM images ORDER BY key").all() as Row[],
    };
  }
  private hasRunningMetadata(value: unknown) {
    let metadata: unknown = value;
    if (typeof value === "string") { try { metadata = JSON.parse(value); } catch { throw new ArtworkArchiveError("现有数据包含损坏 JSON，操作已中止",409); } }
    return object(metadata) && (metadata.visualDiagnosisState === "running" || object(metadata.visualRepairExecution) && metadata.visualRepairExecution.status === "running" || object(metadata.visualRetrySummary) && metadata.visualRetrySummary.status === "running");
  }
  private assertIdle(state: ReturnType<ArtworkRepository["rawState"]>) {
    if (state.records.tasks.some(task => ACTIVE_TASKS.has(String(task.status)) || this.hasRunningMetadata(task.metadata)) || state.jobs.some(job => ACTIVE_JOBS.has(String(job.status)))) {
      throw new ArtworkArchiveError("仍有生成或评审任务运行，请暂停并等待当前调用结束后再备份或恢复", 409);
    }
  }
  private revision(state: ReturnType<ArtworkRepository["rawState"]>) {
    return createHash("sha256").update(JSON.stringify(state)).digest("hex");
  }
  snapshot() {
    return this.db.transaction(() => {
      const state = this.rawState(); this.assertIdle(state);
      const records = Object.fromEntries(ARTWORK_TABLES.map(table => [table, state.records[table].map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => {
        if (JSON_COLUMNS[table].includes(key) && typeof value === "string") {
          try { return [key, JSON.parse(value)]; } catch { throw new ArtworkArchiveError("现有数据包含损坏 JSON，备份已中止", 409); }
        }
        return [key, value];
      })))])) as ArtworkRecords;
      return { records, revision: this.revision(state) };
    })();
  }
  validate(records: ArtworkRecords): void {
    for (const table of ARTWORK_TABLES) {
      const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as Column[];
      const names = new Set(columns.map(column => column.name));
      for (const row of records[table]) {
        if (Object.keys(row).some(key => !names.has(key)) || Object.keys(row).length !== names.size) throw new ArtworkArchiveError("归档字段与当前数据库版本不兼容");
        for (const column of columns) {
          const value = row[column.name];
          if (value === null) { if (column.notnull || column.pk) throw new ArtworkArchiveError("归档缺少必填字段"); continue; }
          if (JSON_COLUMNS[table].includes(column.name)) {
            if (!value || typeof value !== "object") throw new ArtworkArchiveError("归档结构化字段无效");
          } else if (column.type === "TEXT" && typeof value !== "string" || column.type === "INTEGER" && !Number.isSafeInteger(value) || column.type === "REAL" && (typeof value !== "number" || !Number.isFinite(value))) {
            throw new ArtworkArchiveError("归档字段类型无效");
          }
          if (["created_at", "updated_at"].includes(column.name) && column.type === "TEXT" && !Number.isFinite(Date.parse(String(value)))) throw new ArtworkArchiveError("归档日期无效");
        }
        validateNested(table, row);
        if (table === "tasks") {
          if (!RESTORABLE.has(String(row.status)) || typeof row.progress !== "number" || row.progress < 0 || row.progress > 100) throw new ArtworkArchiveError("归档任务状态无效或仍在运行");
          if (row.script !== null && (!row.script || typeof row.script !== "object" || !Array.isArray((row.script as Row).panels))) throw new ArtworkArchiveError("归档分镜结构无效");
        }
        if (table === "characters" && (!Array.isArray(row.reference_entries) || !Array.isArray(row.tags))) throw new ArtworkArchiveError("归档角色结构无效");
        if (table === "series" && !Array.isArray(row.episodes)) throw new ArtworkArchiveError("归档连载结构无效");
      }
    }
    const characters = new Set(records.characters.map(row => row.id));
    const tasks = new Set(records.tasks.map(row => row.id));
    for (const relation of records.character_relations) if (!characters.has(relation.from_id) || !characters.has(relation.to_id)) throw new ArtworkArchiveError("归档角色关系引用缺失");
    for (const series of records.series) {
      if (series.character_ids !== null && (!Array.isArray(series.character_ids) || series.character_ids.some(id => !characters.has(id)))) throw new ArtworkArchiveError("归档连载角色引用缺失");
      for (const episode of series.episodes as Row[]) if (!episode || !tasks.has(episode.taskId)) throw new ArtworkArchiveError("归档连载作品引用缺失");
    }
  }
  preview(records: ArtworkRecords) {
    this.validate(records);
    return this.db.transaction(() => {
      const state = this.rawState(); this.assertIdle(state);
      return {
        revision: this.revision(state),
        counts: Object.fromEntries(ARTWORK_TABLES.map(table => [table, records[table].length])),
        conflicts: Object.fromEntries(ARTWORK_TABLES.map(table => {
          const ids = new Set(state.records[table].map(row => row.id));
          return [table, records[table].filter(row => ids.has(row.id)).map(row => row.id)];
        })),
      };
    })();
  }
  restore(records: ArtworkRecords, images: RestoredImage[], expectedRevision: string, replace: boolean) {
    this.validate(records);
    return this.db.transaction(() => {
      const state = this.rawState(); this.assertIdle(state);
      if (this.revision(state) !== expectedRevision) throw new ArtworkArchiveError("恢复预览已过期，请重新预览", 409);
      for (const table of ARTWORK_TABLES) {
        const existing = new Set(state.records[table].map(row => row.id));
        if (!replace && records[table].some(row => existing.has(row.id))) throw new ArtworkArchiveError("存在同 ID 数据，需要明确确认替换", 409);
        for (const source of records[table]) {
          const row = { ...source };
          if (table === "tasks") {
            if (["image_queue_paused", "deep_review_paused"].includes(String(row.status))) row.status = row.script ? "script_ready" : "failed";
            if (object(row.script) && Array.isArray(row.script.panels)) {
              row.script = { ...row.script, panels: row.script.panels.map(panel => ({ ...panel, status: panel.status === "generating" ? "pending" : panel.status })) };
            }
            const metadata = { ...(row.metadata as Row ?? {}) };
            for (const key of ["serverScriptReplay", "serverScriptRunId", "queueSummary", "comfyuiRemotePendingCount"]) delete metadata[key];
            if (metadata.visualDiagnosisState === "running") metadata.visualDiagnosisState = "idle";
            if (object(metadata.visualRepairExecution) && metadata.visualRepairExecution.status === "running") metadata.visualRepairExecution = { ...metadata.visualRepairExecution, status: "failed" };
            if (object(metadata.visualRetrySummary) && metadata.visualRetrySummary.status === "running") metadata.visualRetrySummary = { ...metadata.visualRetrySummary, status: "failed" };
            row.metadata = metadata;
            this.db.prepare("DELETE FROM task_jobs WHERE task_id = ?").run(String(row.id));
          }
          const keys = Object.keys(row);
          const encoded = keys.map(key => JSON_COLUMNS[table].includes(key) && row[key] !== null ? JSON.stringify(row[key]) : row[key]);
          const assignments = keys.filter(key => key !== "id").map(key => `${quoted(key)}=excluded.${quoted(key)}`).join(",");
          this.db.prepare(`INSERT INTO ${table} (${keys.map(quoted).join(",")}) VALUES (${keys.map(() => "?").join(",")}) ON CONFLICT(id) DO UPDATE SET ${assignments}`).run(...encoded);
        }
      }
      const insert = this.db.prepare("INSERT INTO images (key,file_path,size,created_at) VALUES (?,?,?,?)");
      for (const image of images) insert.run(image.key, image.filePath, image.size, new Date().toISOString());
      return { counts: Object.fromEntries(ARTWORK_TABLES.map(table => [table, records[table].length])), images: images.length };
    }).immediate();
  }
}
