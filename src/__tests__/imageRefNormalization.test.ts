import { describe, expect, it } from "vitest";
import { extractTaskImagesAsync, normalizeImageRefsToFileRefs } from "@/lib/server/imageExtractor";

describe("image ref normalization", () => {
  it("rewrites /api/images urls to file refs before persistence", () => {
    expect(normalizeImageRefsToFileRefs({
      imageUrl: "/api/images/task-1_panel0_cur",
      imageVersions: [{ imageUrl: "/api/images/task-1_panel0_v0", createdAt: 1 }],
    })).toEqual({
      imageUrl: "file://task-1_panel0_cur",
      imageVersions: [{ imageUrl: "file://task-1_panel0_v0", createdAt: 1 }],
    });
  });

  it("keeps canonical file refs unchanged while still extracting base64 images", async () => {
    const createdAt = new Date("2026-04-09T00:00:00.000Z");
    const updatedAt = new Date("2026-04-09T00:00:00.000Z");
    const task = await extractTaskImagesAsync({
      id: "task-1",
      status: "completed",
      progress: 100,
      createdAt,
      updatedAt,
      script: {
        title: "Task",
        topic: "Topic",
        style: "anime",
        panels: [
          {
            id: 1,
            scene: "Scene 1",
            dialogue: "Dialogue 1",
            imagePrompt: "Prompt 1",
            imageUrl: "/api/images/task-1_panel0_cur",
            imageVersions: [{ imageUrl: "file://task-1_panel0_v0", createdAt: 1 }],
            status: "completed",
          },
        ],
      },
    } as any);

    expect(task.createdAt).toBe(createdAt);
    expect(task.updatedAt).toBe(updatedAt);
    expect(task.script?.panels[0].imageUrl).toBe("file://task-1_panel0_cur");
    expect(task.script?.panels[0].imageVersions?.[0].imageUrl).toBe("file://task-1_panel0_v0");
  });
});
