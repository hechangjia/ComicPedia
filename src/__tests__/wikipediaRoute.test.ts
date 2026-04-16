import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getWikipediaSummaryCachedMock = vi.fn();
const isWikipediaLanguageSupportedMock = vi.fn();
const searchWikipediaCachedMock = vi.fn();

vi.mock("@/lib/server/wikipedia", () => ({
  getWikipediaSummaryCached: getWikipediaSummaryCachedMock,
  isWikipediaLanguageSupported: isWikipediaLanguageSupportedMock,
  searchWikipediaCached: searchWikipediaCachedMock,
}));

describe("/api/wikipedia GET", () => {
  beforeEach(() => {
    getWikipediaSummaryCachedMock.mockReset();
    isWikipediaLanguageSupportedMock.mockReset();
    searchWikipediaCachedMock.mockReset();
    isWikipediaLanguageSupportedMock.mockReturnValue(true);
  });

  it("rejects unsupported languages", async () => {
    isWikipediaLanguageSupportedMock.mockReturnValue(false);

    const { GET } = await import("@/app/api/wikipedia/route");
    const response = await GET(new NextRequest("http://localhost:3000/api/wikipedia?q=雷电&lang=jp"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "不支持的语言: jp" });
    expect(searchWikipediaCachedMock).not.toHaveBeenCalled();
  });

  it("requires either q or title", async () => {
    const { GET } = await import("@/app/api/wikipedia/route");
    const response = await GET(new NextRequest("http://localhost:3000/api/wikipedia"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "请提供 q (搜索关键词) 或 title (文章标题) 参数",
    });
  });

  it("returns search results and cached marker in search mode", async () => {
    searchWikipediaCachedMock.mockResolvedValue({
      results: [{ title: "雷", description: "天气现象" }],
      cached: true,
    });

    const { GET } = await import("@/app/api/wikipedia/route");
    const response = await GET(new NextRequest("http://localhost:3000/api/wikipedia?q=%E9%9B%B7&lang=zh"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: [{ title: "雷", description: "天气现象" }],
      lang: "zh",
      cached: true,
    });
    expect(searchWikipediaCachedMock).toHaveBeenCalledWith("雷", "zh");
    expect(getWikipediaSummaryCachedMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the requested article is missing", async () => {
    getWikipediaSummaryCachedMock.mockResolvedValue({
      summary: null,
      cached: false,
    });

    const { GET } = await import("@/app/api/wikipedia/route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/wikipedia?title=%E9%9B%B7%E7%94%B5&lang=zh"),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "未找到该文章" });
  });

  it("maps timeout errors to 504", async () => {
    const timeoutError = new Error("timeout");
    timeoutError.name = "TimeoutError";
    getWikipediaSummaryCachedMock.mockRejectedValue(timeoutError);

    const { GET } = await import("@/app/api/wikipedia/route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/wikipedia?title=%E9%9B%B7%E7%94%B5&lang=zh"),
    );

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({
      error: "Wikipedia 请求超时，请稍后重试",
    });
  });
});
