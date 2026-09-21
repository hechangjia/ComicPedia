import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { DELETE } from "@/app/api/tasks/route";
import { DELETE as deleteOne } from "@/app/api/tasks/[id]/route";
import { getTaskById, getTrashItem, upsertTask, registerImage, getImagePath, deleteImagesByPrefix } from "@/lib/server/db";
import { POST as restoreOne } from "@/app/api/trash/[id]/route";
import { GET as readImage } from "@/app/api/images/[key]/route";
import { saveImageFile, readImageByKey, moveImagesToTrash } from "@/lib/server/imageStorage";
import type { GenerateTask } from "@/lib/types";

const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

describe("task trash roundtrip with real SQLite and files", () => {
  it("bulk-deletes and restores metadata, canonical images and migrated images", async () => {
    const id = randomUUID();
    const key = `${id}_panel0_cur`;
    const legacyKey = `task_${id}_img0`;
    for (const candidate of [key, legacyKey]) {
      const stored = saveImageFile(candidate, image)!;
      registerImage(candidate, stored.filePath, stored.size);
    }
    const task: GenerateTask = {
      id, status: "completed", progress: 100, createdAt: new Date(), updatedAt: new Date(),
      script: { title: "Preserved comic", topic: "Storage", style: "flat", panels: [
        { id: 1, scene: "scene", dialogue: "dialogue", imagePrompt: "prompt", status: "completed", imageUrl: `file://${key}` },
      ] },
    };
    upsertTask(task);
    const response = await DELETE(new NextRequest("http://localhost/api/tasks", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id] }),
    }));
    expect(response.status).toBe(200);
    expect(getTaskById(id)).toBeNull();
    expect(getTrashItem(id)?.name).toBe("Preserved comic");
    expect(readImageByKey(key)).toBeNull();
    expect(readImageByKey(legacyKey)).toBeNull();
    const restored = await restoreOne(new NextRequest(`http://localhost/api/trash/${id}`, { method: "POST" }), {
      params: Promise.resolve({ id }),
    });
    expect(restored.status).toBe(200);
    expect(getTaskById(id)?.script?.title).toBe("Preserved comic");
    expect(getTrashItem(id)).toBeNull();
    const served = await readImage(new NextRequest(`http://localhost/api/images/${key}`), {
      params: Promise.resolve({ key }),
    });
    expect(served.status).toBe(200);
    expect(Buffer.from(await served.arrayBuffer())).toEqual(Buffer.from(image.split(",")[1], "base64"));
    expect(readImageByKey(key)).not.toBeNull();
    expect(readImageByKey(legacyKey)).not.toBeNull();
  });

  it("deletes only an exact owner prefix, without SQL wildcard interpretation", () => {
    const owner = `owner_${randomUUID()}`;
    const ownKey = `${owner}_panel0`;
    const neighbor = `${owner}another_panel0`;
    const wildcardNeighbor = ownKey.replace("owner_", "ownerX");
    for (const key of [ownKey, neighbor, wildcardNeighbor]) registerImage(key, "unused.png", 1);
    expect(deleteImagesByPrefix(owner)).toBe(1);
    expect(getImagePath(ownKey)).toBeNull();
    expect(getImagePath(neighbor)).toBe("unused.png");
    expect(getImagePath(wildcardNeighbor)).toBe("unused.png");
  });
  it("keeps the live task when soft deletion cannot move its images", async () => {
    const id = randomUUID();
    const key = `${id}_panel0_cur`;
    saveImageFile(key, image);
    moveImagesToTrash(id);
    saveImageFile(key, image);
    upsertTask({ id, status: "completed", progress: 100, createdAt: new Date(), updatedAt: new Date() });
    const response = await deleteOne(new NextRequest(`http://localhost/api/tasks/${id}`, { method: "DELETE" }), {
      params: Promise.resolve({ id }),
    });
    expect(response.status).toBe(500);
    expect(getTaskById(id)).not.toBeNull();
    expect(readImageByKey(key)).not.toBeNull();
  });

  it("preflights canonical and legacy groups before moving either one", async () => {
    const id = randomUUID();
    const canonical = `${id}_panel0_cur`;
    const legacy = `task_${id}_img0`;
    saveImageFile(legacy, image);
    moveImagesToTrash(`task_${id}`);
    saveImageFile(legacy, image);
    saveImageFile(canonical, image);
    upsertTask({ id, status: "completed", progress: 100, createdAt: new Date(), updatedAt: new Date() });
    const response = await DELETE(new NextRequest("http://localhost/api/tasks", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id] }),
    }));
    expect(response.status).toBe(500);
    expect(getTaskById(id)).not.toBeNull();
    expect(readImageByKey(canonical)).not.toBeNull();
    expect(readImageByKey(legacy)).not.toBeNull();
  });

});
