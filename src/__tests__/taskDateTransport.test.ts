import { describe, expect, it } from "vitest";
import { fileRefsToUrls, restoreFileRefs, normalizeImageRefsToFileRefs } from "@/lib/server/imageExtractor";
import { buildTaskDetailResponse, buildTaskListItem, buildTaskMutationResponse } from "@/lib/server/taskClientView";
import type { GenerateTask } from "@/lib/types";

const timestamp = "2026-09-21T03:37:23.704Z";
function task(): GenerateTask {
  return { id: "date-roundtrip", origin: "user", status: "completed", progress: 100,
    createdAt: new Date(timestamp), updatedAt: new Date(timestamp),
    script: { title: "Date regression", topic: "test", style: "flat", panels: [] } };
}

describe("image-reference transforms preserve timestamps", () => {
  it.each([fileRefsToUrls, restoreFileRefs, normalizeImageRefsToFileRefs])("preserves nested Date objects without mutating the source", (transform) => {
    const value = { createdAt: new Date(timestamp), nested: [{ updatedAt: new Date(timestamp), image: "file://missing-date-fixture" }] };
    const result = transform(value) as typeof value;
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.nested[0].updatedAt.toISOString()).toBe(timestamp);
    expect(JSON.parse(JSON.stringify(result)).createdAt).toBe(timestamp);
    expect(value.nested[0].image).toBe("file://missing-date-fixture");
  });
  it.each([null, "false", "base64"])("serializes task detail dates for withImages=%s", (mode) => {
    const result = JSON.parse(JSON.stringify(buildTaskDetailResponse(task(), [], mode)));
    expect(result.createdAt).toBe(timestamp);
    expect(result.updatedAt).toBe(timestamp);
  });
  it("retains dates in task list and mutation responses", () => {
    for(const response of [buildTaskListItem(task(), []), buildTaskMutationResponse(task())]) {
      expect(JSON.parse(JSON.stringify(response)).createdAt).toBe(timestamp);
    }
  });
});
