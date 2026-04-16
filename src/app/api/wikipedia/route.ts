import { NextRequest, NextResponse } from "next/server";
import {
  getWikipediaSummaryCached,
  isWikipediaLanguageSupported,
  searchWikipediaCached,
} from "@/lib/server/wikipedia";

/**
 * Wikipedia API 代理路由
 * 搜索和获取 Wikipedia 文章内容，用于百科漫画生成。
 *
 * GET /api/wikipedia?q=关键词&lang=zh — 搜索文章
 * GET /api/wikipedia?title=文章标题&lang=en — 获取文章摘要+章节
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q");
    const title = searchParams.get("title");
    const lang = searchParams.get("lang") || "zh";

    if (!isWikipediaLanguageSupported(lang)) {
      return NextResponse.json(
        { error: `不支持的语言: ${lang}` },
        { status: 400 },
      );
    }

    if (!query && !title) {
      return NextResponse.json(
        { error: "请提供 q (搜索关键词) 或 title (文章标题) 参数" },
        { status: 400 },
      );
    }

    // 搜索模式
    if (query && !title) {
      const { results, cached } = await searchWikipediaCached(query, lang);
      return NextResponse.json({ results, lang, ...(cached ? { cached: true } : {}) });
    }

    // 获取文章摘要
    const articleTitle = title || query!;
    const { summary, cached } = await getWikipediaSummaryCached(articleTitle, lang);
    if (!summary) {
      return NextResponse.json(
        { error: "未找到该文章" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ...summary, ...(cached ? { cached: true } : {}) });
  } catch (error) {
    console.error("[API /wikipedia GET]", error);

    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json(
        { error: "Wikipedia 请求超时，请稍后重试" },
        { status: 504 },
      );
    }

    return NextResponse.json(
      { error: "获取 Wikipedia 内容失败" },
      { status: 500 },
    );
  }
}
