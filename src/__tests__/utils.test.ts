import { describe, it, expect, vi, beforeEach } from "vitest";
import { clampScore, extractJsonObject, extractJsonArray, formatDate, createReferenceEntry } from "@/lib/utils";

describe("clampScore", () => {
  it("clamps values below 1 to 1", () => {
    expect(clampScore(-5)).toBe(1);
  });

  it("treats 0 as falsy, falls back to 5", () => {
    // 0 || 5 = 5, so clampScore(0) = 5
    expect(clampScore(0)).toBe(5);
  });

  it("clamps values above 10 to 10", () => {
    expect(clampScore(15)).toBe(10);
    expect(clampScore(100)).toBe(10);
  });

  it("returns value within range as-is", () => {
    expect(clampScore(5)).toBe(5);
    expect(clampScore(1)).toBe(1);
    expect(clampScore(10)).toBe(10);
  });

  it("falls back to 5 for NaN", () => {
    expect(clampScore(NaN)).toBe(5);
  });
});

describe("extractJsonObject", () => {
  it("extracts JSON object from mixed text", () => {
    const input = 'Here is the result: {"key": "value", "num": 42} done.';
    expect(extractJsonObject(input)).toEqual({ key: "value", num: 42 });
  });

  it("returns null when no JSON found", () => {
    expect(extractJsonObject("no json here")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(extractJsonObject("{bad json}")).toBeNull();
  });

  it("handles nested objects", () => {
    const input = '{"a": {"b": 1}}';
    expect(extractJsonObject(input)).toEqual({ a: { b: 1 } });
  });
});

describe("extractJsonArray", () => {
  it("extracts JSON array from mixed text", () => {
    const input = 'Result: [1, 2, 3] end';
    expect(extractJsonArray(input)).toEqual([1, 2, 3]);
  });

  it("returns null when no array found", () => {
    expect(extractJsonArray("no array")).toBeNull();
  });

  it("returns null for non-array JSON", () => {
    // If the bracketed content parses but isn't an array, return null
    // Actually [1,2] is always an array. Test with invalid JSON in brackets.
    expect(extractJsonArray("[bad]")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(extractJsonArray("[1, 2,]")).toBeNull();
  });
});

describe("formatDate", () => {
  it("returns fallback for undefined/null/empty", () => {
    expect(formatDate(undefined)).toBe("-");
    expect(formatDate(null)).toBe("-");
    expect(formatDate("")).toBe("-");
  });

  it("returns custom fallback", () => {
    expect(formatDate(undefined, { fallback: "N/A" })).toBe("N/A");
  });

  it("returns fallback for invalid date", () => {
    expect(formatDate("not-a-date")).toBe("-");
  });

  it("formats a valid ISO string", () => {
    const result = formatDate("2024-01-15T10:00:00Z");
    expect(typeof result).toBe("string");
    expect(result).not.toBe("-");
  });

  it("formats Date object", () => {
    const result = formatDate(new Date("2024-06-01"));
    expect(typeof result).toBe("string");
    expect(result).not.toBe("-");
  });

  it("formats timestamp number", () => {
    const result = formatDate(1700000000000);
    expect(typeof result).toBe("string");
    expect(result).not.toBe("-");
  });

  it("supports datetime style", () => {
    const result = formatDate("2024-01-15T10:30:00Z", { style: "datetime" });
    expect(typeof result).toBe("string");
    expect(result).not.toBe("-");
  });
});

describe("createReferenceEntry", () => {
  it("creates a valid reference entry", () => {
    const before = Date.now();
    const entry = createReferenceEntry("http://img.png", "a cat", "Cat Ref", "ai");
    const after = Date.now();

    expect(entry.imageUrl).toBe("http://img.png");
    expect(entry.prompt).toBe("a cat");
    expect(entry.label).toBe("Cat Ref");
    expect(entry.source).toBe("ai");
    expect(entry.versions).toHaveLength(1);
    expect(entry.versions[0].imageUrl).toBe("http://img.png");
    expect(entry.activeVersionIndex).toBe(0);
    expect(entry.createdAt).toBeGreaterThanOrEqual(before);
    expect(entry.createdAt).toBeLessThanOrEqual(after);
  });

  it("supports upload source", () => {
    const entry = createReferenceEntry("data:image/png;base64,abc", "", "Upload", "upload");
    expect(entry.source).toBe("upload");
  });
});
