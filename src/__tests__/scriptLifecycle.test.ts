import Database from "better-sqlite3";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteTask,
  getTaskById,
  patchTask,
  upsertTask,
  claimTaskScriptRun,
  hasTaskScriptRun,
  updateTaskForScriptRun,
  finishTaskScriptRun,
} from "@/lib/server/db";
import { runResearchAndScriptTask } from "@/lib/server/taskOrchestrator/scriptRunner";
import type { ComicScript, GenerateRequest, GenerateTask } from "@/lib/types";

const calls = vi.hoisted(() => ({
  stream: vi.fn(),
  fallback: vi.fn(),
  research: vi.fn(),
  repair: vi.fn(),
  enqueue: vi.fn(),
  validate: vi.fn(),
  wiki: vi.fn(),
  outline: vi.fn(),
}));
vi.mock("@/lib/llm", () => ({
  generateScriptStream: calls.stream,
  generateScript: calls.fallback,
  generateTopicResearch: calls.research,
  buildEnhancedTopicFromResearch: () => "enriched",
}));
vi.mock("@/lib/scriptValidator", () => ({
  validateScript: calls.validate,
  applyCanonicalCharacterDesc: vi.fn(),
}));
vi.mock("@/lib/server/wikipedia", () => ({
  searchWikipedia: calls.wiki,
  getWikipediaSummary: vi.fn(),
}));
vi.mock("@/lib/director", () => ({ generateNarrativeOutline: calls.outline }));
vi.mock("@/lib/scriptRepair", () => ({ repairScript: calls.repair }));
vi.mock("@/lib/server/taskOrchestrator/runtime", () => ({
  getTaskRuntime: () => ({ enqueueImageQueue: calls.enqueue }),
}));

function gate<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const script: ComicScript = {
  title: "Synthetic lifecycle",
  topic: "test",
  style: "flat",
  panels: [
    {
      id: 1,
      scene: "test",
      dialogue: "test",
      imagePrompt: "test",
      status: "pending",
    },
  ],
};
const request: GenerateRequest = {
  topic: "test",
  style: "flat",
  quality: "fast",
  panelCount: 1,
  presetSnapshot: { presetId: "test", pauseAfterScript: true },
};
function seed(id: string) {
  const task: GenerateTask = {
    id,
    status: "created",
    progress: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  upsertTask(task);
  return task;
}

beforeEach(() => {
  vi.resetAllMocks();
  calls.validate.mockReturnValue({ passed: true, warnings: [] });
  calls.stream.mockResolvedValue(structuredClone(script));
  calls.fallback.mockResolvedValue(structuredClone(script));
});
describe("script runner lifecycle using actual SQLite", () => {
  it("does not recreate a task deleted while the stream is pending", async () => {
    const task = seed("script-deleted");
    const pending = gate<ComicScript>();
    calls.stream.mockReturnValue(pending.promise);
    const running = runResearchAndScriptTask(task.id, request);
    await vi.waitFor(() => expect(calls.stream).toHaveBeenCalledOnce());
    deleteTask(task.id);
    pending.resolve(structuredClone(script));
    await running;
    expect(getTaskById(task.id)).toBeNull();
    expect(calls.enqueue).not.toHaveBeenCalled();
  });
  it("does not retry a failed stream after task deletion", async () => {
    const task = seed("script-deleted-error");
    const pending = gate<ComicScript>();
    calls.stream.mockReturnValue(pending.promise);
    const running = runResearchAndScriptTask(task.id, request);
    await vi.waitFor(() => expect(calls.stream).toHaveBeenCalledOnce());
    deleteTask(task.id);
    pending.reject(new Error("synthetic upstream failure"));
    await running;
    expect(calls.fallback).not.toHaveBeenCalled();
    expect(getTaskById(task.id)).toBeNull();
  });
  it("does not attach a late result to a restored task with the same id", async () => {
    const task = seed("script-restored");
    const pending = gate<ComicScript>();
    calls.stream.mockReturnValue(pending.promise);
    const running = runResearchAndScriptTask(task.id, request);
    await vi.waitFor(() => expect(calls.stream).toHaveBeenCalledOnce());
    const snapshot = getTaskById(task.id)!;
    deleteTask(task.id);
    upsertTask({ ...snapshot, tags: ["restored"] });
    pending.resolve(structuredClone(script));
    await running;
    expect(getTaskById(task.id)).toMatchObject({
      status: "script_running",
      tags: ["restored"],
    });
    expect(getTaskById(task.id)?.script).toBeUndefined();
  });
  it("preserves user edits made during generation and persists pipeline trace", async () => {
    const task = seed("script-tags");
    const pending = gate<ComicScript>();
    calls.stream.mockReturnValue(pending.promise);
    const running = runResearchAndScriptTask(task.id, request);
    await vi.waitFor(() => expect(calls.stream).toHaveBeenCalledOnce());
    patchTask(task.id, { tags: ["during-generation"], favorited: true });
    pending.resolve(structuredClone(script));
    await running;
    expect(getTaskById(task.id)).toMatchObject({
      status: "script_ready",
      tags: ["during-generation"],
      favorited: true,
    });
    expect(getTaskById(task.id)?.pipelineTrace).toContainEqual(
      expect.objectContaining({ stage: "script", status: "completed" }),
    );
  });
  it("ignores a stale run when a newer run finishes first", async () => {
    const task = seed("script-overlap");
    const pending = gate<ComicScript>();
    calls.stream.mockReturnValueOnce(pending.promise);
    const older = runResearchAndScriptTask(task.id, request);
    await vi.waitFor(() => expect(calls.stream).toHaveBeenCalledOnce());
    calls.stream.mockResolvedValue({
      ...structuredClone(script),
      title: "newer",
    });
    await runResearchAndScriptTask(task.id, request);
    pending.resolve({ ...structuredClone(script), title: "older" });
    await older;
    expect(getTaskById(task.id)?.script?.title).toBe("newer");
  });
});

describe("script fences across stages and database replacement", () => {
  it("stops after research deletion without enrichment, director or scripting", async () => {
    const task = seed("research-deleted");
    const pending = gate<never>();
    calls.research.mockReturnValue(pending.promise);
    const running = runResearchAndScriptTask(task.id, {
      ...request,
      quality: "fine",
    });
    await vi.waitFor(() => expect(calls.research).toHaveBeenCalledOnce());
    deleteTask(task.id);
    pending.reject(new Error("research response failed"));
    await running;
    expect(getTaskById(task.id)).toBeNull();
    expect(calls.wiki).not.toHaveBeenCalled();
    expect(calls.outline).not.toHaveBeenCalled();
    expect(calls.stream).not.toHaveBeenCalled();
  });
  it("stops after repair deletion without another repair or final write", async () => {
    const task = seed("repair-deleted");
    const pending = gate<ComicScript>();
    calls.repair.mockReturnValue(pending.promise);
    calls.validate.mockReturnValue({
      passed: false,
      warnings: [
        {
          severity: "warning",
          dimension: "composition",
          panelIndices: [0],
          message: "test",
          suggestion: "test",
        },
      ],
    });
    const running = runResearchAndScriptTask(task.id, request);
    await vi.waitFor(() => expect(calls.repair).toHaveBeenCalledOnce());
    deleteTask(task.id);
    pending.resolve(structuredClone(script));
    await running;
    expect(getTaskById(task.id)).toBeNull();
    expect(calls.repair).toHaveBeenCalledOnce();
  });
  it("persists an active failure without overwriting user fields", async () => {
    const task = seed("live-failure");
    const pending = gate<ComicScript>();
    calls.stream.mockReturnValue(pending.promise);
    calls.fallback.mockRejectedValue(new Error("synthetic failure"));
    const running = runResearchAndScriptTask(task.id, request);
    await vi.waitFor(() => expect(calls.stream).toHaveBeenCalledOnce());
    patchTask(task.id, { tags: ["keep"], favorited: true });
    pending.reject(new Error("stream unavailable"));
    await running;
    expect(getTaskById(task.id)).toMatchObject({
      status: "failed",
      error: "synthetic failure",
      tags: ["keep"],
      favorited: true,
    });
    expect(getTaskById(task.id)?.pipelineTrace).toContainEqual(
      expect.objectContaining({ stage: "script", status: "failed" }),
    );
  });
  it("does not restart a completed task from a stale enqueue", async () => {
    const task = seed("already-completed");
    upsertTask({ ...task, status: "completed", progress: 100 });
    await runResearchAndScriptTask(task.id, request);
    expect(calls.stream).not.toHaveBeenCalled();
    expect(getTaskById(task.id)?.status).toBe("completed");
  });
  it("preserves server replay and unrelated metadata and rejects stale writes atomically", () => {
    const task = seed("fenced-sqlite");
    const reader = new Database(
      path.join(process.env.COMICPEDIA_DATA_DIR!, "comicpedia.db"),
    );
    try {
      reader
        .prepare("UPDATE tasks SET metadata=? WHERE id=?")
        .run(
          JSON.stringify({
            serverScriptReplay: { request: { topic: "synthetic" } },
            unknownFutureField: { keep: true },
          }),
          task.id,
        );
      const first = claimTaskScriptRun(task.id)!;
      expect(first.task).not.toHaveProperty("serverScriptRunId");
      expect(
        updateTaskForScriptRun(
          { ...first.task, status: "script_running" },
          first.runId,
        ),
      ).toBe(true);
      const meta = JSON.parse(
        (
          reader
            .prepare("SELECT metadata FROM tasks WHERE id=?")
            .get(task.id) as { metadata: string }
        ).metadata,
      );
      expect(meta).toMatchObject({
        serverScriptReplay: { request: { topic: "synthetic" } },
        unknownFutureField: { keep: true },
        serverScriptRunId: first.runId,
      });
      const second = claimTaskScriptRun(task.id)!;
      finishTaskScriptRun(task.id, first.runId);
      expect(hasTaskScriptRun(task.id, second.runId)).toBe(true);
      expect(
        updateTaskForScriptRun({ ...task, status: "failed" }, first.runId),
      ).toBe(false);
      reader.prepare("DELETE FROM tasks WHERE id=?").run(task.id);
      expect(updateTaskForScriptRun(task, second.runId)).toBe(false);
      expect(getTaskById(task.id)).toBeNull();
    } finally {
      reader.close();
    }
  });
  it("auto-continues only the still-owned successful execution", async () => {
    const task = seed("handoff");
    await runResearchAndScriptTask(task.id, {
      ...request,
      presetSnapshot: { presetId: "auto", pauseAfterScript: false },
    });
    expect(calls.enqueue).toHaveBeenCalledOnce();
    expect(calls.enqueue.mock.calls[0][0]).toBe(task.id);
  });
});
