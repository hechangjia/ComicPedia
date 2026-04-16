import { describe, expect, it } from "vitest";
import { getTaskById, upsertTask } from "@/lib/server/db";
import type { GenerateTask } from "@/lib/types";

function makeTask(id: string, origin?: GenerateTask["origin"]): GenerateTask {
  return {
    id,
    origin,
    status: "completed",
    progress: 100,
    script: {
      title: "Origin Task",
      topic: "Topic",
      style: "flat",
      panels: [],
    },
    createdAt: new Date("2026-04-09T00:00:00.000Z"),
    updatedAt: new Date("2026-04-09T00:00:00.000Z"),
  };
}

describe("task origin persistence", () => {
  it("defaults legacy tasks to user origin when origin is omitted", () => {
    const id = `origin-default-${Date.now()}`;
    upsertTask(makeTask(id));

    const task = getTaskById(id);

    expect(task?.origin).toBe("user");
  });

  it("round-trips explicit test origin through metadata", () => {
    const id = `origin-explicit-${Date.now()}`;
    upsertTask(makeTask(id, "test"));

    const task = getTaskById(id);

    expect(task?.origin).toBe("test");
  });

  it("infers obvious legacy fixture tasks as test origin", () => {
    const id = `arc_test_${Date.now()}`;
    upsertTask(makeTask(id));

    const task = getTaskById(id);

    expect(task?.origin).toBe("test");
  });
});
