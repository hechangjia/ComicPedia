import Database from "better-sqlite3";
import { Worker } from "node:worker_threads";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { enableWalMode } from "@/lib/server/databaseConnection";

// Another actual SQLite connection owns the lock and releases it independently
// of the caller's event loop (which is synchronous during startup).
it("initializes WAL after a competing startup connection releases its lock", async () => {
  const filename = path.join(process.env.COMICPEDIA_DATA_DIR!, "wal-startup.db");
  const modulePath = createRequire(import.meta.url).resolve("better-sqlite3");
  const worker = new Worker(`const {parentPort,workerData}=require('node:worker_threads'); const DB=require(workerData.modulePath); const db=new DB(workerData.filename); db.exec('CREATE TABLE startup(value TEXT); BEGIN EXCLUSIVE'); parentPort.postMessage('locked'); setTimeout(()=>{db.exec('COMMIT');db.close();parentPort.postMessage('released');},180);`, { eval: true, workerData: { filename, modulePath } });
  try {
    await new Promise<void>((resolve, reject) => { worker.once("message", () => resolve()); worker.once("error", reject); });
    const db = new Database(filename, { timeout: 0 });
    try { enableWalMode(db); expect(db.pragma("journal_mode", { simple: true })).toBe("wal"); }
    finally { db.close(); }
  } finally { await worker.terminate(); }
});

describe("WAL startup retry boundaries", () => {
  it("retries only SQLITE_BUSY", () => {
    const error = Object.assign(new Error("read-only"), { code: "SQLITE_READONLY" });
    const pragma = vi.fn().mockImplementation(() => { throw error; });
    expect(() => enableWalMode({ pragma } as unknown as Database.Database)).toThrow(error);
    expect(pragma).toHaveBeenCalledOnce();
  });
  it("stops at the deadline instead of hiding a persistent lock", () => {
    const error = Object.assign(new Error("locked"), { code: "SQLITE_BUSY" });
    const pragma = vi.fn().mockImplementation(() => { throw error; });
    expect(() => enableWalMode({ pragma } as unknown as Database.Database, 0)).toThrow(error);
    expect(pragma).toHaveBeenCalledOnce();
  });
  it("does not claim WAL is active when SQLite returns another mode", () => {
    const pragma = vi.fn().mockReturnValue("delete");
    expect(() => enableWalMode({ pragma } as unknown as Database.Database)).toThrow("WAL");
  });
});
