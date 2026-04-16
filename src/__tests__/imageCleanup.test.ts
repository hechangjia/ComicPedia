import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

type ImageStorageModule = typeof import("@/lib/server/imageStorage");

let tempDir: string | undefined;
let cwdSpy: ReturnType<typeof vi.spyOn> | undefined;

async function loadIsolatedImageStorage(): Promise<ImageStorageModule> {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "comicpedia-image-cleanup-test-"));
  vi.resetModules();
  cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);
  return import("@/lib/server/imageStorage");
}

afterEach(() => {
  cwdSpy?.mockRestore();
  cwdSpy = undefined;
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("image cleanup scan and purge", () => {
  it("reports legacy public/output directories as reclaimable", async () => {
    const imageStorage = await loadIsolatedImageStorage();
    const outputDir = path.join(tempDir!, "public", "output", "legacy-task");
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "panel_01.png"), "legacy-image");
    fs.writeFileSync(
      path.join(tempDir!, "public", "output", ".dirmap.json"),
      JSON.stringify({ "task-legacy": "legacy-task" }, null, 2),
      "utf8",
    );

    const scan = imageStorage.scanOrphanImages(new Set());

    expect(scan.legacyOutputDirs).toEqual(["legacy-task"]);
    expect(scan.reclaimableBytes).toBeGreaterThan(0);
  });

  it("purges legacy public/output directories and prunes the dir map", async () => {
    const imageStorage = await loadIsolatedImageStorage();
    const outputBase = path.join(tempDir!, "public", "output");
    const outputDir = path.join(outputBase, "legacy-task");
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "panel_01.png"), "legacy-image");
    fs.writeFileSync(
      path.join(outputBase, ".dirmap.json"),
      JSON.stringify({
        "task-legacy": "legacy-task",
        "task-missing": "missing-task",
      }, null, 2),
      "utf8",
    );

    const scan = imageStorage.scanOrphanImages(new Set());
    const result = imageStorage.purgeOrphanImages(scan);

    expect(result.deletedFiles).toBe(1);
    expect(result.freedBytes).toBeGreaterThan(0);
    expect(fs.existsSync(outputDir)).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(outputBase, ".dirmap.json"), "utf8"))).toEqual({});
  });
});
