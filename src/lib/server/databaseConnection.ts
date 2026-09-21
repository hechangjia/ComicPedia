import Database from "better-sqlite3";

// Keep ownership across module reloads so resetModules/HMR cannot orphan handles.
const registryKey = Symbol.for("comicpedia.databaseConnections");
const globalRegistry = globalThis as typeof globalThis & {
  [registryKey]?: Set<Database.Database>;
};
const connections = globalRegistry[registryKey] ??= new Set<Database.Database>();

export function openDatabase(filename: string): Database.Database {
  for (const connection of connections) {
    if (!connection.open) connections.delete(connection);
  }
  const connection = new Database(filename);
  connections.add(connection);
  return connection;
}

/** Shutdown/fixture boundary only; never call while jobs are using the database. */
export function closeAllDatabases(): void {
  for (const connection of connections) {
    if (connection.open) connection.close();
    connections.delete(connection);
  }
}

/** Startup-only: journal-mode transitions may bypass SQLite's busy handler. */
export function enableWalMode(connection: Database.Database, timeoutMs = 5000): void {
  const deadline = performance.now() + timeoutMs;
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  while (true) {
    try {
      const mode = connection.pragma("journal_mode = WAL", { simple: true });
      if (mode !== "wal") throw new Error("SQLite WAL initialization failed");
      return;
    } catch (error) {
      const remaining = deadline - performance.now();
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "SQLITE_BUSY" || remaining <= 0) throw error;
      // No transaction is held here; allow the other startup process to finish.
      Atomics.wait(sleeper, 0, 0, Math.min(25, remaining));
    }
  }
}
