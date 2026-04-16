import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";

// Use a real temp directory for integration-style tests
let testDir: string;
let imageBase: string;
let trashBase: string;

// We need to override the module paths. Mock process.cwd to point to our temp dir.
const originalCwd = process.cwd;

beforeEach(() => {
  vi.resetModules();
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "comicpedia-imageStorage-"));
  imageBase = path.join(testDir, "data", "images");
  trashBase = path.join(testDir, "data", ".trash");
  fs.mkdirSync(imageBase, { recursive: true });
  fs.mkdirSync(trashBase, { recursive: true });
  process.cwd = () => testDir;
});

afterEach(() => {
  process.cwd = originalCwd;
  fs.rmSync(testDir, { recursive: true, force: true });
  vi.resetModules();
});

// Minimal 1x1 red PNG as base64
const TINY_PNG_B64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

describe("imageStorage", () => {
  it("saveImageFile writes file and returns path + size", async () => {
    const { saveImageFile } = await import("@/lib/server/imageStorage");
    const result = saveImageFile("task1_panel0_v0", TINY_PNG_B64);
    expect(result).not.toBeNull();
    expect(result!.size).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(testDir, result!.filePath))).toBe(true);
  });

  it("saveImageFile returns null for invalid base64", async () => {
    const { saveImageFile } = await import("@/lib/server/imageStorage");
    expect(saveImageFile("key", "not-a-data-uri")).toBeNull();
  });

  it("readImageByKey finds saved image", async () => {
    const { saveImageFile, readImageByKey } = await import("@/lib/server/imageStorage");
    saveImageFile("task2_panel1_v0", TINY_PNG_B64);
    const found = readImageByKey("task2_panel1_v0");
    expect(found).not.toBeNull();
    expect(found!.mime).toBe("image/png");
  });

  it("deleteImageFile removes the file", async () => {
    const { saveImageFile, deleteImageFile } = await import("@/lib/server/imageStorage");
    const result = saveImageFile("task3_panel0_v0", TINY_PNG_B64);
    expect(result).not.toBeNull();
    const absPath = path.join(testDir, result!.filePath);
    expect(fs.existsSync(absPath)).toBe(true);
    const deleted = deleteImageFile(result!.filePath);
    expect(deleted).toBe(true);
    expect(fs.existsSync(absPath)).toBe(false);
  });

});
