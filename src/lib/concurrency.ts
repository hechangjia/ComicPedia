// ============================================================
// 并发控制器
// 类似 p-limit，限制最大并发数，支持 AbortSignal 取消。
// 支持 429 自适应降级：检测到 Rate Limit 时自动减少并发数。
// ============================================================

export interface ConcurrencyConfig {
  /** 最大并发数 */
  limit: number;
  /** 可选的 AbortSignal，取消时所有排队任务立即 reject */
  signal?: AbortSignal;
  /** 遇到 429 时降至的并发数，默认 Math.ceil(limit/2) */
  throttledLimit?: number;
  /** 降级持续时间(ms)，默认 30000 */
  throttleDuration?: number;
}

/** 检测错误是否为 429 Rate Limit */
function isRateLimitError(err: unknown): boolean {
  if (err && typeof err === "object" && "status" in err) {
    return (err as { status: number }).status === 429;
  }
  if (err instanceof Error && err.message.includes("429")) return true;
  return false;
}

/**
 * 限制并发执行异步任务。
 *
 * @param tasks  返回 Promise 的工厂函数数组
 * @param config 并发配置
 * @returns 按输入顺序的结果数组 (settled)
 *
 * 与 Promise.allSettled 不同，此函数在全部任务完成后才返回，
 * 但同一时刻最多只有 config.limit 个任务在执行。
 *
 * 自适应降级：当某个任务返回 429 时，暂停新任务启动 throttleDuration ms，
 * 期间已运行的 worker 继续执行但不会获取新任务。
 */
export async function withConcurrency<T>(
  tasks: (() => Promise<T>)[],
  config: ConcurrencyConfig,
): Promise<PromiseSettledResult<T>[]> {
  const { limit, signal } = config;
  const throttledLimit = config.throttledLimit ?? Math.ceil(limit / 2);
  const throttleDuration = config.throttleDuration ?? 30000;

  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let nextIndex = 0;
  let activeWorkers = 0;
  let throttledUntil = 0;

  async function runNext(): Promise<void> {
    while (nextIndex < tasks.length) {
      if (signal?.aborted) {
        while (nextIndex < tasks.length) {
          const idx = nextIndex++;
          results[idx] = {
            status: "rejected",
            reason: new DOMException("Aborted", "AbortError"),
          };
        }
        return;
      }

      // 自适应降级：如果处于限流状态且活跃 worker 超过阈值，此 worker 退出
      const now = Date.now();
      if (now < throttledUntil && activeWorkers > throttledLimit) {
        return;
      }

      // 如果处于限流状态，等待剩余时间
      if (now < throttledUntil) {
        await new Promise<void>((resolve) => {
          const wait = throttledUntil - Date.now();
          if (wait > 0) {
            setTimeout(resolve, wait);
          } else {
            resolve();
          }
        });
      }

      const currentIndex = nextIndex++;
      activeWorkers++;
      try {
        const value = await tasks[currentIndex]();
        results[currentIndex] = { status: "fulfilled", value };
      } catch (reason) {
        results[currentIndex] = { status: "rejected", reason };

        // 检测 429：触发降级
        if (isRateLimitError(reason)) {
          throttledUntil = Date.now() + throttleDuration;
          console.warn(
            `[Concurrency] 429 detected, throttling to ${throttledLimit} workers for ${throttleDuration}ms`,
          );
        }
      } finally {
        activeWorkers--;
      }
    }
  }

  // 启动 limit 个 worker
  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    () => runNext(),
  );

  await Promise.all(workers);
  return results;
}
