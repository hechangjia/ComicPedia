import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerateTask, TaskListItem } from "@/lib/types";
import HistoryPage from "@/app/history/page";
import ResultPage from "@/app/result/[id]/page";

const {
  navigationState,
  historyCacheState,
  routerReplaceMock,
  getComicSummariesMock,
  getAllComicsMock,
  useTaskSubscriptionMock,
  useTaskActionsMock,
  resumeTaskLifecycleMock,
} = vi.hoisted(() => ({
  navigationState: {
    filter: null as string | null,
    returnTo: null as string | null,
    params: { id: "task-result-1" },
  },
  historyCacheState: {
    items: [] as TaskListItem[],
  },
  routerReplaceMock: vi.fn(),
  getComicSummariesMock: vi.fn(),
  getAllComicsMock: vi.fn(),
  useTaskSubscriptionMock: vi.fn(),
  useTaskActionsMock: vi.fn(),
  resumeTaskLifecycleMock: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    React.createElement("a", { href, ...props }, children)
  ),
}));

vi.mock("next/dynamic", () => ({
  default: (factory: any) => {
    const str = factory.toString();
    const match = str.match(/m\.(\w+)/) || str.match(/import\([`'"].*\/([^/`'"]+)[`'"]\)/);
    const name = match ? match[1] : "DynamicStub";
    return (props: Record<string, unknown>) => React.createElement("div", {
      "data-dynamic-stub": true,
      "data-dynamic-name": name,
      ...(props as Record<string, unknown>),
    });
  },
}));

vi.mock("@/components/result/QuizPanel", () => ({
  QuizPanel: () => React.createElement("div", { "data-testid": "quiz-panel" }, "QuizPanel"),
}));

vi.mock("@/components/result/RelatedTopicsPanel", () => ({
  RelatedTopicsPanel: () => React.createElement("div", { "data-testid": "related-topics-panel" }, "RelatedTopicsPanel"),
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
  getComicSummaries: getComicSummariesMock,
  getAllComics: getAllComicsMock,
  getTask: vi.fn(),
  deleteComic: vi.fn(),
  clearAllComics: vi.fn(),
  saveTask: vi.fn(),
}));

vi.mock("@/stores/listCache", () => ({
  useListCache: () => ({
    getTaskSummaries: () => ({
      items: historyCacheState.items,
      total: historyCacheState.items.length,
    }),
    setTaskSummaries: vi.fn(),
    invalidateTaskSummaries: vi.fn(),
    getTasks: vi.fn(),
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
  resumeTaskLifecycle: resumeTaskLifecycleMock,
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
    llmConfigs: [{ id: "llm-1", name: "GPT-4.1", model: "gpt-4.1" }],
    imageConfigs: [{ id: "img-1", name: "Image Model", model: "gpt-image-1" }],
  })),
  getStoredRequestConfigs: vi.fn(() => ({
    llmConfig: { model: "gpt-4.1" },
  })),
}));

vi.mock("@/hooks/useUIMode", () => ({
  useUIMode: () => ({
    mode: "advanced",
    isSimpleMode: false,
    isAdvancedMode: true,
    setMode: vi.fn(),
    toggleMode: vi.fn(),
  }),
}));

vi.mock("@/components/StorageIndicator", () => ({
  StorageIndicator: () => React.createElement("div", null, "StorageIndicator"),
}));

vi.mock("@/components/Skeleton", () => ({
  TitleSkeleton: () => React.createElement("div", null, "TitleSkeleton"),
  ComicGridSkeleton: () => React.createElement("div", null, "ComicGridSkeleton"),
}));

function makeHistoryTask(overrides: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id: "task-history-default",
    origin: "user",
    status: "script_ready",
    progress: 20,
    createdAt: new Date("2026-04-05T00:00:00.000Z"),
    updatedAt: new Date("2026-04-05T00:00:00.000Z"),
    scriptSummary: {
      title: "默认漫画",
      topic: "默认主题",
      style: "flat",
      panelCount: 1,
    },
    ...overrides,
  } as TaskListItem;
}

function makeResultTask(overrides: Partial<GenerateTask> = {}): GenerateTask {
  return makeHistoryTask({
    id: "task-result-1",
    status: "image_queue_paused",
    progress: 60,
    queueSummary: {
      queued: 0,
      running: 0,
      paused: 1,
      failed: 0,
      attachFailed: 0,
      completed: 0,
      calibrationPending: 0,
    },
    ...overrides,
  });
}

function makeQueuedResultTask(status: GenerateTask["status"]): GenerateTask {
  return makeResultTask({
    status,
    script: {
      title: "队列中的漫画",
      topic: "队列主题",
      style: "flat",
      panels: [
        {
          id: 1,
          scene: "队列场景一",
          dialogue: "队列对白一",
          imagePrompt: "queued prompt 1",
          status: "completed",
          imageUrl: "file://queued-panel-1",
        },
        {
          id: 2,
          scene: "队列场景二",
          dialogue: "队列对白二",
          imagePrompt: "queued prompt 2",
          status: "pending",
        },
      ],
    },
  });
}

function makeDeepReviewPausedTask(overrides: Partial<GenerateTask> = {}): GenerateTask {
  return makeHistoryTask({
    id: "task-review-paused-1",
    status: "deep_review_paused",
    progress: 90,
    script: {
      title: "深度评审暂停中的漫画",
      topic: "评审主题",
      style: "flat",
      panels: [
        {
          id: 1,
          scene: "评审场景一",
          dialogue: "评审对白一",
          imagePrompt: "review prompt 1",
          status: "completed",
          imageUrl: "file://review-panel-1",
        },
      ],
    },
    ...overrides,
  });
}

function makeDeepReviewRunningTask(overrides: Partial<GenerateTask> = {}): GenerateTask {
  return makeHistoryTask({
    id: "task-review-running-1",
    status: "deep_review_running",
    progress: 80,
    script: {
      title: "深度评审中的漫画",
      topic: "评审主题",
      style: "flat",
      panels: [
        {
          id: 1,
          scene: "评审场景一",
          dialogue: "评审对白一",
          imagePrompt: "review prompt 1",
          status: "completed",
          imageUrl: "file://review-panel-1",
        },
      ],
    },
    ...overrides,
  });
}

describe("page navigation render", () => {
  beforeEach(() => {
    navigationState.filter = null;
    navigationState.returnTo = null;
    navigationState.params = { id: "task-result-1" };
    historyCacheState.items = [];
    routerReplaceMock.mockReset();
    getComicSummariesMock.mockReset();
    getAllComicsMock.mockReset();
    getComicSummariesMock.mockResolvedValue({ items: [], total: 0, hasMore: false });
    getAllComicsMock.mockResolvedValue({ items: [], total: 0, hasMore: false });
    useTaskSubscriptionMock.mockReset();
    useTaskSubscriptionMock.mockReturnValue({
      task: null,
      setTask: vi.fn(),
      error: "任务不存在",
    });
    useTaskActionsMock.mockReset();
    useTaskActionsMock.mockReturnValue({
      handleSaveQualityScore: vi.fn(),
      handleSaveVisualQualityScore: vi.fn(),
      handleSaveVisualDiagnosisReport: vi.fn(),
      handleSaveVisualDiagnosisFailure: vi.fn(),
      handleBeginVisualRepairExecution: vi.fn(),
      handleCompleteVisualRepairExecution: vi.fn(),
      handleFailVisualRepairExecution: vi.fn(),
      handlePanelUpdate: vi.fn(),
      handleRegenerate: vi.fn(),
      handleCancel: vi.fn(),
      handleVersionChange: vi.fn(),
      handleQueuePanel: vi.fn(),
      handleQueueSelectedPanels: vi.fn(),
      handleContinueRemaining: vi.fn(),
      handlePauseQueue: vi.fn(),
      handleResumeQueue: vi.fn(),
      handleStartDeepReview: vi.fn(),
      handleRetryFailed: vi.fn(),
      handleReferenceImageChange: vi.fn(),
      handleReferenceImagesChange: vi.fn(),
      handleControlModeChange: vi.fn(),
      handleRegenerateRef: vi.fn(),
      handleImg2Img: vi.fn(),
      handleRefVersionChange: vi.fn(),
      handleRefEntriesChange: vi.fn(),
      handleRegenerateScript: vi.fn(),
      handleChangeStyle: vi.fn(),
      handleReorder: vi.fn(),
      handleVlmRetry: vi.fn(),
      handleRunDiagnosisRepair: vi.fn(),
      generatingAll: false,
      actionError: null,
      clearActionError: vi.fn(),
    });
    resumeTaskLifecycleMock.mockReset();
    resumeTaskLifecycleMock.mockResolvedValue(undefined);
  });

  it("renders only filtered history cards and preserves the filter in result links", () => {
    navigationState.filter = "image_queue_running";
    historyCacheState.items = [
      makeHistoryTask({
        id: "task-running",
        status: "image_queue_running",
        scriptSummary: {
          title: "队列中的漫画",
          topic: "队列主题",
          style: "flat",
          panelCount: 1,
        },
      }),
      makeHistoryTask({
        id: "task-completed",
        status: "completed",
        scriptSummary: {
          title: "已完成漫画",
          topic: "完成主题",
          style: "flat",
          panelCount: 1,
          coverImageUrl: "file://done-panel",
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

  it("shows only one resume action for image queue paused tasks", () => {
    useTaskSubscriptionMock.mockReturnValue({
      task: makeResultTask({ status: "image_queue_paused" }),
      setTask: vi.fn(),
      error: "",
    });

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect(html).toContain("离页后图片生成已暂停。");
    expect((html.match(/继续生成/g) ?? []).length).toBe(1);
    expect(html).not.toContain("恢复队列");
    expect(html).not.toContain("离页后深度评审已暂停。");
  });

  it("keeps read and play view toggles available while the image queue is paused", () => {
    useTaskSubscriptionMock.mockReturnValue({
      task: makeQueuedResultTask("image_queue_paused"),
      setTask: vi.fn(),
      error: "",
    });

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect(html).not.toContain("编辑模式");
    expect(html).toContain("阅读模式");
    expect(html).toContain("播放模式");
  });

  it("defaults image queue paused tasks to read view instead of edit grid", () => {
    useTaskSubscriptionMock.mockReturnValue({
      task: makeResultTask({
        status: "image_queue_paused",
        script: {
          title: "暂停中的漫画",
          topic: "暂停主题",
          style: "flat",
          panels: [
            {
              id: 1,
              scene: "暂停场景一",
              dialogue: "暂停对白一",
              imagePrompt: "paused prompt 1",
              status: "completed",
              imageUrl: "file://paused-panel-1",
            },
          ],
        },
      }),
      setTask: vi.fn(),
      error: "",
    });

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect(html).toContain("阅读模式</button>");
    expect(html).toContain("bg-background shadow-sm text-foreground\">阅读模式");
  });

  it("does not treat image queue paused tasks as script ready workspace copy", () => {
    useTaskSubscriptionMock.mockReturnValue({
      task: makeResultTask({ status: "image_queue_paused" }),
      setTask: vi.fn(),
      error: "",
    });

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect(html).not.toContain("脚本待审");
  });

  it("does not expose failed-panel retry actions while the image queue is paused", () => {
    useTaskSubscriptionMock.mockReturnValue({
      task: makeResultTask({
        status: "image_queue_paused",
        script: {
          title: "暂停中的失败面板",
          topic: "暂停主题",
          style: "flat",
          panels: [
            {
              id: 1,
              scene: "失败场景",
              dialogue: "失败对白",
              imagePrompt: "failed prompt",
              status: "failed",
            },
          ],
        },
      }),
      setTask: vi.fn(),
      error: "",
    });

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect(html).not.toContain("aria-label=\"重试第 1 格图片生成\"");
  });

  it("does not expose sticky start-image actions while the queue is paused", () => {
    useTaskSubscriptionMock.mockReturnValue({
      task: makeResultTask({ status: "image_queue_paused" }),
      setTask: vi.fn(),
      error: "",
    });

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect(html).not.toContain("开始生成图片");
    expect(html).not.toContain("重新生成脚本");
  });

  it("shows start image generation button in sticky bar for script_ready tasks", () => {
    useTaskSubscriptionMock.mockReturnValue({
      task: makeResultTask({ status: "script_ready" }),
      setTask: vi.fn(),
      error: "",
    });

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect((html.match(/开始生成图片/g) ?? []).length).toBe(1);
    expect((html.match(/重新生成脚本/g) ?? []).length).toBe(1);
  });

  it("shows image-generation animation for calibrating tasks", () => {
    useTaskSubscriptionMock.mockReturnValue({
      task: makeResultTask({ status: "calibrating" }),
      setTask: vi.fn(),
      error: "",
    });

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect(html).toContain("绘制漫画图片...");
    expect(html).toContain("图片生成");
    expect(html).not.toContain("阅读模式");
    expect(html).not.toContain("播放模式");
  });

  it("keeps read and play view toggles available while deep review is paused", () => {
    useTaskSubscriptionMock.mockReturnValue({
      task: makeDeepReviewPausedTask(),
      setTask: vi.fn(),
      error: "",
    });

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect(html).not.toContain("编辑模式");
    expect(html).toContain("阅读模式");
    expect(html).toContain("播放模式");
  });

  it("defaults deep review paused tasks to read view instead of edit grid", () => {
    useTaskSubscriptionMock.mockReturnValue({
      task: makeDeepReviewPausedTask(),
      setTask: vi.fn(),
      error: "",
    });

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect(html).toContain("阅读模式</button>");
    expect(html).toContain("bg-background shadow-sm text-foreground\">阅读模式");
  });

  it("does not expose empty quality-score tabs while deep review is paused without diagnosis data", () => {
    useTaskSubscriptionMock.mockReturnValue({
      task: makeDeepReviewPausedTask({
        visualDiagnosisReport: undefined,
        visualQualityScore: undefined,
        qualityScore: undefined,
      }),
      setTask: vi.fn(),
      error: "",
    });

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect(html).not.toContain("质量评分");
  });

  it("does not expose script regeneration affordance while queue is running", () => {
    useTaskSubscriptionMock.mockReturnValue({
      task: makeQueuedResultTask("image_queue_running"),
      setTask: vi.fn(),
      error: "",
    });

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect(html).not.toContain("Regenerate Script");
    expect(html).toContain("暂停队列");
    expect(html).not.toContain("阅读模式");
    expect(html).not.toContain("播放模式");
  });

  it("does not expose read-play toggles while deep review is running", () => {
    useTaskSubscriptionMock.mockReturnValue({
      task: makeDeepReviewRunningTask(),
      setTask: vi.fn(),
      error: "",
    });

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect(html).not.toContain("阅读模式");
    expect(html).not.toContain("播放模式");
    expect(html).not.toContain("继续评审");
  });

  it("does not expose export affordances while the script is only ready", () => {
    useTaskSubscriptionMock.mockReturnValue({
      task: makeHistoryTask({ status: "script_ready" }),
      setTask: vi.fn(),
      error: "",
    });

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect(html).not.toContain("导出 Markdown");
  });

  it("does not expose duplicate export markdown actions after completion", () => {
    useTaskSubscriptionMock.mockReturnValue({
      task: makeHistoryTask({
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
      setTask: vi.fn(),
      error: "",
    });

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect((html.match(/Markdown<\/button>/g) ?? []).length).toBe(1);
  });

  it("does not expose empty quality-score tab after completion without any score data", () => {
    useTaskSubscriptionMock.mockReturnValue({
      task: makeHistoryTask({
        status: "completed",
        qualityScore: undefined,
        visualQualityScore: undefined,
        visualDiagnosisReport: undefined,
        visualDiagnosisState: undefined,
        visualRetrySummary: undefined,
        script: {
          title: "无评分完成漫画",
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
      setTask: vi.fn(),
      error: "",
    });

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect(html).not.toContain("质量评分");
  });

  it("does not expose empty director tab after completion without outline data", () => {
    useTaskSubscriptionMock.mockReturnValue({
      task: makeHistoryTask({
        status: "completed",
        narrativeOutline: undefined,
        script: {
          title: "无导演数据完成漫画",
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
      setTask: vi.fn(),
      error: "",
    });

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect(html).not.toContain("AI 导演");
  });

  it("does not expose empty accuracy tab after completion without review data", () => {
    useTaskSubscriptionMock.mockReturnValue({
      task: makeHistoryTask({
        status: "completed",
        researchBrief: undefined,
        accuracyReview: undefined,
        accuracyErrorSummary: undefined,
        script: {
          title: "无评审数据完成漫画",
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
      setTask: vi.fn(),
      error: "",
    });

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect(html).not.toContain(">准确性<");
  });

  it("does not expose empty script-validation tab after completion without validation data", () => {
    useTaskSubscriptionMock.mockReturnValue({
      task: makeHistoryTask({
        status: "completed",
        scriptValidation: undefined,
        scriptRepairRounds: undefined,
        script: {
          title: "无校验数据完成漫画",
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
      setTask: vi.fn(),
      error: "",
    });

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect(html).not.toContain(">脚本校验<");
  });

  it("falls back to pipeline summary when trace data is absent after completion", () => {
    useTaskSubscriptionMock.mockReturnValue({
      task: makeHistoryTask({
        status: "completed",
        pipelineTrace: undefined,
        script: {
          title: "无管线数据完成漫画",
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
      setTask: vi.fn(),
      error: "",
    });

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect(html).toContain("Agent 管线摘要");
  });

  it("does not mount quiz and related-topics modules after completion without supporting data", () => {
    useTaskSubscriptionMock.mockReturnValue({
      task: makeHistoryTask({
        status: "completed",
        script: {
          title: "普通完成漫画",
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
          quiz: undefined,
          relatedTopics: undefined,
        },
      }),
      setTask: vi.fn(),
      error: "",
    });

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect(html).not.toContain('data-testid="quiz-panel"');
    expect(html).not.toContain('data-testid="related-topics-panel"');
  });

  it("does not expose panel editing affordances after completion", () => {
    useTaskSubscriptionMock.mockReturnValue({
      task: makeHistoryTask({
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
      setTask: vi.fn(),
      error: "",
    });

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect(html).not.toContain("aria-label=\"编辑第 1 格\"");
  });

  it("does not expose script-stage batch controls after completion", () => {
    useTaskSubscriptionMock.mockReturnValue({
      task: makeHistoryTask({
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
      setTask: vi.fn(),
      error: "",
    });

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect(html).not.toContain("画面风格：");
    expect(html).not.toContain("参考图（可选，支持多张）");
  });

  it("keeps edit mode toggle available after completion", () => {
    useTaskSubscriptionMock.mockReturnValue({
      task: makeHistoryTask({
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
      setTask: vi.fn(),
      error: "",
    });

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect(html).toContain("编辑模式");
    expect(html).toContain("阅读模式");
    expect(html).toContain("播放模式");
  });

  it("does not expose panel reorder affordances after completion", () => {
    useTaskSubscriptionMock.mockReturnValue({
      task: makeHistoryTask({
        status: "completed",
        script: {
          title: "已完成漫画",
          topic: "完成主题",
          style: "flat",
          panels: [
            {
              id: 1,
              scene: "完成场景一",
              dialogue: "完成对白一",
              imagePrompt: "done prompt 1",
              status: "completed",
              imageUrl: "file://done-panel-1",
            },
            {
              id: 2,
              scene: "完成场景二",
              dialogue: "完成对白二",
              imagePrompt: "done prompt 2",
              status: "completed",
              imageUrl: "file://done-panel-2",
            },
          ],
        },
      }),
      setTask: vi.fn(),
      error: "",
    });

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect(html).not.toContain("draggable=\"true\"");
  });

  it("defaults completed tasks to read view instead of edit view", () => {
    useTaskSubscriptionMock.mockReturnValue({
      task: makeHistoryTask({
        status: "completed",
        script: {
          title: "已完成漫画",
          topic: "完成主题",
          style: "flat",
          panels: [
            {
              id: 1,
              scene: "完成场景一",
              dialogue: "完成对白一",
              imagePrompt: "done prompt 1",
              status: "completed",
              imageUrl: "file://done-panel-1",
            },
          ],
        },
      }),
      setTask: vi.fn(),
      error: "",
    });

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect(html).toContain("阅读模式</button>");
    expect(html).toContain("bg-background shadow-sm text-foreground\">阅读模式");
    expect(html).not.toContain("确认修改");
  });

  it("keeps edit mode available for completed tasks so finished comics can still be revised", () => {
    useTaskSubscriptionMock.mockReturnValue({
      task: makeHistoryTask({
        status: "completed",
        script: {
          title: "已完成漫画",
          topic: "完成主题",
          style: "flat",
          panels: [
            {
              id: 1,
              scene: "完成场景一",
              dialogue: "完成对白一",
              imagePrompt: "done prompt 1",
              status: "completed",
              imageUrl: "file://done-panel-1",
            },
          ],
        },
      }),
      setTask: vi.fn(),
      error: "",
    });

    const html = renderToStaticMarkup(React.createElement(ResultPage));

    expect(html).toContain("编辑模式");
    expect(html).toContain("阅读模式");
    expect(html).toContain("播放模式");
  });
});
