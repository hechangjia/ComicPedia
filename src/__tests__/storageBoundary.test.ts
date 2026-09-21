import path from "node:path";
import { describe, expect, it } from "vitest";
import { isStorageSegment, isPathWithin } from "@/lib/server/storageBoundary";

describe("storage boundary", () => {
  it.each(["", ".", "..", "../escape", "..\\escape", "a/b", "a\\b", "C:escape", "file:stream", "NUL", "CON.txt", "COM1", "trailing.", "trailing ", "a\u0000b"])("rejects unsafe identifier %j", (value) => {
    expect(isStorageSegment(value)).toBe(false);
  });
  it.each(["task-1", "char_123_ref0", "中文标题", "Origin Task"])("accepts existing identifier %j", (value) => {
    expect(isStorageSegment(value)).toBe(true);
  });
  it("requires a strict descendant, not the root or a sibling prefix", () => {
    const base = path.resolve("data/images");
    expect(isPathWithin(base, base)).toBe(false);
    expect(isPathWithin(base, `${base}-private/secret.png`)).toBe(false);
    expect(isPathWithin(base, path.join(base, "task", "image.png"))).toBe(true);
  });
});
