import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";

// Use a real temp directory for integration-style tests
let testDir: string;
let previousDataDirectory: string | undefined;
let imageBase: string;
let trashBase: string;

// We need to override the module paths. Mock process.cwd to point to our temp dir.
const originalCwd = process.cwd;

beforeEach(() => {
  vi.resetModules();
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "comicpedia-imageStorage-"));
  previousDataDirectory = process.env.COMICPEDIA_DATA_DIR;
  process.env.COMICPEDIA_DATA_DIR = path.join(testDir, "data");
  imageBase = path.join(testDir, "data", "images");
  trashBase = path.join(testDir, "data", ".trash");
  fs.mkdirSync(imageBase, { recursive: true });
  fs.mkdirSync(trashBase, { recursive: true });
  process.cwd = () => testDir;
});

afterEach(() => {
  process.cwd = originalCwd;
  if (previousDataDirectory === undefined) delete process.env.COMICPEDIA_DATA_DIR;
  else process.env.COMICPEDIA_DATA_DIR = previousDataDirectory;
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

// Regression probes use only the suite-owned fixture directory.
describe("image storage integrity", () => {
  it("invalidates a cached miss after saving", async () => {
    const store = await import("@/lib/server/imageStorage");
    expect(store.readImageByKey("late_panel0_cur")).toBeNull();
    store.saveImageFile("late_panel0_cur", TINY_PNG_B64);
    expect(store.readImageByKey("late_panel0_cur")).not.toBeNull();
  });
  it("invalidates cached hits and misses across trash and restore", async () => {
    const store = await import("@/lib/server/imageStorage");
    store.saveImageFile("roundtrip_panel0_cur", TINY_PNG_B64);
    expect(store.readImageByKey("roundtrip_panel0_cur")).not.toBeNull();
    store.moveImagesToTrash("roundtrip");
    expect(store.readImageByKey("roundtrip_panel0_cur")).toBeNull();
    store.restoreImagesFromTrash("roundtrip");
    expect(store.readImageByKey("roundtrip_panel0_cur")).not.toBeNull();
  });
  it("cannot read or delete a sibling directory with the same prefix", async () => {
    const store = await import("@/lib/server/imageStorage");
    const sibling = path.join(testDir, "data", "images-private");
    fs.mkdirSync(sibling, { recursive: true });
    const filename = path.join(sibling, "private.png");
    fs.writeFileSync(filename, "private");
    expect(store.readImageAsBase64(filename)).toBeNull();
    expect(store.deleteImageFile(filename)).toBe(false);
    expect(fs.readFileSync(filename, "utf8")).toBe("private");
  });
  it("rejects an invalid key before creating directories", async () => {
    const store = await import("@/lib/server/imageStorage");
    expect(() => store.saveImageFile("../escape_panel0", TINY_PNG_B64)).toThrow();
    expect(fs.existsSync(path.join(testDir, "data", "escape"))).toBe(false);
  });
});

describe("media filesystem boundary variants", () => {
  it.each(["../escape", "..", "", "NUL", "C:escape"])("rejects destructive identifier %j before touching storage", async (id) => {
    const store = await import("@/lib/server/imageStorage");
    const sentinel = path.join(testDir, "data", "sentinel.txt");
    fs.writeFileSync(sentinel, "keep");
    for (const operation of [store.moveImagesToTrash, store.restoreImagesFromTrash, store.purgeTrashImages, store.deleteImagesByDir]) {
      expect(() => operation(id)).toThrow();
      expect(fs.readFileSync(sentinel, "utf8")).toBe("keep");
    }
  });
  it("does not follow a directory junction for read, write, or trash", async () => {
    const store = await import("@/lib/server/imageStorage");
    const outside = path.join(testDir, "private");
    fs.mkdirSync(outside);
    const sentinel = path.join(outside, "linked_panel0.png");
    fs.writeFileSync(sentinel, "private");
    const link = path.join(imageBase, "linked");
    fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
    try {
      expect(store.readImageByKey("linked_panel0")).toBeNull();
      expect(store.readImageAsBase64(path.join(link, "linked_panel0.png"))).toBeNull();
      expect(() => store.saveImageFile("linked_panel0", TINY_PNG_B64)).toThrow();
      expect(store.deleteImagesByDir("linked")).toBe(0);
      expect(store.moveImagesToTrash("linked")).toBe(0);
      expect(fs.readFileSync(sentinel, "utf8")).toBe("private");
    } finally {
      fs.unlinkSync(link);
    }
  });
  it("preserves an existing trash copy instead of overwriting it", async () => {
    const store = await import("@/lib/server/imageStorage");
    store.saveImageFile("collision_panel0", TINY_PNG_B64);
    store.moveImagesToTrash("collision");
    const trashFile = path.join(trashBase, "collision", "collision_panel0.png");
    fs.writeFileSync(trashFile, "original trash copy");
    store.saveImageFile("collision_panel0", TINY_PNG_B64);
    expect(() => store.moveImagesToTrash("collision")).toThrow();
    expect(fs.readFileSync(trashFile, "utf8")).toBe("original trash copy");
    expect(store.readImageByKey("collision_panel0")).not.toBeNull();
  });
});
