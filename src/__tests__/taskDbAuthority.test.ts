import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
const cachePutMock = vi.fn();
const originalFetch = globalThis.fetch;
const storeState = {
  tasks: {} as Record<string, unknown>,
};

vi.mock("idb", () => ({
  openDB: vi.fn(async () => ({
    put: cachePutMock,
    get: vi.fn(),
  })),
}));

vi.mock("@/stores/taskStore", () => ({
  useTaskStore: {
    getState: () => storeState,
  },
}));

describe("client db authority reads", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    cachePutMock.mockReset();
    storeState.tasks = {};
    globalThis.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns the local store snapshot for browser-owned active states", async () => {
    storeState.tasks["task-1"] = {
      id: "task-1",
      status: "generating",
      progress: 55,
    };

    const { getTask } = await import("@/lib/client/db");
    const result = await getTask("task-1");

    expect(result).toMatchObject({ id: "task-1", status: "generating" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches the server snapshot for durable queue states", async () => {
    storeState.tasks["task-2"] = {
      id: "task-2",
      status: "image_queue_running",
      progress: 60,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "task-2",
        status: "image_queue_running",
        stateAuthority: "server_durable",
        progress: 61,
      }),
    });

    const { getTask } = await import("@/lib/client/db");
    const result = await getTask("task-2");

    expect(fetchMock).toHaveBeenCalledWith("/api/tasks/task-2", expect.anything());
    expect(result).toMatchObject({ id: "task-2", stateAuthority: "server_durable", progress: 61 });
  });

  it("prefers the fresh local snapshot if authority flips while API read is in flight", async () => {
    storeState.tasks["task-3"] = {
      id: "task-3",
      status: "image_queue_running",
      progress: 60,
    };
    const localSnapshot = {
      id: "task-3",
      status: "generating",
      progress: 77,
    };
    fetchMock.mockImplementation(async () => {
      storeState.tasks["task-3"] = localSnapshot;
      return {
        ok: true,
        json: async () => ({
          id: "task-3",
          status: "image_queue_running",
          stateAuthority: "server_durable",
          progress: 61,
        }),
      };
    });

    const { getTask } = await import("@/lib/client/db");
    const result = await getTask("task-3");

    expect(fetchMock).toHaveBeenCalledWith("/api/tasks/task-3", expect.anything());
    expect(result).toMatchObject(localSnapshot);
    expect(result).not.toMatchObject({ stateAuthority: "server_durable", progress: 61 });
    expect(cachePutMock).not.toHaveBeenCalled();
  });
});
