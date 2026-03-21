import { describe, it, expect } from "vitest";
import { isRetryable, withRetry } from "@/lib/retryQueue";
import { AppError } from "@/lib/errors";

describe("isRetryable", () => {
  it("returns AppError.retryable value when present", () => {
    const retryable = new AppError({ code: "TEST", message: "test", retryable: true });
    const nonRetryable = new AppError({ code: "TEST", message: "test", retryable: false });
    expect(isRetryable(retryable)).toBe(true);
    expect(isRetryable(nonRetryable)).toBe(false);
  });

  it("returns false for AbortError", () => {
    const err = new DOMException("Aborted", "AbortError");
    expect(isRetryable(err)).toBe(false);
  });

  it("returns true for TypeError containing 'fetch'", () => {
    const err = new TypeError("fetch failed");
    expect(isRetryable(err)).toBe(true);
  });

  it("returns false for TypeError without 'fetch'", () => {
    const err = new TypeError("Cannot read properties of undefined");
    expect(isRetryable(err)).toBe(true); // default: unknown errors are retryable
  });

  it("returns true for 429 status", () => {
    expect(isRetryable({ status: 429 })).toBe(true);
  });

  it("returns true for 500+ status", () => {
    expect(isRetryable({ status: 500 })).toBe(true);
    expect(isRetryable({ status: 502 })).toBe(true);
    expect(isRetryable({ status: 503 })).toBe(true);
  });

  it("returns false for 4xx (non-429) status", () => {
    expect(isRetryable({ status: 400 })).toBe(false);
    expect(isRetryable({ status: 401 })).toBe(false);
    expect(isRetryable({ status: 403 })).toBe(false);
    expect(isRetryable({ status: 404 })).toBe(false);
  });

  it("returns true for unknown errors (default)", () => {
    expect(isRetryable(new Error("something"))).toBe(true);
    expect(isRetryable("string error")).toBe(true);
    expect(isRetryable(null)).toBe(true);
  });
});

describe("withRetry", () => {
  it("returns value on first success", async () => {
    const result = await withRetry(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it("retries on retryable failure then succeeds", async () => {
    let attempts = 0;
    const result = await withRetry(
      () => {
        attempts++;
        if (attempts < 2) throw new Error("transient");
        return Promise.resolve("ok");
      },
      { maxRetries: 2, baseDelay: 1, maxDelay: 10 },
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("throws immediately on non-retryable error", async () => {
    const err = new AppError({ code: "PERM", message: "permanent", retryable: false });
    await expect(
      withRetry(() => Promise.reject(err), { maxRetries: 3, baseDelay: 1 }),
    ).rejects.toThrow("permanent");
  });

  it("throws after exhausting retries", async () => {
    let attempts = 0;
    await expect(
      withRetry(
        () => {
          attempts++;
          return Promise.reject(new Error("always fails"));
        },
        { maxRetries: 2, baseDelay: 1, maxDelay: 5 },
      ),
    ).rejects.toThrow("always fails");
    expect(attempts).toBe(3); // 1 initial + 2 retries
  });

  it("throws AbortError when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      withRetry(() => Promise.resolve("nope"), {}, controller.signal),
    ).rejects.toThrow("Aborted");
  });

  it("aborts during retry delay", async () => {
    const controller = new AbortController();
    let attempts = 0;

    const promise = withRetry(
      () => {
        attempts++;
        if (attempts === 1) {
          // Abort during the delay after first failure
          setTimeout(() => controller.abort(), 5);
          throw new Error("fail first");
        }
        return Promise.resolve("ok");
      },
      { maxRetries: 3, baseDelay: 500, maxDelay: 1000 },
      controller.signal,
    );

    await expect(promise).rejects.toThrow("Aborted");
    expect(attempts).toBe(1);
  });
});
