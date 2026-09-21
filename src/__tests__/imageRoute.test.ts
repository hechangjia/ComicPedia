import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const readImageByKeyMock = vi.fn();
const readImageAsBase64Mock = vi.fn();
const resolveStoredImagePathMock = vi.fn();
const getImagePathMock = vi.fn();
const readFileSyncMock = vi.fn();
const existsSyncMock = vi.fn();

vi.mock("@/lib/server/imageStorage", () => ({
  readImageByKey: readImageByKeyMock,
  readImageAsBase64: readImageAsBase64Mock,
  resolveStoredImagePath: resolveStoredImagePathMock,
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
    resolveStoredImagePathMock.mockReset();
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
  it("does not read an untrusted registry path outside media storage", async () => {
    getImagePathMock.mockReturnValue("data/images-private/secret.png");
    resolveStoredImagePathMock.mockReturnValue(null);
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(Buffer.from("secret"));
    const { GET } = await import("@/app/api/images/[key]/route");
    const response = await GET(new NextRequest("http://localhost/api/images/safe"), { params: Promise.resolve({ key: "safe" }) });
    expect(response.status).toBe(404);
    expect(readFileSyncMock).not.toHaveBeenCalled();
  });

});
