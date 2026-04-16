import { describe, it, expect } from "vitest";
import {
  createSeries,
  addEpisode,
  updateSeriesCover,
  getSeriesContinuationContext,
  Series,
} from "../lib/series";

describe("createSeries", () => {
  it("returns a series with correct defaults", () => {
    const s = createSeries("My Series", "science", "flat");
    expect(s.title).toBe("My Series");
    expect(s.contentType).toBe("science");
    expect(s.style).toBe("flat");
    expect(s.description).toBe("");
    expect(s.episodes).toEqual([]);
    expect(s.createdAt).toBe(s.updatedAt);
  });

  it("id matches series_ pattern", () => {
    const s = createSeries("T", "science", "flat");
    expect(s.id).toMatch(/^series_\d+_[a-z0-9]{4}$/);
  });

  it("generates a valid seed", () => {
    const s = createSeries("T", "science", "flat");
    expect(s.seed).toBeGreaterThanOrEqual(0);
    expect(s.seed).toBeLessThan(2147483647);
    expect(Number.isInteger(s.seed)).toBe(true);
  });

  it("accepts a description", () => {
    const s = createSeries("T", "poetry", "inkwash", "desc");
    expect(s.description).toBe("desc");
  });
});

describe("addEpisode", () => {
  const base = createSeries("S", "science", "flat");

  it("increments episodeNumber starting from 1", () => {
    const s1 = addEpisode(base, "t1", "Ep1");
    expect(s1.episodes[0].episodeNumber).toBe(1);
    const s2 = addEpisode(s1, "t2", "Ep2");
    expect(s2.episodes[1].episodeNumber).toBe(2);
  });

  it("does not mutate the original series", () => {
    const s1 = addEpisode(base, "t1", "Ep1");
    expect(base.episodes).toHaveLength(0);
    expect(s1.episodes).toHaveLength(1);
  });

  it("sets status to draft", () => {
    const s1 = addEpisode(base, "t1", "Ep1");
    expect(s1.episodes[0].status).toBe("draft");
  });

  it("updates updatedAt", () => {
    const s1 = addEpisode(base, "t1", "Ep1");
    expect(new Date(s1.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(base.updatedAt).getTime()
    );
  });
});

describe("updateSeriesCover", () => {
  const base = createSeries("S", "science", "flat");

  it("sets coverUrl", () => {
    const s = updateSeriesCover(base, "https://img.test/cover.png");
    expect(s.coverUrl).toBe("https://img.test/cover.png");
  });

  it("updates timestamp", () => {
    const s = updateSeriesCover(base, "url");
    expect(new Date(s.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(base.updatedAt).getTime()
    );
  });

  it("does not mutate original", () => {
    updateSeriesCover(base, "url");
    expect(base.coverUrl).toBeUndefined();
  });
});

describe("getSeriesContinuationContext", () => {
  const base: Series = {
    id: "s1",
    title: "Physics Fun",
    description: "A series about physics",
    contentType: "science",
    style: "flat",
    characterDescription: "A curious cat named Newton",
    episodes: [
      { taskId: "t1", title: "Ep1", episodeNumber: 1, status: "completed" },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("includes next episode number", () => {
    const ctx = getSeriesContinuationContext(base);
    expect(ctx).toContain("episode 2");
  });

  it("includes series title", () => {
    const ctx = getSeriesContinuationContext(base);
    expect(ctx).toContain("Physics Fun");
  });

  it("includes description", () => {
    const ctx = getSeriesContinuationContext(base);
    expect(ctx).toContain("A series about physics");
  });

  it("includes character description", () => {
    const ctx = getSeriesContinuationContext(base);
    expect(ctx).toContain("A curious cat named Newton");
  });

  it("includes previousEnding when provided", () => {
    const ctx = getSeriesContinuationContext(base, "The cat fell asleep.");
    expect(ctx).toContain("The cat fell asleep.");
    expect(ctx).toContain("Continue the story");
  });

  it("omits previousEnding section when not provided", () => {
    const ctx = getSeriesContinuationContext(base);
    expect(ctx).not.toContain("Previous episode");
    expect(ctx).not.toContain("Continue the story");
  });

  it("omits character description when absent", () => {
    const noChar = { ...base, characterDescription: undefined };
    const ctx = getSeriesContinuationContext(noChar);
    expect(ctx).not.toContain("Recurring characters");
  });

  it("omits description when empty", () => {
    const noDesc = { ...base, description: "" };
    const ctx = getSeriesContinuationContext(noDesc);
    expect(ctx).not.toContain("Series overview");
  });
});
