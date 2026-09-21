import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import "@/lib/server/db";
import { openDatabase } from "@/lib/server/databaseConnection";
import { getDataDirectory } from "@/lib/server/dataDirectory";
import { ArtworkRepository } from "@/lib/server/backup/repository";
import { exportArtworkArchive, previewArtworkArchive, restoreArtworkArchive } from "@/lib/server/backup/service";
import { ARTWORK_TABLES, readArtworkArchive } from "@/lib/server/backup/archive";
import { resolveStoredImagePath } from "@/lib/server/imageStorage";

const root = getDataDirectory();
const db = openDatabase(path.join(root, "comicpedia.db"));
const repo = new ArtworkRepository(db);
const now = "2026-09-21T00:00:00.000Z";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY9sAAAAASUVORK5CYII=", "base64");
function seed() {
  const script = { title: "Portable QA", topic: "QA", style: "anime", panels: [{ id: 1, scene: "QA", dialogue: "", imagePrompt: "QA", status: "completed", imageUrl: "file://original_panel0", imageVersions: [{ imageUrl: "file://original_panel0" }] }] };
  db.prepare("INSERT INTO tasks (id,status,progress,script,metadata,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run("task-qa", "completed", 100, JSON.stringify(script), JSON.stringify({ extensionData: { retained: true } }), now, now);
  for (const id of ["char-a", "char-b"]) db.prepare("INSERT INTO characters (id,name,appearance,avatar_url,created_at,updated_at) VALUES (?,?,?,?,?,?)").run(id, id, "{}", "file://original_panel0", now, now);
  db.prepare("INSERT INTO series (id,title,content_type,style,character_ids,episodes,cover_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").run("series-qa", "QA", "novel", "anime", '["char-a","char-b"]', JSON.stringify([{taskId:"task-qa",title:"One",episodeNumber:1,status:"completed"}]), "file://original_panel0", now, now);
  db.prepare("INSERT INTO character_relations (id,from_id,to_id,type,created_at,updated_at) VALUES (?,?,?,?,?,?)").run("relation-qa", "char-a", "char-b", "friend", Date.parse(now), Date.parse(now));
  fs.mkdirSync(path.join(root, "images", "original"), { recursive: true });
  fs.writeFileSync(path.join(root, "images", "original", "original_panel0.png"), png);
  db.prepare("INSERT INTO images (key,file_path,size,created_at) VALUES (?,?,?,?)").run("original_panel0", "data/images/original/original_panel0.png", png.length, now);
}
function clearRows() { for (const table of [...ARTWORK_TABLES, "task_jobs", "images"]) db.exec(`DELETE FROM ${table}`); }
function rows() { return ARTWORK_TABLES.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()); }
beforeEach(() => { db.exec("DROP TRIGGER IF EXISTS fail_restore"); clearRows(); seed(); });
describe("portable artwork repository and media publication", () => {
  it("preserves raw metadata and restores every family into an empty database with real image bytes", async () => {
    const bytes = await exportArtworkArchive(); const parsed = await readArtworkArchive(bytes);
    expect(parsed.assets.size).toBe(1); expect(parsed.manifest.records.tasks[0].metadata).toEqual({ extensionData: { retained: true } });
    clearRows(); const preview = await previewArtworkArchive(bytes);
    expect(preview.counts).toEqual({tasks:1,characters:2,series:1,character_relations:1});
    expect(Object.values(preview.conflicts).flat()).toEqual([]);
    const result = await restoreArtworkArchive(bytes, preview.revision);
    expect(result.images).toBe(1); expect(rows().map(family => family.length)).toEqual([1,2,1,1]);
    const media = db.prepare("SELECT key,file_path FROM images").get() as {key:string;file_path:string};
    expect(fs.readFileSync(resolveStoredImagePath(media.file_path)!)).toEqual(png);
    const restored = repo.snapshot().records;
    expect(JSON.stringify(restored)).not.toContain("original_panel0");
    expect(JSON.stringify(restored)).toContain(`file://${media.key}`);
    expect(db.prepare("SELECT * FROM task_jobs").all()).toEqual([]);
    // Re-export the restored archive, proving the image namespace is readable.
    expect((await readArtworkArchive(await exportArtworkArchive())).assets.size).toBe(1);
  });
  it("preview does not change rows or media; conflicts require explicit replacement", async () => {
    const bytes = await exportArtworkArchive(), before = rows();
    const directories = fs.readdirSync(path.join(root,"images"));
    const preview = await previewArtworkArchive(bytes);
    expect(preview.conflicts.tasks).toEqual(["task-qa"]); expect(rows()).toEqual(before);
    await expect(restoreArtworkArchive(bytes, preview.revision)).rejects.toMatchObject({status:409});
    expect(rows()).toEqual(before); expect(fs.readdirSync(path.join(root,"images"))).toEqual(directories);
    await expect(restoreArtworkArchive(bytes, preview.revision, true)).resolves.toMatchObject({images:1});
    expect(fs.readFileSync(path.join(root,"images","original","original_panel0.png"))).toEqual(png);
  });
  it("rejects a stale preview before publishing files", async () => {
    const bytes = await exportArtworkArchive(), preview = await previewArtworkArchive(bytes);
    db.exec("UPDATE tasks SET progress=99");
    const directories = fs.readdirSync(path.join(root,"images"));
    await expect(restoreArtworkArchive(bytes, preview.revision, true)).rejects.toThrow("过期");
    expect(fs.readdirSync(path.join(root,"images"))).toEqual(directories);
  });
  it("rolls back all entity families and removes only new files when the final registry write fails", async () => {
    const bytes = await exportArtworkArchive(); clearRows();
    db.prepare("INSERT INTO tasks (id,status,progress,created_at,updated_at) VALUES (?,?,?,?,?)").run("unrelated", "failed", 0, now, now);
    const preview = await previewArtworkArchive(bytes), before = rows();
    const directories = fs.readdirSync(path.join(root,"images"));
    db.exec("CREATE TRIGGER fail_restore BEFORE INSERT ON images BEGIN SELECT RAISE(ABORT,'injected registry failure'); END");
    await expect(restoreArtworkArchive(bytes, preview.revision)).rejects.toThrow("injected registry failure");
    expect(rows()).toEqual(before); expect(db.prepare("SELECT * FROM images").all()).toEqual([]);
    expect(fs.readdirSync(path.join(root,"images"))).toEqual(directories);
    expect(fs.readFileSync(path.join(root,"images","original","original_panel0.png"))).toEqual(png);
  });
  it("blocks export and restore while a persisted execution is active", async () => {
    const records = repo.snapshot().records;
    db.exec("UPDATE tasks SET status='deep_review_running'");
    expect(() => repo.snapshot()).toThrow("运行"); expect(() => repo.preview(records)).toThrow("运行");
    db.exec("UPDATE tasks SET status='completed'");
    db.prepare("INSERT INTO task_jobs (id,task_id,kind,status,created_at,updated_at) VALUES (?,?,?,?,?,?)").run("job", "task-qa", "panel", "generating", now, now);
    await expect(exportArtworkArchive()).rejects.toMatchObject({status:409});
  });
  it("rejects malformed nested arrays and broken references without writes", () => {
    for (const mutate of [
      (r: ReturnType<typeof repo.snapshot>["records"]) => { (r.tasks[0].script as {panels:unknown[]}).panels = [null]; },
      (r: ReturnType<typeof repo.snapshot>["records"]) => { r.tasks[0].metadata = []; },
      (r: ReturnType<typeof repo.snapshot>["records"]) => { r.tasks[0].tags = {}; },
      (r: ReturnType<typeof repo.snapshot>["records"]) => { r.characters[0].appearance = []; },
      (r: ReturnType<typeof repo.snapshot>["records"]) => { r.character_relations[0].to_id = "missing"; },
    ]) { const records = repo.snapshot().records; mutate(records); expect(() => repo.preview(records)).toThrow(); }
  });
  it("normalizes paused work and stale panel running flags; it never resumes imported jobs", () => {
    const records = repo.snapshot().records;
    records.tasks[0].status = "image_queue_paused";
    (records.tasks[0].script as {panels:{status:string}[]}).panels[0].status = "generating";
    records.tasks[0].metadata = { visualDiagnosisState:"running", serverScriptRunId:"old", queueSummary:{} };
    const preview = repo.preview(records); repo.restore(records, [], preview.revision, true);
    const task = repo.snapshot().records.tasks[0];
    expect(task.status).toBe("script_ready"); expect(task.metadata).toEqual({visualDiagnosisState:"idle"});
    expect((task.script as {panels:{status:string}[]}).panels[0].status).toBe("pending");
  });
});

it("blocks legacy client-side review flags even when task status is completed",()=>{
  for(const metadata of [{visualDiagnosisState:"running"},{visualRepairExecution:{status:"running"}},{visualRetrySummary:{status:"running"}}]) {
    db.prepare("UPDATE tasks SET metadata=?").run(JSON.stringify(metadata));
    expect(()=>repo.snapshot()).toThrow("运行");
  }
});
it("preserves completed repair history rather than dropping all execution metadata",()=>{
  const records=repo.snapshot().records;
  records.tasks[0].metadata={visualRepairExecution:{status:"completed",panelIndices:[0],mode:"patch"}};
  repo.restore(records,[],repo.preview(records).revision,true);
  expect(repo.snapshot().records.tasks[0].metadata).toEqual(records.tasks[0].metadata);
});
