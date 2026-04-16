import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const scanOrphanImagesMock = vi.fn();
const purgeOrphanImagesMock = vi.fn();

vi.mock("@/lib/server/imageStorage", () => ({
  scanOrphanImages: scanOrphanImagesMock,
  purgeOrphanImages: purgeOrphanImagesMock,
}));

describe("/api/cleanup/images route", () => {
  beforeEach(() => {
    scanOrphanImagesMock.mockReset();
    purgeOrphanImagesMock.mockReset();
  });

  it("returns dry-run cleanup data including legacy output directories", async () => {
    scanOrphanImagesMock.mockReturnValue({
      orphanDirs: ["task_foo_img0"],
      legacyOutputDirs: ["legacy-task"],
      duplicates: [{ keep: "task/foo_v0.png", remove: "task/foo.png", bytes: 12 }],
      reclaimableBytes: 36,
    });

    const { GET } = await import("@/app/api/cleanup/images/route");
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      orphanDirs: ["task_foo_img0"],
      legacyOutputDirs: ["legacy-task"],
      duplicates: [{ keep: "task/foo_v0.png", remove: "task/foo.png", bytes: 12 }],
      reclaimableBytes: 36,
      reclaimableMB: 0,
    });
  });

  it("requires explicit confirmation before deleting cleanup candidates", async () => {
    const { POST } = await import("@/app/api/cleanup/images/route");
    const request = new NextRequest("http://localhost:3000/api/cleanup/images", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Please send { \"confirm\": true } to execute cleanup",
    });
    expect(purgeOrphanImagesMock).not.toHaveBeenCalled();
  });

  it("reports removed legacy output directories after cleanup", async () => {
    scanOrphanImagesMock.mockReturnValue({
      orphanDirs: ["task_foo_img0"],
      legacyOutputDirs: ["legacy-task"],
      duplicates: [{ keep: "task/foo_v0.png", remove: "task/foo.png", bytes: 12 }],
      reclaimableBytes: 36,
    });
    purgeOrphanImagesMock.mockReturnValue({
      deletedFiles: 2,
      freedBytes: 36,
    });

    const { POST } = await import("@/app/api/cleanup/images/route");
    const request = new NextRequest("http://localhost:3000/api/cleanup/images", {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      deletedFiles: 2,
      freedBytes: 36,
      freedMB: 0,
      orphanDirsRemoved: 1,
      legacyOutputDirsRemoved: 1,
      duplicatesRemoved: 1,
    });
  });
});
