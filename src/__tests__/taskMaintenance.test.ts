import { beforeEach, describe, expect, it, vi } from "vitest";

const getAllTasksMock = vi.fn();
const getAllTrashMock = vi.fn();
const getTaskByIdMock = vi.fn();
const deleteTaskMock = vi.fn();
const deleteImagesByPrefixMock = vi.fn();
const addMaintenanceActionMock = vi.fn();

vi.mock("@/lib/server/db", () => ({
  getAllTasks: getAllTasksMock,
  getAllTrash: getAllTrashMock,
  getTaskById: getTaskByIdMock,
  deleteTask: deleteTaskMock,
  deleteImagesByPrefix: deleteImagesByPrefixMock,
  addMaintenanceAction: addMaintenanceActionMock,
}));

vi.mock("@/lib/server/imageStorage", () => ({
  deleteImagesByDir: vi.fn(),
}));

const taskModule = await import("@/lib/server/taskMaintenance");

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    origin: "user",
    status: "completed",
    progress: 100,
    createdAt: new Date("2026-04-09T00:00:00.000Z"),
    updatedAt: new Date("2026-04-09T00:00:00.000Z"),
    script: {
      title: "Real Story",
      topic: "Topic",
      style: "flat",
      panels: [],
    },
    ...overrides,
  };
}

describe("task maintenance scan and lookup", () => {
  beforeEach(() => {
    getAllTasksMock.mockReset();
    getAllTrashMock.mockReset();
    getTaskByIdMock.mockReset();
    deleteTaskMock.mockReset();
    deleteImagesByPrefixMock.mockReset();
    addMaintenanceActionMock.mockReset();
  });

  it("classifies arc_test and Episode Test records as auto-delete", () => {
    getAllTasksMock.mockReturnValue([
      makeTask({
        id: "arc_test_1",
        origin: "test",
        script: { title: "Episode 1", topic: "Test", style: "flat", panels: [] },
      }),
      makeTask({
        id: "blank-completed",
        origin: "test",
        script: undefined,
      }),
      makeTask({
        id: "real-1",
        origin: "user",
        script: {
          title: "神农尝百草",
          topic: "Topic",
          style: "flat",
          panels: [{ id: 1, scene: "Scene", dialogue: "Line", status: "completed", imageUrl: "file://real-1_panel0_cur" }],
        },
      }),
    ]);

    const result = taskModule.scanTaskHealth();

    expect(result.autoDelete.map((item) => item.id)).toEqual(["arc_test_1", "blank-completed"]);
    expect(result.manualReview).toEqual([]);
    expect(result.autoDelete[0].snapshotToken).toContain("arc_test_1|completed|");
  });

  it("returns active and trash lookup results with visibility reasons", () => {
    getAllTasksMock.mockReturnValue([
      makeTask({
        id: "real-1",
        origin: "user",
        script: {
          title: "神农尝百草：从传说到医药文明",
          topic: "神农尝百草",
          style: "flat",
          panels: [{ id: 1, scene: "Scene", dialogue: "Line", imageUrl: "file://real-1_panel0_cur", status: "completed" }],
        },
      }),
      makeTask({
        id: "hidden-1",
        origin: "test",
        script: {
          title: "Episode 3",
          topic: "Test",
          style: "flat",
          panels: [],
        },
      }),
    ]);
    getAllTrashMock.mockReturnValue([
      {
        id: "trash-1",
        type: "task",
        name: "Deleted Story",
        data: JSON.stringify({ script: { title: "Deleted Story", topic: "Deleted Topic" } }),
        imageDir: "trash-1",
        deletedAt: "2026-04-09T00:00:00.000Z",
      },
    ]);

    const result = taskModule.lookupTaskRecords("神农");

    expect(result.active[0]).toMatchObject({
      id: "real-1",
      title: "神农尝百草：从传说到医药文明",
      invisibilityReason: "default_visible",
      hasImages: true,
    });
    expect(result.trash).toEqual([]);
  });

  it("hard deletes only snapshot-matching auto-delete tasks and records audit", () => {
    const task = makeTask({
      id: "arc_test_2",
      origin: "test",
      script: { title: "Episode 2", topic: "Test", style: "flat", panels: [] },
    });
    getTaskByIdMock.mockReturnValue(task);
    deleteTaskMock.mockReturnValue(true);

    const result = taskModule.executeTaskHealthCleanup(
      [{ id: "arc_test_2", snapshotToken: taskModule.buildSnapshotToken(task) }],
      "settings",
    );

    expect(deleteImagesByPrefixMock).toHaveBeenCalledWith("arc_test_2");
    expect(deleteTaskMock).toHaveBeenCalledWith("arc_test_2");
    expect(addMaintenanceActionMock).toHaveBeenCalledWith(expect.objectContaining({
      action: "task_health_execute",
      summary: "1 auto-delete task(s) removed",
    }));
    expect(result.deleted).toEqual([{ id: "arc_test_2" }]);
    expect(result.skipped).toEqual([]);
  });

  it("skips tasks whose snapshot token changed after scan", () => {
    const current = makeTask({
      id: "arc_test_3",
      origin: "test",
      updatedAt: new Date("2026-04-09T01:00:00.000Z"),
      script: { title: "Episode 3", topic: "Test", style: "flat", panels: [] },
    });
    getTaskByIdMock.mockReturnValue(current);

    const result = taskModule.executeTaskHealthCleanup(
      [{ id: "arc_test_3", snapshotToken: "arc_test_3|completed|2026-04-09T00:00:00.000Z|test" }],
      "settings",
    );

    expect(result.deleted).toEqual([]);
    expect(result.skipped[0]).toMatchObject({
      id: "arc_test_3",
      reason: "snapshot_mismatch",
    });
  });
});
