/**
 * 安全工具库
 * 提供 SSRF 防护、错误消息清理、代理超时等安全基础设施。
 */

/** 代理请求超时时间 (ms)：LLM 生成长结构化 JSON 需要较长时间 */
export const PROXY_TIMEOUT_MS = 120_000;

/** 响应体最大字节数 (50MB) */
export const MAX_RESPONSE_BYTES = 50 * 1024 * 1024;

/**
 * 校验目标 URL 是否安全（防 SSRF）。
 *
 * 本项目为自托管工具，用户会主动配置本地/局域网 API 端点，
 * 因此允许环回地址和私有网段，仅拦截云元数据端点和异常编码。
 */
export function isUrlSafe(urlString: string): { safe: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { safe: false, reason: "无效的 URL 格式" };
  }

  // 仅允许 HTTP/HTTPS
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { safe: false, reason: `不支持的协议: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 拒绝云元数据端点（防止容器/云环境中的 SSRF）
  const metadataPatterns = [
    /^169\.254\.169\.254$/,               // AWS/GCP/Azure metadata
    /^metadata\.google\.internal$/,       // GCP metadata
  ];

  // 拒绝数字编码的 IP（十六进制、八进制、十进制 — 常见 SSRF 绕过手段）
  const numericIpPattern = /^(0x[0-9a-f]+|[0-9]{8,})$/i;

  for (const pattern of metadataPatterns) {
    if (pattern.test(hostname)) {
      return { safe: false, reason: "目标地址不允许访问" };
    }
  }

  if (numericIpPattern.test(hostname)) {
    return { safe: false, reason: "目标地址不允许访问" };
  }

  return { safe: true };
}

/**
 * 清理错误信息，防止上游内部细节泄露给客户端。
 * 仅保留 HTTP 状态码，用通用文案替代原始错误。
 */
export function sanitizeProxyError(status: number): string {
  if (status === 401 || status === 403) return "认证失败，请检查 API Key 是否正确";
  if (status === 404) return "API 端点不存在，请检查 URL 是否正确";
  if (status === 429) return "请求过于频繁，请稍后重试";
  if (status >= 500) return "上游服务暂时不可用，请稍后重试";
  return `请求失败 (${status})，请检查配置`;
}

/**
 * 带超时 + 大小限制地读取响应文本。
 * 防止上游返回超大 body 导致 OOM。
 */
export async function safeReadText(
  response: Response,
  maxBytes: number = MAX_RESPONSE_BYTES,
): Promise<string> {
  // 优先检查 Content-Length
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > maxBytes) {
    throw new Error("响应体过大");
  }

  // 流式读取并限制总量
  const reader = response.body?.getReader();
  if (!reader) {
    return response.text();
  }

  const decoder = new TextDecoder();
  let result = "";
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      reader.cancel();
      throw new Error("响应体过大");
    }

    result += decoder.decode(value, { stream: true });
  }

  result += decoder.decode(); // flush
  return result;
}
