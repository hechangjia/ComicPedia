import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const searchWithProviderMock = vi.fn();
const fetchWithProviderMock = vi.fn();
const getAssignedProviderMock = vi.fn();
const resolveAccuracyProvidersMock = vi.fn();
const getConfigMock = vi.fn();
const saveConfigMock = vi.fn();

vi.mock("@/lib/accuracy/providerClients", () => ({
  searchWithProvider: searchWithProviderMock,
  fetchWithProvider: fetchWithProviderMock,
}));

vi.mock("@/lib/accuracy/providerRegistry", () => ({
  getAssignedProvider: getAssignedProviderMock,
  resolveAccuracyProviders: resolveAccuracyProvidersMock,
}));

vi.mock("@/lib/server/db", () => ({
  getConfig: getConfigMock,
  saveConfig: saveConfigMock,
}));

function makeConfig() {
  return {
    version: 2,
    llmConfigs: [],
    imageConfigs: [],
    vlmConfigs: [],
    activeLLMId: null,
    activeImageId: null,
    activeVLMId: null,
    updatedAt: "2026-04-09T00:00:00.000Z",
    accuracyConfig: {
      providers: [
        { id: "search-1", kind: "search", healthStatus: "idle" },
        { id: "fetch-1", kind: "fetch", healthStatus: "idle" },
      ],
    },
  } as any;
}

describe("/api/accuracy/providers/test POST", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    searchWithProviderMock.mockReset();
    fetchWithProviderMock.mockReset();
    getAssignedProviderMock.mockReset();
    resolveAccuracyProvidersMock.mockReset();
    getConfigMock.mockReset();
    saveConfigMock.mockReset();
    resolveAccuracyProvidersMock.mockImplementation((accuracyConfig: { providers: unknown[] }) => accuracyConfig.providers);
    getAssignedProviderMock.mockReturnValue(null);
  });

  it("requires providerId", async () => {
    const { POST } = await import("@/app/api/accuracy/providers/test/route");
    const request = new NextRequest("http://localhost:3000/api/accuracy/providers/test", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "缺少 providerId" });
  });

  it("requires saved config before testing a provider", async () => {
    getConfigMock.mockReturnValue(null);

    const { POST } = await import("@/app/api/accuracy/providers/test/route");
    const request = new NextRequest("http://localhost:3000/api/accuracy/providers/test", {
      method: "POST",
      body: JSON.stringify({ providerId: "search-1" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "尚未保存配置" });
  });

  it("returns 404 when the provider cannot be resolved", async () => {
    getConfigMock.mockReturnValue(makeConfig());
    resolveAccuracyProvidersMock.mockReturnValue([]);

    const { POST } = await import("@/app/api/accuracy/providers/test/route");
    const request = new NextRequest("http://localhost:3000/api/accuracy/providers/test", {
      method: "POST",
      body: JSON.stringify({ providerId: "missing" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "未找到该 provider" });
    expect(saveConfigMock).not.toHaveBeenCalled();
  });

  it("marks search providers healthy after a successful smoke test", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T10:00:00.000Z"));
    getConfigMock.mockReturnValue(makeConfig());
    searchWithProviderMock.mockResolvedValue([{ title: "Smoke Result" }]);

    const { POST } = await import("@/app/api/accuracy/providers/test/route");
    const request = new NextRequest("http://localhost:3000/api/accuracy/providers/test", {
      method: "POST",
      body: JSON.stringify({ providerId: "search-1" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(searchWithProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "search-1", kind: "search" }),
      "ComicPedia accuracy smoke test",
      { limit: 1, timeoutMs: 8000 },
    );
    expect(saveConfigMock).toHaveBeenCalledWith(expect.objectContaining({
      accuracyConfig: expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({
            id: "search-1",
            healthStatus: "success",
            lastCheckedAt: "2026-04-09T10:00:00.000Z",
            lastError: undefined,
          }),
        ]),
      }),
    }));
    expect(body).toEqual({
      status: "success",
      message: "连接成功",
      detail: "首条结果：Smoke Result",
      healthStatus: "success",
      lastCheckedAt: "2026-04-09T10:00:00.000Z",
    });
  });

  it("marks provider health as error when the smoke test fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T10:00:00.000Z"));
    getConfigMock.mockReturnValue(makeConfig());
    fetchWithProviderMock.mockRejectedValue(new Error("network failed"));

    const { POST } = await import("@/app/api/accuracy/providers/test/route");
    const request = new NextRequest("http://localhost:3000/api/accuracy/providers/test", {
      method: "POST",
      body: JSON.stringify({ providerId: "fetch-1" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(fetchWithProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "fetch-1", kind: "fetch" }),
      "https://example.com",
      { timeoutMs: 8000 },
    );
    expect(saveConfigMock).toHaveBeenCalledWith(expect.objectContaining({
      accuracyConfig: expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({
            id: "fetch-1",
            healthStatus: "error",
            lastCheckedAt: "2026-04-09T10:00:00.000Z",
            lastError: "network failed",
          }),
        ]),
      }),
    }));
    expect(body).toEqual({
      status: "error",
      message: "连接失败",
      detail: "network failed",
      healthStatus: "error",
      lastCheckedAt: "2026-04-09T10:00:00.000Z",
      lastError: "network failed",
    });
  });
});
