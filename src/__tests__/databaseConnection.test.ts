import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDatabase, closeAllDatabases } from "@/lib/server/databaseConnection";

const directories: string[] = [];
afterEach(() => {
  closeAllDatabases();
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("database connection ownership", () => {
  it("closes every handle idempotently and can reopen persisted data", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "comicpedia-connection-"));
    directories.push(directory);
    const filename = path.join(directory, "test.db");
    const first = openDatabase(filename);
    first.exec("CREATE TABLE example (value TEXT); INSERT INTO example VALUES ('kept')");
    const second = openDatabase(filename);
    closeAllDatabases();
    closeAllDatabases();
    expect(first.open).toBe(false);
    expect(second.open).toBe(false);
    const reopened = openDatabase(filename);
    expect(reopened.prepare("SELECT value FROM example").get()).toEqual({ value: "kept" });
    closeAllDatabases();
    fs.renameSync(filename, path.join(directory, "released.db"));
  });
  it("closes handles opened before a module reset", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "comicpedia-connection-"));
    directories.push(directory);
    const connection = openDatabase(path.join(directory, "reset.db"));
    vi.resetModules();
    const reloaded = await import("@/lib/server/databaseConnection");
    reloaded.closeAllDatabases();
    expect(connection.open).toBe(false);
  });

});
