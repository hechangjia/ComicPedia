import type { AccuracyProviderConfig } from "@/lib/types";

export interface ProviderSearchResult {
  url: string;
  title: string;
  domain: string;
  excerpt: string;
}

export interface ProviderSearchOptions {
  limit?: number;
  timeoutMs?: number;
}

export interface ProviderFetchOptions {
  timeoutMs?: number;
}

function buildHeaders(provider: AccuracyProviderConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (provider.vendor === "firecrawl" && provider.apiKey) {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }

  return headers;
}

function trimExcerpt(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 800) : "";
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function parseJson(response: Response): Promise<unknown> {
  return response.json().catch(() => ({}));
}

function normalizeSearchResult(raw: Record<string, unknown>): ProviderSearchResult | null {
  const url = typeof raw.url === "string"
    ? raw.url
    : typeof raw.href === "string"
      ? raw.href
      : typeof raw.link === "string"
        ? raw.link
        : "";

  if (!url) return null;

  const title = typeof raw.title === "string"
    ? raw.title
    : typeof raw.name === "string"
      ? raw.name
      : getDomain(url);

  const excerptSource = raw.excerpt ?? raw.description ?? raw.content ?? raw.raw_content ?? raw.markdown ?? "";

  return {
    url,
    title,
    domain: getDomain(url),
    excerpt: trimExcerpt(excerptSource),
  };
}

function normalizeFetchResult(url: string, payload: Record<string, unknown>): ProviderSearchResult {
  const title = typeof payload.title === "string" && payload.title.trim().length > 0
    ? payload.title.trim()
    : getDomain(url);
  const excerpt = trimExcerpt(payload.markdown ?? payload.content ?? payload.raw_content ?? payload.text ?? payload.excerpt ?? "");

  return {
    url,
    title,
    domain: getDomain(url),
    excerpt,
  };
}

export async function searchWithProvider(
  provider: AccuracyProviderConfig,
  query: string,
  options: ProviderSearchOptions = {},
): Promise<ProviderSearchResult[]> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const limit = options.limit ?? 3;
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");

  if (provider.vendor === "firecrawl") {
    const response = await fetch(`${baseUrl}/v2/search`, {
      method: "POST",
      headers: buildHeaders(provider),
      body: JSON.stringify({
        query,
        limit,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) throw new Error(`Firecrawl search failed: ${response.status}`);
    const data = await parseJson(response) as { data?: Array<Record<string, unknown>> };
    return (data.data || [])
      .map(normalizeSearchResult)
      .filter((result): result is ProviderSearchResult => result !== null);
  }

  if (provider.vendor === "tavily") {
    const response = await fetch(`${baseUrl}/search`, {
      method: "POST",
      headers: buildHeaders(provider),
      body: JSON.stringify({
        api_key: provider.apiKey,
        query,
        max_results: limit,
        search_depth: "basic",
        include_raw_content: true,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) throw new Error(`Tavily search failed: ${response.status}`);
    const data = await parseJson(response) as { results?: Array<Record<string, unknown>> };
    return (data.results || [])
      .map(normalizeSearchResult)
      .filter((result): result is ProviderSearchResult => result !== null);
  }

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      ...buildHeaders(provider),
      ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
    },
    body: JSON.stringify({ query, limit }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) throw new Error(`Custom search failed: ${response.status}`);
  const data = await parseJson(response) as { data?: Array<Record<string, unknown>>; results?: Array<Record<string, unknown>> };
  const results = data.results || data.data || [];
  return results
    .map(normalizeSearchResult)
    .filter((result): result is ProviderSearchResult => result !== null);
}

export async function fetchWithProvider(
  provider: AccuracyProviderConfig,
  url: string,
  options: ProviderFetchOptions = {},
): Promise<ProviderSearchResult> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");

  if (provider.vendor === "firecrawl") {
    const response = await fetch(`${baseUrl}/v2/scrape`, {
      method: "POST",
      headers: buildHeaders(provider),
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) throw new Error(`Firecrawl fetch failed: ${response.status}`);
    const data = await parseJson(response) as { data?: Record<string, unknown> };
    return normalizeFetchResult(url, data.data || {});
  }

  if (provider.vendor === "tavily") {
    const response = await fetch(`${baseUrl}/extract`, {
      method: "POST",
      headers: buildHeaders(provider),
      body: JSON.stringify({
        api_key: provider.apiKey,
        urls: [url],
        include_raw_content: true,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) throw new Error(`Tavily fetch failed: ${response.status}`);
    const data = await parseJson(response) as { results?: Array<Record<string, unknown>> };
    return normalizeFetchResult(url, data.results?.[0] || {});
  }

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      ...buildHeaders(provider),
      ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
    },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) throw new Error(`Custom fetch failed: ${response.status}`);
  const data = await parseJson(response) as Record<string, unknown>;
  return normalizeFetchResult(url, data);
}
