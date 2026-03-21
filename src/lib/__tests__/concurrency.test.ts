import { describe, it, expect } from "vitest";
import { withConcurrency } from "@/lib/concurrency";

describe("withConcurrency", () => {
  it("runs all tasks and returns results in order", async () => {
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.resolve(2),
      () => Promise.resolve(3),
    ];
    const results = await withConcurrency(tasks, { limit: 2 });
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ status: "fulfilled", value: 1 });
    expect(results[1]).toEqual({ status: "fulfilled", value: 2 });
    expect(results[2]).toEqual({ status: "fulfilled", value: 3 });
  });

  it("respects concurrency limit", async () => {
    let maxConcurrent = 0;
    let current = 0;

    const makeTask = () => async () => {
      current++;
      maxConcurrent = Math.max(maxConcurrent, current);
      await new Promise((r) => setTimeout(r, 20));
      current--;
      return current;
    };

    const tasks = Array.from({ length: 10 }, makeTask);
    await withConcurrency(tasks, { limit: 3 });
    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });

  it("handles mixed success and failure", async () => {
    const tasks = [
      () => Promise.resolve("ok"),
      () => Promise.reject(new Error("fail")),
      () => Promise.resolve("ok2"),
    ];
    const results = await withConcurrency(tasks, { limit: 2 });
    expect(results[0]).toEqual({ status: "fulfilled", value: "ok" });
    expect(results[1].status).toBe("rejected");
    expect(results[2]).toEqual({ status: "fulfilled", value: "ok2" });
  });

  it("rejects remaining tasks on abort", async () => {
    const controller = new AbortController();
    let completed = 0;

    const tasks = Array.from({ length: 5 }, (_, i) => async () => {
      if (i === 1) controller.abort();
      await new Promise((r) => setTimeout(r, 10));
      completed++;
      return i;
    });

    const results = await withConcurrency(tasks, { limit: 2, signal: controller.signal });
    // Some tasks should be rejected with AbortError
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected.length).toBeGreaterThan(0);
  });

  it("handles empty task array", async () => {
    const results = await withConcurrency([], { limit: 3 });
    expect(results).toEqual([]);
  });

  it("handles single task", async () => {
    const results = await withConcurrency(
      [() => Promise.resolve(42)],
      { limit: 5 },
    );
    expect(results).toEqual([{ status: "fulfilled", value: 42 }]);
  });

  it("limit larger than task count works correctly", async () => {
    const tasks = [
      () => Promise.resolve("a"),
      () => Promise.resolve("b"),
    ];
    const results = await withConcurrency(tasks, { limit: 100 });
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
  });
});
