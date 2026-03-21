// ============================================================
// 统一错误体系
// 所有业务错误继承 AppError，携带结构化信息供 UI 和重试逻辑使用。
// ============================================================

export type ErrorSeverity = "error" | "warning" | "info";

export interface AppErrorOptions {
  /** 机器可读错误码 */
  code: string;
  /** 用户可读消息（中文） */
  message: string;
  /** 严重级别，默认 error */
  severity?: ErrorSeverity;
  /** 是否可通过重试解决 */
  retryable?: boolean;
  /** 原始错误 */
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: string;
  readonly severity: ErrorSeverity;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(opts: AppErrorOptions) {
    super(opts.message);
    this.name = "AppError";
    this.code = opts.code;
    this.severity = opts.severity ?? "error";
    this.retryable = opts.retryable ?? false;
    this.cause = opts.cause;
  }
}

// ============================================================
// 工具函数
// ============================================================

/** 将任意 caught 值转为用户可读消息 */
export function toUserMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "未知错误，请重试";
}

/** 判断错误是否可重试 */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof AppError) return err.retryable;
  // 网络错误
  if (err instanceof TypeError && err.message.includes("fetch")) return true;
  // AbortError 不可重试
  if (err instanceof DOMException && err.name === "AbortError") return false;
  return false;
}

/**
 * 基于 HTTP 状态码和错误消息判断是否可重试。
 * 合并了原 imageGen 的 classifyError 和 retryQueue 的 isRetryable 逻辑。
 */
export function isRetryableHTTP(status: number, message: string = ""): boolean {
  // 5xx 服务端错误
  if (status >= 500) return true;
  // 429 限流
  if (status === 429) return true;
  // 408 超时
  if (status === 408) return true;
  // 网络关键字
  const keywords = ["timeout", "etimedout", "econnreset", "econnrefused", "enotfound", "socket hang up"];
  if (keywords.some((k) => message.toLowerCase().includes(k))) return true;
  // 4xx（非 429/408）不可重试
  if (status >= 400 && status < 500) return false;
  return false;
}
