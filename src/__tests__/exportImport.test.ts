import { describe, it, expect, vi, beforeEach } from "vitest";

// We need to test internal helpers too, so we test via the public API
// and also import internals where possible.

// Mock jszip
const mockFile = vi.fn();
const mockFolder = vi.fn().mockReturnValue({ file: mockFile, forEach: vi.fn() });
const mockGenerateAsync = vi.fn().mockResolvedValue(new Blob(["zip"]));
const mockLoadAsync = vi.fn();

vi.mock("jszip", () => ({
  default: class MockJSZip {
    file = mockFile;
    folder = mockFolder;
    generateAsync = mockGenerateAsync;
    static loadAsync = mockLoadAsync;
  },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock browser APIs
global.URL.createObjectURL = vi.fn(() => "blob:mock");
global.URL.revokeObjectURL = vi.fn();

const mockClick = vi.fn();
const mockAppendChild = vi.fn();
const mockRemoveChild = vi.fn();
Object.defineProperty(global, "document", {
  value: {
    createElement: vi.fn(() => ({ click: mockClick, href: "", download: "" })),
    body: { appendChild: mockAppendChild, removeChild: mockRemoveChild },
  },
  writable: true,
});

import {
  exportCharactersAsZip,
  exportTasksAsZip,
  importDataFromFile,
} from "@/lib/exportImport";

describe("exportImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(["img"], { type: "image/png" })),
    });
  });

  // ── Export ──

  describe("exportCharactersAsZip", () => {
    it("does nothing for empty array", async () => {
      await exportCharactersAsZip([]);
      expect(mockFolder).not.toHaveBeenCalled();
    });

    it("exports characters with manifest", async () => {
      const chars = [
        { id: "c1", name: "Hero", appearance: "tall", referenceEntries: [] },
      ] as any;

      await exportCharactersAsZip(chars);

      // Should write data.json and manifest.json
      const fileCalls = mockFile.mock.calls;
      const dataCall = fileCalls.find((c: any) => c[0] === "data.json");
      const manifestCall = fileCalls.find((c: any) => c[0] === "manifest.json");

      expect(dataCall).toBeDefined();
      expect(manifestCall).toBeDefined();

      const manifest = JSON.parse(manifestCall![1]);
      expect(manifest.version).toBe(1);
      expect(manifest.type).toBe("characters");
      expect(manifest.count).toBe(1);
      expect(manifest.app).toBe("comicpedia");
    });

    it("reports progress phases", async () => {
      const chars = [{ id: "c1", name: "Hero", appearance: "tall" }] as any;
      const progress: any[] = [];

      await exportCharactersAsZip(chars, (p) => progress.push({ ...p }));

      const phases = progress.map((p) => p.phase);
      expect(phases).toContain("collecting");
      expect(phases).toContain("packing");
      expect(phases).toContain("done");
    });
  });

  describe("exportTasksAsZip", () => {
    it("does nothing for empty array", async () => {
      await exportTasksAsZip([]);
      expect(mockFolder).not.toHaveBeenCalled();
    });

    it("exports tasks with correct type in manifest", async () => {
      const tasks = [{ id: "t1", status: "completed", script: {} }] as any;
      await exportTasksAsZip(tasks);

      const manifestCall = mockFile.mock.calls.find(
        (c: any) => c[0] === "manifest.json"
      );
      const manifest = JSON.parse(manifestCall![1]);
      expect(manifest.type).toBe("tasks");
    });
  });

  describe("export with image references", () => {
    it("collects /api/images/ refs and fetches them", async () => {
      const tasks = [
        {
          id: "t1",
          panels: [{ imageUrl: "/api/images/img001" }],
        },
      ] as any;

      await exportTasksAsZip(tasks);

      expect(mockFetch).toHaveBeenCalledWith("/api/images/img001");
    });

    it("collects file:// refs", async () => {
      const tasks = [
        {
          id: "t1",
          nested: { ref: "file://mykey" },
        },
      ] as any;

      await exportTasksAsZip(tasks);

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/images/mykey"
      );
    });

    it("handles fetch failures gracefully", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const tasks = [
        { id: "t1", img: "/api/images/missing" },
      ] as any;

      // Should not throw
      await exportTasksAsZip(tasks);

      const manifestCall = mockFile.mock.calls.find(
        (c: any) => c[0] === "manifest.json"
      );
      const manifest = JSON.parse(manifestCall![1]);
      expect(manifest.failedImages).toBe(1);
    });
  });

  // ── Import ──

  describe("importDataFromFile (JSON)", () => {
    it("imports JSON array of characters", async () => {
      const data = [{ id: "c1", name: "Hero", appearance: "tall" }];
      const file = new File([JSON.stringify(data)], "chars.json", {
        type: "application/json",
      });

      const result = await importDataFromFile(file);

      expect(result.type).toBe("characters");
      expect(result.items).toHaveLength(1);
      expect(result.imageCount).toBe(0);
    });

    it("imports JSON array of tasks", async () => {
      const data = [{ id: "t1", status: "completed", script: {} }];
      const file = new File([JSON.stringify(data)], "tasks.json", {
        type: "application/json",
      });

      const result = await importDataFromFile(file);

      expect(result.type).toBe("tasks");
      expect(result.items).toHaveLength(1);
    });

    it("wraps single object in array", async () => {
      const data = { id: "c1", name: "Solo", appearance: "short" };
      const file = new File([JSON.stringify(data)], "single.json", {
        type: "application/json",
      });

      const result = await importDataFromFile(file);

      expect(result.items).toHaveLength(1);
    });

    it("throws on invalid JSON", async () => {
      const file = new File(["not json{{{"], "bad.json", {
        type: "application/json",
      });

      await expect(importDataFromFile(file)).rejects.toThrow();
    });
  });

  describe("importDataFromFile (ZIP)", () => {
    it("throws when ZIP has no data.json", async () => {
      const mockZip = {
        file: vi.fn().mockReturnValue(null),
        folder: vi.fn().mockReturnValue({ forEach: vi.fn() }),
      };
      mockLoadAsync.mockResolvedValue(mockZip);

      const file = new File([new Uint8Array([0])], "test.zip", {
        type: "application/zip",
      });

      await expect(importDataFromFile(file)).rejects.toThrow(
        "ZIP does not contain data.json"
      );
    });

    it("imports ZIP with manifest and data", async () => {
      const manifest = {
        version: 1,
        type: "tasks",
        count: 1,
        imageCount: 0,
        exportedAt: "2026-01-01",
        app: "comicpedia",
      };
      const data = [{ id: "t1", status: "completed" }];

      const mockZip = {
        file: vi.fn((name: string) => {
          if (name === "manifest.json")
            return { async: () => Promise.resolve(JSON.stringify(manifest)) };
          if (name === "data.json")
            return { async: () => Promise.resolve(JSON.stringify(data)) };
          return null;
        }),
        folder: vi.fn().mockReturnValue({ forEach: vi.fn() }),
      };
      mockLoadAsync.mockResolvedValue(mockZip);

      const file = new File([new Uint8Array([0])], "backup.zip", {
        type: "application/zip",
      });

      const result = await importDataFromFile(file);

      expect(result.type).toBe("tasks");
      expect(result.items).toHaveLength(1);
    });

    it("infers character type when manifest is missing", async () => {
      const data = [{ id: "c1", name: "Hero", appearance: "tall" }];

      const mockZip = {
        file: vi.fn((name: string) => {
          if (name === "manifest.json") return null;
          if (name === "data.json")
            return { async: () => Promise.resolve(JSON.stringify(data)) };
          return null;
        }),
        folder: vi.fn().mockReturnValue({ forEach: vi.fn() }),
      };
      mockLoadAsync.mockResolvedValue(mockZip);

      const file = new File([new Uint8Array([0])], "chars.zip", {
        type: "application/zip",
      });

      const result = await importDataFromFile(file);
      expect(result.type).toBe("characters");
    });

    it("uploads images from ZIP and rewrites refs", async () => {
      const data = [{ id: "t1", img: "images/pic.png" }];
      const manifest = {
        version: 1,
        type: "tasks",
        count: 1,
        imageCount: 1,
        exportedAt: "2026-01-01",
        app: "comicpedia",
      };

      const imageEntries = new Map();
      imageEntries.set("pic", {
        name: "pic.png",
        dir: false,
        async: () => Promise.resolve(new Blob(["img"])),
      });

      const mockZip = {
        file: vi.fn((name: string) => {
          if (name === "manifest.json")
            return { async: () => Promise.resolve(JSON.stringify(manifest)) };
          if (name === "data.json")
            return { async: () => Promise.resolve(JSON.stringify(data)) };
          return null;
        }),
        folder: vi.fn().mockReturnValue({
          forEach: (cb: (path: string, entry: any) => void) => {
            imageEntries.forEach((entry, key) => {
              cb(`${key}.png`, entry);
            });
          },
        }),
      };
      mockLoadAsync.mockResolvedValue(mockZip);

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ref: "file://pic" }),
      });

      const file = new File([new Uint8Array([0])], "backup.zip", {
        type: "application/zip",
      });

      const result = await importDataFromFile(file);

      expect(result.imageCount).toBe(1);
      // The ref should be rewritten from "images/pic.png" to "file://pic"
      expect((result.items[0] as any).img).toBe("file://pic");
    });
  });

  // ── Round-trip ──

  describe("round-trip", () => {
    it("JSON import preserves data structure", async () => {
      const original = [
        { id: "c1", name: "Hero", appearance: "tall", tags: ["main"] },
        { id: "c2", name: "Villain", appearance: "dark", tags: ["enemy"] },
      ];

      const file = new File([JSON.stringify(original)], "chars.json", {
        type: "application/json",
      });

      const result = await importDataFromFile(file);

      expect(result.items).toEqual(original);
    });
  });
});
