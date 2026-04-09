import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerateTask } from "@/lib/types";

const {
  getTaskMock,
  saveTaskMock,
  notifyListenersMock,
  getImageAdapterMock,
  urlToBase64Mock,
  withRetryMock,
  mergeReferenceImageMock,
  fetchMock,
} = vi.hoisted(() => ({
  getTaskMock: vi.fn(),
  saveTaskMock: vi.fn(),
  notifyListenersMock: vi.fn(),
  getImageAdapterMock: vi.fn(),
  urlToBase64Mock: vi.fn(),
  withRetryMock: vi.fn(),
  mergeReferenceImageMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("@/lib/client/db", () => ({
  getTask: getTaskMock,
  saveTask: saveTaskMock,
}));

vi.mock("@/lib/client/eventBus", () => ({
  notifyListeners: notifyListenersMock,
}));

vi.mock("@/lib/imageGen", () => ({
  getImageAdapter: getImageAdapterMock,
}));

vi.mock("@/lib/utils", () => ({
  urlToBase64: urlToBase64Mock,
}));

vi.mock("@/lib/retryQueue", () => ({
  withRetry: withRetryMock,
}));

vi.mock("@/lib/client/abortManager", () => ({
  abortControllers: new Map(),
  abortKey: vi.fn((taskId: string, panelIndex: number) => `${taskId}:${panelIndex}`),
}));

vi.mock("@/lib/client/promptEnhancer", () => ({
  buildEnhancedPrompt: vi.fn((prompt: string) => prompt),
  mergeReferenceImage: mergeReferenceImageMock,
}));

const originalFetch = globalThis.fetch;

function makeTask(): GenerateTask {
  return {
    id: "task-panel",
    status: "completed",
    progress: 100,
    createdAt: new Date("2026-04-08T00:00:00.000Z"),
    updatedAt: new Date("2026-04-08T00:00:00.000Z"),
    script: {
      title: "Panel Task",
      topic: "Topic",
      style: "anime",
      characterDescription: "hero",
      panels: [
        {
          id: 1,
          scene: "Scene 1",
          dialogue: "Dialogue 1",
          imagePrompt: "Prompt 1",
          imageUrl: "data:image/png;base64,previous",
          imageVersions: [{ imageUrl: "data:image/png;base64,previous", createdAt: 1 }],
          activeVersionIndex: 0,
          status: "completed",
        },
      ],
    },
  };
}

describe("panelManager regeneratePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = fetchMock as typeof fetch;
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        ref: "file://task-panel_panel0_cur",
        url: "/api/images/task-panel_panel0_cur",
        key: "task-panel_panel0_cur",
      }),
    } as unknown as Response);
    saveTaskMock.mockResolvedValue(undefined);
    mergeReferenceImageMock.mockImplementation((config) => config);
    withRetryMock.mockImplementation(async (run: () => Promise<string>) => run());
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it("persists regenerated panel images as canonical /api/images urls", async () => {
    const initialTask = makeTask();
    const freshTask = makeTask();
    let resolveBase64: ((value: string) => void) | undefined;

    getTaskMock
      .mockResolvedValueOnce(initialTask)
      .mockResolvedValueOnce(freshTask);

    getImageAdapterMock.mockReturnValue({
      generate: vi.fn().mockResolvedValue("https://example.com/generated.png"),
    });

    urlToBase64Mock.mockImplementation(() => new Promise<string>((resolve) => {
      resolveBase64 = resolve;
    }));

    const { regeneratePanel } = await import("@/lib/client/panelManager");
    const work = regeneratePanel("task-panel", 0, { model: "img-1" });

    await vi.waitFor(() => {
      expect(urlToBase64Mock).toHaveBeenCalledTimes(1);
    });
    resolveBase64?.("data:image/png;base64,generated");

    await work;
    await Promise.resolve();

    expect(saveTaskMock).toHaveBeenLastCalledWith(expect.objectContaining({
      script: expect.objectContaining({
        panels: [
          expect.objectContaining({
            status: "completed",
            imageUrl: "/api/images/task-panel_panel0_cur",
            imageVersions: expect.arrayContaining([
              expect.objectContaining({ imageUrl: "/api/images/task-panel_panel0_cur" }),
            ]),
          }),
        ],
      }),
    }));
  });
});
