const ALLOWED_LANGS = new Set(["zh", "en", "ja", "ko", "fr", "de", "es", "ru", "pt", "it"]);
const MAX_EXTRACT_LENGTH = 10000;
const REQUEST_TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_SIZE = 200;

export interface WikipediaSearchResult {
  title: string;
  description?: string;
  thumbnail?: { source: string; width: number; height: number };
}

export interface WikipediaSummary {
  title: string;
  extract: string;
  hasLatex?: boolean;
  sections?: string[];
  thumbnail?: { source: string };
  lang: string;
  pageUrl: string;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const summaryCache = new Map<string, CacheEntry<WikipediaSummary>>();
const searchCache = new Map<string, CacheEntry<WikipediaSearchResult[]>>();

export function isWikipediaLanguageSupported(lang: string): boolean {
  return ALLOWED_LANGS.has(lang);
}

function getVariantParam(lang: string): string | null {
  return lang === "zh" ? "zh-cn" : null;
}

function addVariant(url: URL, lang: string): void {
  const variant = getVariantParam(lang);
  if (variant) url.searchParams.set("variant", variant);
}

function getRestHeaders(lang: string): Record<string, string> {
  const headers: Record<string, string> = { "Accept": "application/json" };
  if (lang === "zh") headers["Accept-Language"] = "zh-CN";
  return headers;
}

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
  if (cache.size >= CACHE_MAX_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function searchWikipedia(query: string, lang: string): Promise<WikipediaSearchResult[]> {
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
  const titles = searchResults.map((item: { title: string }) => item.title).join("|");
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

  return searchResults.map((item: { title: string; snippet: string }) => {
    const page = Object.values(pages).find(
      (candidate: unknown) => (candidate as { title: string }).title === item.title,
    ) as { thumbnail?: { source: string; width: number; height: number }; description?: string } | undefined;

    return {
      title: item.title,
      description: page?.description || stripHtml(item.snippet),
      thumbnail: page?.thumbnail,
    };
  });
}

export async function searchWikipediaCached(query: string, lang: string): Promise<{ results: WikipediaSearchResult[]; cached: boolean }> {
  const cacheKey = `search:${lang}:${query}`;
  const cached = getCached(searchCache, cacheKey);
  if (cached) {
    return { results: cached, cached: true };
  }

  const results = await searchWikipedia(query, lang);
  setCache(searchCache, cacheKey, results);
  return { results, cached: false };
}

export async function getWikipediaSummary(title: string, lang: string): Promise<WikipediaSummary | null> {
  const encodedTitle = encodeURIComponent(title.replace(/ /g, "_"));
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodedTitle}`;

  const res = await fetch(url, {
    headers: getRestHeaders(lang),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Wikipedia REST API error: ${res.status}`);

  const data = await res.json();

  const [fullExtract, sections] = await Promise.all([
    getDetailedExtract(title, lang, data.extract || ""),
    getSectionTitles(title, lang),
  ]);

  const { cleaned, hasLatex } = cleanMathFormulas(fullExtract);
  const extract = cleaned.length > MAX_EXTRACT_LENGTH
    ? `${cleaned.slice(0, MAX_EXTRACT_LENGTH)}...`
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

export async function getWikipediaSummaryCached(title: string, lang: string): Promise<{ summary: WikipediaSummary | null; cached: boolean }> {
  const cacheKey = `summary:${lang}:${title}`;
  const cached = getCached(summaryCache, cacheKey);
  if (cached) {
    return { summary: cached, cached: true };
  }

  const summary = await getWikipediaSummary(title, lang);
  if (summary) {
    setCache(summaryCache, cacheKey, summary);
  }
  return { summary, cached: false };
}

async function getDetailedExtract(title: string, lang: string, fallback: string): Promise<string> {
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  url.searchParams.set("action", "query");
  url.searchParams.set("titles", title);
  url.searchParams.set("prop", "extracts");
  url.searchParams.set("explaintext", "true");
  url.searchParams.set("exlimit", "1");
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
    return sections
      .filter((section: { toclevel: number }) => section.toclevel <= 2)
      .map((section: { line: string }) => stripHtml(section.line))
      .filter((section: string) => section.length > 0)
      .slice(0, 20);
  } catch {
    return [];
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

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

function cleanMathFormulas(text: string): { cleaned: string; hasLatex: boolean } {
  let hasLatex = false;

  text = text.replace(/(?:\n[ \t]*\S{0,2}[ \t]*){3,}(?=\s*\{\\displaystyle)/g, " ");

  let result = "";
  let index = 0;

  while (index < text.length) {
    const marker = "{\\displaystyle";
    const markerIndex = text.indexOf(marker, index);

    if (markerIndex === -1) {
      result += text.slice(index);
      break;
    }

    result += text.slice(index, markerIndex);

    const closeIndex = findMatchingBrace(text, markerIndex);
    if (closeIndex === -1) {
      result += text.slice(markerIndex, markerIndex + marker.length);
      index = markerIndex + marker.length;
      continue;
    }

    hasLatex = true;
    const inner = text.slice(markerIndex + marker.length, closeIndex).trim();
    const beforeChar = markerIndex > 0 ? text[markerIndex - 1] : "";
    const afterChar = closeIndex + 1 < text.length ? text[closeIndex + 1] : "";
    const isBlock = beforeChar === "\n" || afterChar === "\n";
    result += isBlock ? `$$${inner}$$` : `$${inner}$`;
    index = closeIndex + 1;
  }

  result = result.replace(/\\\(([^)]+)\\\)/g, (_, inner) => {
    hasLatex = true;
    return `$${inner.trim()}$`;
  });

  result = result.replace(/\n{3,}/g, "\n\n");
  result = result.replace(/\n[ \t]*\n[ \t]*(\$)/g, "\n$1");
  result = result.replace(/(\$\$?[^$]+?\$\$?)[ \t]*\n[ \t]*\n/g, "$1\n");

  return { cleaned: result, hasLatex };
}
