// ============================================================
// 指数退避重试工具
// 统一的重试逻辑，供 LLM、图片生成等 API 调用使用。
// ============================================================

import { AppError } from "./errors";

export interface RetryConfig {
  /** 最大重试次数（不含首次尝试） */
  maxRetries: number;
  /** 首次重试延迟（ms） */
  baseDelay: number;
  /** 最大延迟上限（ms） */
  maxDelay: number;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 2,
  baseDelay: 1000,
  maxDelay: 15000,
};

/**
 * 判断错误是否可重试：
 * 1. AppError.retryable 属性（最高优先级）
 * 2. AbortError → 不可重试
 * 3. TypeError (fetch 失败) → 可重试
 * 4. 带 status 属性：429/5xx 可重试，其他 4xx 不可重试
 * 5. 默认：未知错误视为可重试
 */
export function isRetryable(err: unknown): boolean {
  // AppError 自带 retryable 标记
  if (err instanceof AppError) return err.retryable;

  if (err instanceof DOMException && err.name === "AbortError") return false;

  if (err instanceof TypeError && err.message.includes("fetch")) return true;

  if (err instanceof Response) {
    return err.status === 429 || err.status >= 500;
  }

  // 检查嵌套的 status 属性（fetch 包装的错误）
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status: number }).status;
    if (status >= 400 && status < 500 && status !== 429) return false;
    return true;
  }

  // 默认：网络或未知错误视为可重试
  return true;
}

/**
 * 指数退避重试包裹器。
 *
 * @param fn 要执行的异步操作
 * @param config 重试配置
 * @param signal 可选的 AbortSignal，取消时立即抛出
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  signal?: AbortSignal,
): Promise<T> {
  const { maxRetries, baseDelay, maxDelay } = { ...DEFAULT_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // 检查取消
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // 不可重试错误或已用完重试次数
      if (!isRetryable(err) || attempt >= maxRetries) {
        throw err;
      }

      // 指数退避 + 随机抖动
      const jitter = Math.random() * 0.3 + 0.85; // 0.85 ~ 1.15
      const delay = Math.min(baseDelay * 2 ** attempt * jitter, maxDelay);

      console.warn(
        `[Retry] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${Math.round(delay)}ms...`,
        err instanceof Error ? err.message : err,
      );

      // 带取消的延迟（确保 abort listener 清理，防泄漏）
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          settled = true;
          if (signal) signal.removeEventListener("abort", onAbort);
          resolve();
        }, delay);
        const onAbort = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        };
        if (signal) {
          if (signal.aborted) {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          signal.addEventListener("abort", onAbort, { once: true });
        }
      });
    }
  }

  throw lastError;
}
