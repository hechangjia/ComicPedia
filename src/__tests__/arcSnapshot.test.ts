import { describe, it, expect } from "vitest";
import { getEpisodeArcSnapshots } from "@/lib/server/db";
import type { GenerateTask, ComicScript } from "@/lib/types";

// We need to test getEpisodeArcSnapshots which reads from SQLite.
// Since it uses the real db module, we test via the upsertTask helper.
import { upsertTask, getTaskById } from "@/lib/server/db";

function makeTask(id: string, status: string, script: ComicScript | null): GenerateTask {
  return {
    id,
    status: status as GenerateTask["status"],
    progress: 100,
    script: script ?? undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeScript(title: string, panels: { scene: string; dialogue: string }[]): ComicScript {
  return {
    title,
    topic: "Test",
    style: "flat",
    panels: panels.map((p, i) => ({
      id: i + 1,
      scene: p.scene,
      dialogue: p.dialogue,
      imagePrompt: "test prompt",
      status: "pending" as const,
    })),
  };
}

describe("getEpisodeArcSnapshots", () => {
  it("returns empty array for empty inputs", () => {
    expect(getEpisodeArcSnapshots([], ["Alice"])).toEqual([]);
    expect(getEpisodeArcSnapshots(["t1"], [])).toEqual([]);
  });

  it("extracts character appearances from completed tasks", () => {
    const taskId = `arc_test_${Date.now()}_1`;
    const script = makeScript("The Lab", [
      { scene: "Alice enters the lab", dialogue: "Alice: Let's experiment!" },
      { scene: "A scenic mountain view", dialogue: "Narrator: Beautiful day" },
      { scene: "Alice and Bob discuss results", dialogue: "Bob: Interesting data" },
    ]);

    upsertTask(makeTask(taskId, "completed", script));

    const snapshots = getEpisodeArcSnapshots([taskId], ["Alice", "Bob"]);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].taskId).toBe(taskId);
    expect(snapshots[0].title).toBe("The Lab");
    expect(snapshots[0].characterSummary).toContain("Alice");
    // Panel 2 (mountain view) should be excluded — no character match
    expect(snapshots[0].characterSummary).not.toContain("mountain");
  });

  it("skips non-completed tasks", () => {
    const taskId = `arc_test_${Date.now()}_2`;
    const script = makeScript("Draft Episode", [
      { scene: "Alice drafts a plan", dialogue: "Alice: Still working" },
    ]);

    upsertTask(makeTask(taskId, "scripting", script));

    const snapshots = getEpisodeArcSnapshots([taskId], ["Alice"]);
    expect(snapshots).toEqual([]);
  });

  it("skips tasks without scripts", () => {
    const taskId = `arc_test_${Date.now()}_3`;
    upsertTask(makeTask(taskId, "completed", null));

    const snapshots = getEpisodeArcSnapshots([taskId], ["Alice"]);
    expect(snapshots).toEqual([]);
  });

  it("respects maxEpisodes limit", () => {
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) {
      const id = `arc_test_${Date.now()}_max_${i}`;
      ids.push(id);
      upsertTask(makeTask(id, "completed", makeScript(`Episode ${i + 1}`, [
        { scene: `Alice does thing ${i + 1}`, dialogue: `Alice: Step ${i + 1}` },
      ])));
    }

    const snapshots = getEpisodeArcSnapshots(ids, ["Alice"], 3);
    expect(snapshots).toHaveLength(3);
    // Should be the 3 most recent (last 3)
    expect(snapshots[0].title).toBe("Episode 5");
    expect(snapshots[2].title).toBe("Episode 7");
  });

  it("respects token budget", () => {
    const taskId = `arc_test_${Date.now()}_budget`;
    const longPanels = Array.from({ length: 50 }, (_, i) => ({
      scene: `Alice performs experiment number ${i + 1} in the laboratory with very detailed description`,
      dialogue: `Alice: This is dialogue line number ${i + 1} with lots of extra text`,
    }));

    upsertTask(makeTask(taskId, "completed", makeScript("Long Episode", longPanels)));

    // With small token budget (50 tokens = ~200 chars), should truncate
    const snapshots = getEpisodeArcSnapshots([taskId], ["Alice"], 5, 50);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].characterSummary.length).toBeLessThan(250);
  });

  it("handles nonexistent task IDs gracefully", () => {
    const snapshots = getEpisodeArcSnapshots(["nonexistent_id_xyz"], ["Alice"]);
    expect(snapshots).toEqual([]);
  });
});
