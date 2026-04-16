import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const readImageByKeyMock = vi.fn();
const readImageAsBase64Mock = vi.fn();
const getImagePathMock = vi.fn();
const readFileSyncMock = vi.fn();
const existsSyncMock = vi.fn();

vi.mock("@/lib/server/imageStorage", () => ({
  readImageByKey: readImageByKeyMock,
  readImageAsBase64: readImageAsBase64Mock,
}));

vi.mock("@/lib/server/db", () => ({
  getImagePath: getImagePathMock,
}));

vi.mock("fs", () => ({
  default: {
    readFileSync: readFileSyncMock,
    existsSync: existsSyncMock,
  },
}));

describe("/api/images/[key] GET cache behavior", () => {
  beforeEach(() => {
    readImageByKeyMock.mockReset();
    readImageAsBase64Mock.mockReset();
    getImagePathMock.mockReset();
    readFileSyncMock.mockReset();
    existsSyncMock.mockReset();
  });

  it("serves _cur keys with revalidating cache headers", async () => {
    getImagePathMock.mockReturnValue(null);
    readImageByKeyMock.mockReturnValue({
      absPath: "/tmp/task-1_panel0_cur.png",
      mime: "image/png",
    });
    readFileSyncMock.mockReturnValue(Buffer.from("img"));

    const { GET } = await import("@/app/api/images/[key]/route");
    const request = new NextRequest("http://localhost:3000/api/images/task-1_panel0_cur");
    const response = await GET(request, {
      params: Promise.resolve({ key: "task-1_panel0_cur" }),
    });

    expect(response.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
  });

  it("keeps versioned panel keys immutable for long-term caching", async () => {
    getImagePathMock.mockReturnValue(null);
    readImageByKeyMock.mockReturnValue({
      absPath: "/tmp/task-1_panel0_v1.png",
      mime: "image/png",
    });
    readFileSyncMock.mockReturnValue(Buffer.from("img"));

    const { GET } = await import("@/app/api/images/[key]/route");
    const request = new NextRequest("http://localhost:3000/api/images/task-1_panel0_v1");
    const response = await GET(request, {
      params: Promise.resolve({ key: "task-1_panel0_v1" }),
    });

    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
  });
});
