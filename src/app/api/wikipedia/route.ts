import { NextRequest, NextResponse } from "next/server";

/**
 * Wikipedia API 代理路由
 * 搜索和获取 Wikipedia 文章内容，用于百科漫画生成。
 *
 * GET /api/wikipedia?q=关键词&lang=zh — 搜索文章
 * GET /api/wikipedia?title=文章标题&lang=en — 获取文章摘要+章节
 */

const ALLOWED_LANGS = new Set(["zh", "en", "ja", "ko", "fr", "de", "es", "ru", "pt", "it"]);
const MAX_EXTRACT_LENGTH = 10000;
const REQUEST_TIMEOUT_MS = 15000;

/** 中文 Wikipedia 使用简体中文变体 */
function getVariantParam(lang: string): string | null {
  return lang === "zh" ? "zh-cn" : null;
}

/** 为 Action API URL 添加 variant 参数（简繁转换） */
function addVariant(url: URL, lang: string): void {
  const variant = getVariantParam(lang);
  if (variant) url.searchParams.set("variant", variant);
}

/** 为 REST API 请求添加简体中文 Accept-Language header */
function getRestHeaders(lang: string): Record<string, string> {
  const headers: Record<string, string> = { "Accept": "application/json" };
  if (lang === "zh") headers["Accept-Language"] = "zh-CN";
  return headers;
}

// ============================================================
// 内存缓存：避免重复请求 Wikipedia（TTL 10 分钟）
// ============================================================

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_SIZE = 200;
const summaryCache = new Map<string, CacheEntry<WikiSummary>>();
const searchCache = new Map<string, CacheEntry<WikiSearchResult[]>>();

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
  // LRU 简易淘汰
  if (cache.size >= CACHE_MAX_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ============================================================
// 类型定义
// ============================================================

interface WikiSearchResult {
  title: string;
  description?: string;
  thumbnail?: { source: string; width: number; height: number };
}

interface WikiSummary {
  title: string;
  extract: string;
  hasLatex?: boolean;
  sections?: string[];
  thumbnail?: { source: string };
  lang: string;
  pageUrl: string;
}

// ============================================================
// 路由处理
// ============================================================

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q");
    const title = searchParams.get("title");
    const lang = searchParams.get("lang") || "zh";

    if (!ALLOWED_LANGS.has(lang)) {
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
      const cacheKey = `search:${lang}:${query}`;
      const cached = getCached(searchCache, cacheKey);
      if (cached) {
        return NextResponse.json({ results: cached, lang, cached: true });
      }

      const results = await searchWikipedia(query, lang);
      setCache(searchCache, cacheKey, results);
      return NextResponse.json({ results, lang });
    }

    // 获取文章摘要
    const articleTitle = title || query!;
    const cacheKey = `summary:${lang}:${articleTitle}`;
    const cached = getCached(summaryCache, cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }

    const summary = await getArticleSummary(articleTitle, lang);
    if (!summary) {
      return NextResponse.json(
        { error: "未找到该文章" },
        { status: 404 },
      );
    }

    setCache(summaryCache, cacheKey, summary);
    return NextResponse.json(summary);
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

// ============================================================
// Wikipedia API 调用
// ============================================================

async function searchWikipedia(query: string, lang: string): Promise<WikiSearchResult[]> {
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", query);
  url.searchParams.set("srlimit", "8");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  addVariant(url, lang);

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`Wikipedia API error: ${res.status}`);

  const data = await res.json();
  const searchResults = data.query?.search || [];

  // 获取缩略图信息
  const titles = searchResults.map((r: { title: string }) => r.title).join("|");
  if (!titles) return [];

  const thumbUrl = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  thumbUrl.searchParams.set("action", "query");
  thumbUrl.searchParams.set("titles", titles);
  thumbUrl.searchParams.set("prop", "pageimages|description");
  thumbUrl.searchParams.set("pithumbsize", "200");
  thumbUrl.searchParams.set("format", "json");
  thumbUrl.searchParams.set("origin", "*");
  addVariant(thumbUrl, lang);

  const thumbRes = await fetch(thumbUrl.toString(), {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const thumbData = thumbRes.ok ? await thumbRes.json() : null;
  const pages = thumbData?.query?.pages || {};

  return searchResults.map((r: { title: string; snippet: string }) => {
    const page = Object.values(pages).find(
      (p: unknown) => (p as { title: string }).title === r.title,
    ) as { thumbnail?: { source: string; width: number; height: number }; description?: string } | undefined;

    return {
      title: r.title,
      description: page?.description || stripHtml(r.snippet),
      thumbnail: page?.thumbnail,
    };
  });
}

async function getArticleSummary(title: string, lang: string): Promise<WikiSummary | null> {
  const encodedTitle = encodeURIComponent(title.replace(/ /g, "_"));
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodedTitle}`;

  const res = await fetch(url, {
    headers: getRestHeaders(lang),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Wikipedia REST API error: ${res.status}`);

  const data = await res.json();

  // 并行获取详细内容和章节标题
  const [fullExtract, sections] = await Promise.all([
    getDetailedExtract(title, lang, data.extract || ""),
    getSectionTitles(title, lang),
  ]);

  // 先清洗 MathML 残留和 LaTeX 标记，再截断
  // （先截断可能切在 MathML 文本树中间，导致残留无法匹配清除）
  const { cleaned, hasLatex } = cleanMathFormulas(fullExtract);
  let extract = cleaned.length > MAX_EXTRACT_LENGTH
    ? cleaned.slice(0, MAX_EXTRACT_LENGTH) + "..."
    : cleaned;

  return {
    title: data.title || title,
    extract,
    hasLatex,
    sections: sections.length > 0 ? sections : undefined,
    thumbnail: data.thumbnail ? { source: data.thumbnail.source } : undefined,
    lang,
    pageUrl: data.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodedTitle}`,
  };
}

async function getDetailedExtract(title: string, lang: string, fallback: string): Promise<string> {
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  url.searchParams.set("action", "query");
  url.searchParams.set("titles", title);
  url.searchParams.set("prop", "extracts");
  url.searchParams.set("explaintext", "true");
  url.searchParams.set("exlimit", "1");
  // 不设 exchars: Wikipedia 对含 <math> 的文章的 exchars 计数有 bug，
  // 会在数学公式处过早截断（如「量子力学」50000 exchars 只返回 1223 字符）。
  // 不限制则可获取完整文本（~1 秒响应），由 MAX_EXTRACT_LENGTH 在服务端截断。
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  addVariant(url, lang);

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return fallback;

    const data = await res.json();
    const pages = data.query?.pages || {};
    const page = Object.values(pages)[0] as { extract?: string } | undefined;
    const detail = page?.extract || "";
    return detail.length > fallback.length ? detail : fallback;
  } catch {
    return fallback;
  }
}

async function getSectionTitles(title: string, lang: string): Promise<string[]> {
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  url.searchParams.set("action", "parse");
  url.searchParams.set("page", title);
  url.searchParams.set("prop", "sections");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  addVariant(url, lang);

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return [];

    const data = await res.json();
    const sections = data.parse?.sections || [];
    // 只取一级和二级标题
    return sections
      .filter((s: { toclevel: number }) => s.toclevel <= 2)
      .map((s: { line: string }) => stripHtml(s.line))
      .filter((s: string) => s.length > 0)
      .slice(0, 20);
  } catch {
    return [];
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

// ============================================================
// LaTeX / 数学公式清洗
// Wikipedia explaintext 模式会残留 {\displaystyle ...} 标记
// 以及 MathML 文本节点（缩进的单字符树）
// ============================================================

/**
 * 找到从 startIndex 开始的 `{...}` 平衡闭合位置。
 * 支持任意层级嵌套花括号。返回闭合 `}` 的索引，找不到返回 -1。
 */
function findMatchingBrace(text: string, startIndex: number): number {
  if (text[startIndex] !== "{") return -1;
  let depth = 0;
  for (let i = startIndex; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * 清洗 Wikipedia 纯文本中的 LaTeX 残留。
 *
 * Wikipedia explaintext 模式会把 <math> 标签序列化为：
 *   1. MathML 文本节点（缩进的单字符树，如 "  \n    E\n      n\n"）
 *   2. {\displaystyle ...} 注解文本
 *
 * 本函数：
 *   - 移除 MathML 文本节点残留
 *   - 将 {\displaystyle ...} 转为 $...$ 标准 KaTeX 分隔符
 */
function cleanMathFormulas(text: string): { cleaned: string; hasLatex: boolean } {
  let hasLatex = false;

  // Phase 1: 移除 {\displaystyle 之前的 MathML 文本节点残留。
  // MathML 文本节点表现为连续多行，每行仅有空白和 ≤2 个非空白字符。
  text = text.replace(/(?:\n[ \t]*\S{0,2}[ \t]*){3,}(?=\s*\{\\displaystyle)/g, " ");

  // Phase 2: 将 {\displaystyle ...} 转为 $...$
  let result = "";
  let i = 0;

  while (i < text.length) {
    const marker = "{\\displaystyle";
    const idx = text.indexOf(marker, i);

    if (idx === -1) {
      result += text.slice(i);
      break;
    }

    result += text.slice(i, idx);

    const closeIdx = findMatchingBrace(text, idx);
    if (closeIdx === -1) {
      result += text.slice(idx, idx + marker.length);
      i = idx + marker.length;
      continue;
    }

    hasLatex = true;
    const inner = text.slice(idx + marker.length, closeIdx).trim();
    // 行内公式用 $...$，独占行用 $$...$$
    const beforeChar = idx > 0 ? text[idx - 1] : "";
    const afterChar = closeIdx + 1 < text.length ? text[closeIdx + 1] : "";
    const isBlock = beforeChar === "\n" || afterChar === "\n";
    if (isBlock) {
      result += `$$${inner}$$`;
    } else {
      result += `$${inner}$`;
    }
    i = closeIdx + 1;
  }

  // Phase 3: 清理独立 \( ... \) 包裹的行内公式 → $...$
  result = result.replace(/\\\(([^)]+)\\\)/g, (_, inner) => {
    hasLatex = true;
    return `$${inner.trim()}$`;
  });

  // Phase 4: 清理 MathML 移除后的空白残留
  // 合并 3+ 空行为 2 行
  result = result.replace(/\n{3,}/g, "\n\n");
  // 合并公式前后的空白行（空行 = 仅含空格/tab 的行）
  result = result.replace(/\n[ \t]*\n[ \t]*(\$)/g, "\n$1");
  result = result.replace(/(\$\$?[^$]+?\$\$?)[ \t]*\n[ \t]*\n/g, "$1\n");

  return { cleaned: result, hasLatex };
}
