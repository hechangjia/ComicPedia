import { describe, it, expect } from "vitest";
import { TOPIC_PRESETS, getCategories } from "@/lib/config/topicPresets";
import type { BuiltinContentType } from "@/lib/types";

const ALL_TYPES: BuiltinContentType[] = ["science", "poetry", "novel", "xiaohongshu", "wikipedia"];

describe("topicPresets", () => {
  it("has presets for every builtin content type", () => {
    for (const ct of ALL_TYPES) {
      expect(TOPIC_PRESETS[ct]).toBeDefined();
      expect(TOPIC_PRESETS[ct].length).toBeGreaterThan(0);
    }
  });

  it("science has 50+ presets", () => {
    expect(TOPIC_PRESETS.science.length).toBeGreaterThanOrEqual(50);
  });

  it("poetry has 20+ presets", () => {
    expect(TOPIC_PRESETS.poetry.length).toBeGreaterThanOrEqual(20);
  });

  it("novel has 15+ presets", () => {
    expect(TOPIC_PRESETS.novel.length).toBeGreaterThanOrEqual(15);
  });

  it("xiaohongshu has 15+ presets", () => {
    expect(TOPIC_PRESETS.xiaohongshu.length).toBeGreaterThanOrEqual(15);
  });

  it("wikipedia has 15+ presets", () => {
    expect(TOPIC_PRESETS.wikipedia.length).toBeGreaterThanOrEqual(15);
  });

  it("every preset has label, topic, and category", () => {
    for (const ct of ALL_TYPES) {
      for (const p of TOPIC_PRESETS[ct]) {
        expect(p.label).toBeTruthy();
        expect(p.topic).toBeTruthy();
        expect(p.category).toBeTruthy();
      }
    }
  });

  it("no duplicate labels within a content type", () => {
    for (const ct of ALL_TYPES) {
      const labels = TOPIC_PRESETS[ct].map((p) => p.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});

describe("getCategories", () => {
  it("returns unique top-level categories", () => {
    const cats = getCategories("science");
    expect(cats.length).toBeGreaterThan(0);
    expect(new Set(cats).size).toBe(cats.length);
  });

  it("strips subcategory from poetry categories", () => {
    const cats = getCategories("poetry");
    // "唐诗/李白" should become "唐诗"
    expect(cats).toContain("唐诗");
    expect(cats.every((c) => !c.includes("/"))).toBe(true);
  });

  it("returns empty array for unknown type", () => {
    expect(getCategories("nonexistent" as BuiltinContentType)).toEqual([]);
  });
});
