import { describe, it, expect } from "vitest";
import { isRetryable, withRetry } from "@/lib/retryQueue";
import { AppError } from "@/lib/errors";

describe("isRetryable", () => {
  it("returns true for AppError with retryable=true", () => {
    const err = new AppError({ code: "TEST", message: "test", retryable: true });
    expect(isRetryable(err)).toBe(true);
  });

  it("returns false for AppError with retryable=false", () => {
    const err = new AppError({ code: "TEST", message: "test", retryable: false });
    expect(isRetryable(err)).toBe(false);
  });

  it("returns false for AbortError", () => {
    const err = new DOMException("Aborted", "AbortError");
    expect(isRetryable(err)).toBe(false);
  });

  it("returns true for TypeError with fetch in message", () => {
    const err = new TypeError("fetch failed");
    expect(isRetryable(err)).toBe(true);
  });

  it("returns true for TypeError without fetch (falls to default)", () => {
    const err = new TypeError("cannot read property");
    // Non-fetch TypeError falls through to default: unknown errors are retryable
    expect(isRetryable(err)).toBe(true);
  });

  it("returns true for object with status 429", () => {
    expect(isRetryable({ status: 429 })).toBe(true);
  });

  it("returns true for object with status 500", () => {
    expect(isRetryable({ status: 500 })).toBe(true);
  });

  it("returns true for object with status 503", () => {
    expect(isRetryable({ status: 503 })).toBe(true);
  });

  it("returns false for object with status 400", () => {
    expect(isRetryable({ status: 400 })).toBe(false);
  });

  it("returns false for object with status 401", () => {
    expect(isRetryable({ status: 401 })).toBe(false);
  });

  it("returns false for object with status 404", () => {
    expect(isRetryable({ status: 404 })).toBe(false);
  });

  it("returns true for unknown errors", () => {
    expect(isRetryable(new Error("something"))).toBe(true);
    expect(isRetryable("string error")).toBe(true);
    expect(isRetryable(null)).toBe(true);
  });
});

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const result = await withRetry(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it("retries on retryable error and succeeds", async () => {
    let attempts = 0;
    const result = await withRetry(
      () => {
        attempts++;
        if (attempts < 3) throw new Error("transient");
        return Promise.resolve("ok");
      },
      { maxRetries: 3, baseDelay: 10, maxDelay: 50 },
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("throws immediately on non-retryable error", async () => {
    let attempts = 0;
    await expect(
      withRetry(
        () => {
          attempts++;
          throw Object.assign(new Error("forbidden"), { status: 403 });
        },
        { maxRetries: 3, baseDelay: 10 },
      ),
    ).rejects.toThrow("forbidden");
    expect(attempts).toBe(1);
  });

  it("throws after exhausting retries", async () => {
    let attempts = 0;
    await expect(
      withRetry(
        () => {
          attempts++;
          throw new Error("always fails");
        },
        { maxRetries: 2, baseDelay: 10, maxDelay: 20 },
      ),
    ).rejects.toThrow("always fails");
    expect(attempts).toBe(3); // 1 initial + 2 retries
  });

  it("throws AbortError when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      withRetry(() => Promise.resolve("ok"), {}, controller.signal),
    ).rejects.toThrow("Aborted");
  });
});
