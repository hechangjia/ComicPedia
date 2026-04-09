import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const saveImageFileAsyncMock = vi.fn();
const registerImageMock = vi.fn();

vi.mock("@/lib/server/imageStorage", () => ({
  saveImageFileAsync: saveImageFileAsyncMock,
}));

vi.mock("@/lib/server/db", () => ({
  registerImage: registerImageMock,
}));

describe("/api/save-image POST", () => {
  beforeEach(() => {
    saveImageFileAsyncMock.mockReset();
    registerImageMock.mockReset();
  });

  it("stores panel images under data/images and returns canonical refs", async () => {
    saveImageFileAsyncMock.mockResolvedValue({
      filePath: "data/images/task-1/task-1_panel0_cur.png",
      size: 123,
    });

    const { POST } = await import("@/app/api/save-image/route");
    const request = new NextRequest("http://localhost:3000/api/save-image", {
      method: "POST",
      body: JSON.stringify({
        taskId: "task-1",
        panelIndex: 0,
        base64Data: "data:image/png;base64,abc",
        title: "Task 1",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(saveImageFileAsyncMock).toHaveBeenCalledWith("task-1_panel0_cur", "data:image/png;base64,abc");
    expect(registerImageMock).toHaveBeenCalledWith(
      "task-1_panel0_cur",
      "data/images/task-1/task-1_panel0_cur.png",
      123,
    );
    expect(body).toEqual({
      success: true,
      ref: "file://task-1_panel0_cur",
      url: "/api/images/task-1_panel0_cur",
      key: "task-1_panel0_cur",
      size: 123,
    });
    expect(body).not.toHaveProperty("path");
    expect(body).not.toHaveProperty("absolutePath");
    expect(body).not.toHaveProperty("dirName");
  });

  it("stores reference images under the canonical image registry too", async () => {
    saveImageFileAsyncMock.mockResolvedValue({
      filePath: "data/images/task-1/task-1_ref0.png",
      size: 55,
    });

    const { POST } = await import("@/app/api/save-image/route");
    const request = new NextRequest("http://localhost:3000/api/save-image", {
      method: "POST",
      body: JSON.stringify({
        taskId: "task-1",
        refIndex: 0,
        type: "reference",
        base64Data: "data:image/png;base64,ref",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(saveImageFileAsyncMock).toHaveBeenCalledWith("task-1_ref0", "data:image/png;base64,ref");
    expect(body).toMatchObject({
      ref: "file://task-1_ref0",
      url: "/api/images/task-1_ref0",
    });
  });
});
