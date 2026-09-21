import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll } from "vitest";
import { closeAllDatabases } from "../lib/server/databaseConnection";

// Vitest runs setup before each file's imports. Never inherit the user's data path.
const previousDirectory = process.env.COMICPEDIA_DATA_DIR;
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "comicpedia-suite-"));
process.env.COMICPEDIA_DATA_DIR = directory;

afterAll(() => {
  closeAllDatabases();
  // Exact directory returned by mkdtemp, not a mutable environment variable.
  fs.rmSync(directory, { recursive: true, force: true });
  if (previousDirectory === undefined) delete process.env.COMICPEDIA_DATA_DIR;
  else process.env.COMICPEDIA_DATA_DIR = previousDirectory;
});
