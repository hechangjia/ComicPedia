import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const saveImageFileMock = vi.fn();
const registerImageMock = vi.fn();

vi.mock("@/lib/server/imageStorage", () => ({
  saveImageFile: saveImageFileMock,
}));

vi.mock("@/lib/server/db", () => ({
  registerImage: registerImageMock,
}));

describe("/api/migrate/image POST", () => {
  beforeEach(() => {
    saveImageFileMock.mockReset();
    registerImageMock.mockReset();
  });

  it("requires a key query parameter", async () => {
    const { POST } = await import("@/app/api/migrate/image/route");
    const request = new NextRequest("http://localhost:3000/api/migrate/image", {
      method: "POST",
      body: new Uint8Array([1, 2, 3]),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "缺少 key 参数" });
  });

  it("rejects empty image uploads", async () => {
    const { POST } = await import("@/app/api/migrate/image/route");
    const request = new NextRequest("http://localhost:3000/api/migrate/image?key=task-1_panel0_cur", {
      method: "POST",
      body: new Uint8Array([]),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "空图片数据" });
    expect(saveImageFileMock).not.toHaveBeenCalled();
  });

  it("stores migrated image binaries through the canonical registry", async () => {
    saveImageFileMock.mockReturnValue({
      filePath: "data/images/task-1/task-1_panel0_cur.png",
      size: 123,
    });

    const { POST } = await import("@/app/api/migrate/image/route");
    const request = new NextRequest("http://localhost:3000/api/migrate/image?key=task-1_panel0_cur", {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: new Uint8Array([137, 80, 78, 71]),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(saveImageFileMock).toHaveBeenCalledWith(
      "task-1_panel0_cur",
      expect.stringMatching(/^data:image\/png;base64,/),
    );
    expect(registerImageMock).toHaveBeenCalledWith(
      "task-1_panel0_cur",
      "data/images/task-1/task-1_panel0_cur.png",
      123,
    );
    await expect(response.json()).resolves.toEqual({
      ref: "file://task-1_panel0_cur",
      size: 123,
    });
  });
});
