import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerateTask } from "@/lib/types";
import HistoryPage from "@/app/history/page";
import ResultPage from "@/app/result/[id]/page";

const {
  navigationState,
  historyCacheState,
  routerReplaceMock,
  getAllComicsMock,
  useTaskSubscriptionMock,
  useTaskActionsMock,
} = vi.hoisted(() => ({
  navigationState: {
    filter: null as string | null,
    returnTo: null as string | null,
    params: { id: "task-result-1" },
  },
  historyCacheState: {
    items: [] as GenerateTask[],
  },
  routerReplaceMock: vi.fn(),
  getAllComicsMock: vi.fn(),
  useTaskSubscriptionMock: vi.fn(),
  useTaskActionsMock: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    React.createElement("a", { href, ...props }, children)
  ),
}));

vi.mock("next/dynamic", () => ({
  default: () => () => React.createElement("div", { "data-dynamic-stub": true }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: routerReplaceMock,
  }),
  useSearchParams: () => ({
    get: (key: string) => {
      if (key === "filter") return navigationState.filter;
      if (key === "returnTo") return navigationState.returnTo;
      return null;
    },
    toString: () => {
      const params = new URLSearchParams();
      if (navigationState.filter) params.set("filter", navigationState.filter);
      if (navigationState.returnTo) params.set("returnTo", navigationState.returnTo);
      return params.toString();
    },
  }),
  useParams: () => navigationState.params,
}));

vi.mock("@/lib/client/db", () => ({
  getAllComics: getAllComicsMock,
  deleteComic: vi.fn(),
  clearAllComics: vi.fn(),
  saveTask: vi.fn(),
}));

vi.mock("@/stores/listCache", () => ({
  useListCache: () => ({
    getTasks: () => ({
      items: historyCacheState.items,
      total: historyCacheState.items.length,
    }),
    setTasks: vi.fn(),
    invalidateTasks: vi.fn(),
  }),
}));

vi.mock("@/lib/client/generator", () => ({
  recoverZombieTask: vi.fn(),
  cancelGeneration: vi.fn(),
}));

vi.mock("@/hooks/useTaskPageLifecycle", () => ({
  reconcileTaskLifecycle: vi.fn(),
  shouldAttemptOffPageReconcile: vi.fn(() => false),
  resumeTaskLifecycle: vi.fn(),
  useTaskPageLifecycle: vi.fn(),
}));

vi.mock("@/hooks/useTaskSubscription", () => ({
  useTaskSubscription: useTaskSubscriptionMock,
}));

vi.mock("@/hooks/useTaskActions", () => ({
  useTaskActions: useTaskActionsMock,
}));

vi.mock("@/hooks/useAPIConfig", () => ({
  getStoredConfigs: vi.fn(() => ({
    activeImageId: "img-1",
    activeLLMId: "llm-1",
  })),
  getStoredRequestConfigs: vi.fn(() => ({
    llmConfig: { model: "gpt-4.1" },
  })),
}));

vi.mock("@/components/StorageIndicator", () => ({
  StorageIndicator: () => React.createElement("div", null, "StorageIndicator"),
}));

vi.mock("@/components/Skeleton", () => ({
  TitleSkeleton: () => React.createElement("div", null, "TitleSkeleton"),
  ComicGridSkeleton: () => React.createElement("div", null, "ComicGridSkeleton"),
}));

function makeHistoryTask(overrides: Partial<GenerateTask> = {}): GenerateTask {
  return {
    id: "task-history-default",
    status: "script_ready",
    progress: 20,
    createdAt: new Date("2026-04-05T00:00:00.000Z"),
    updatedAt: new Date("2026-04-05T00:00:00.000Z"),
    script: {
      title: "默认漫画",
      topic: "默认主题",
      style: "flat",
      panels: [
        {
          id: 1,
          scene: "场景一",
          dialogue: "对白一",
          imagePrompt: "prompt 1",
          status: "pending",
        },
      ],
    },
    ...overrides,
  } as GenerateTask;
}

describe("page navigation render", () => {
  beforeEach(() => {
    navigationState.filter = null;
    navigationState.returnTo = null;
    navigationState.params = { id: "task-result-1" };
    historyCacheState.items = [];
    routerReplaceMock.mockReset();
    getAllComicsMock.mockReset();
    getAllComicsMock.mockResolvedValue({ items: [], total: 0, hasMore: false });
    useTaskSubscriptionMock.mockReset();
    useTaskSubscriptionMock.mockReturnValue({
      task: null,
      setTask: vi.fn(),
      error: "任务不存在",
    });
    useTaskActionsMock.mockReset();
    useTaskActionsMock.mockReturnValue({
      generatingAll: false,
      actionError: null,
      clearActionError: vi.fn(),
    });
  });

  it("renders only filtered history cards and preserves the filter in result links", () => {
    navigationState.filter = "image_queue_running";
    historyCacheState.items = [
      makeHistoryTask({
        id: "task-running",
        status: "image_queue_running",
        script: {
          title: "队列中的漫画",
          topic: "队列主题",
          style: "flat",
          panels: [
            {
              id: 1,
              scene: "队列场景",
              dialogue: "队列对白",
              imagePrompt: "queue prompt",
              status: "pending",
            },
          ],
        },
      }),
      makeHistoryTask({
        id: "task-completed",
        status: "completed",
        script: {
          title: "已完成漫画",
          topic: "完成主题",
          style: "flat",
          panels: [
            {
              id: 1,
              scene: "完成场景",
              dialogue: "完成对白",
              imagePrompt: "done prompt",
              status: "completed",
              imageUrl: "file://done-panel",
            },
          ],
        },
      }),
    ];

    const html = renderToStaticMarkup(React.createElement(HistoryPage));

    expect(html).toContain("队列中的漫画");
    expect(html).not.toContain("已完成漫画");
    expect(html).toContain("/result/task-running?returnTo=%2Fhistory%3Ffilter%3Dimage_queue_running");
    expect(html).toContain("图片队列中 1");
  });

  it("uses a safe history returnTo link on the result page", () => {
    navigationState.returnTo = "/history?filter=comfyui_remote_pending";

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect(html).toContain("任务不存在");
    expect(html).toContain("href=\"/history?filter=comfyui_remote_pending\"");
    expect(html).toContain("返回历史");
  });

  it("falls back to home when returnTo is not a history route", () => {
    navigationState.returnTo = "https://example.com/redirect";

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect(html).toContain("href=\"/\"");
    expect(html).toContain("返回首页");
  });
});
