import { describe, it, expect } from "vitest";
import { AppError, toUserMessage, isRetryableError, isRetryableHTTP } from "@/lib/errors";

describe("AppError", () => {
  it("creates with required fields", () => {
    const err = new AppError({ code: "TEST_ERR", message: "something broke" });
    expect(err.code).toBe("TEST_ERR");
    expect(err.message).toBe("something broke");
    expect(err.severity).toBe("error");
    expect(err.retryable).toBe(false);
    expect(err.name).toBe("AppError");
    expect(err instanceof Error).toBe(true);
  });

  it("creates with optional fields", () => {
    const cause = new Error("root cause");
    const err = new AppError({
      code: "RETRY",
      message: "transient",
      severity: "warning",
      retryable: true,
      cause,
    });
    expect(err.severity).toBe("warning");
    expect(err.retryable).toBe(true);
    expect(err.cause).toBe(cause);
  });
});

describe("toUserMessage", () => {
  it("extracts message from AppError", () => {
    expect(toUserMessage(new AppError({ code: "X", message: "custom msg" }))).toBe("custom msg");
  });

  it("extracts message from standard Error", () => {
    expect(toUserMessage(new Error("std error"))).toBe("std error");
  });

  it("returns string directly", () => {
    expect(toUserMessage("plain string")).toBe("plain string");
  });

  it("returns fallback for unknown types", () => {
    expect(toUserMessage(42)).toContain("未知");
    expect(toUserMessage(null)).toContain("未知");
  });
});

describe("isRetryableError", () => {
  it("uses AppError.retryable flag", () => {
    expect(isRetryableError(new AppError({ code: "X", message: "x", retryable: true }))).toBe(true);
    expect(isRetryableError(new AppError({ code: "X", message: "x", retryable: false }))).toBe(false);
  });

  it("returns true for fetch TypeError", () => {
    expect(isRetryableError(new TypeError("fetch failed"))).toBe(true);
  });

  it("returns false for AbortError", () => {
    expect(isRetryableError(new DOMException("abort", "AbortError"))).toBe(false);
  });

  it("returns false for generic errors", () => {
    expect(isRetryableError(new Error("whatever"))).toBe(false);
  });
});

describe("isRetryableHTTP", () => {
  it("returns true for 5xx", () => {
    expect(isRetryableHTTP(500)).toBe(true);
    expect(isRetryableHTTP(502)).toBe(true);
    expect(isRetryableHTTP(503)).toBe(true);
  });

  it("returns true for 429", () => {
    expect(isRetryableHTTP(429)).toBe(true);
  });

  it("returns true for 408 timeout", () => {
    expect(isRetryableHTTP(408)).toBe(true);
  });

  it("returns false for 4xx (non-429/408)", () => {
    expect(isRetryableHTTP(400)).toBe(false);
    expect(isRetryableHTTP(401)).toBe(false);
    expect(isRetryableHTTP(403)).toBe(false);
    expect(isRetryableHTTP(404)).toBe(false);
  });

  it("returns true for network error messages", () => {
    expect(isRetryableHTTP(0, "ETIMEDOUT")).toBe(true);
    expect(isRetryableHTTP(0, "ECONNRESET")).toBe(true);
    expect(isRetryableHTTP(0, "socket hang up")).toBe(true);
  });

  it("returns false for 200 without error keywords", () => {
    expect(isRetryableHTTP(200)).toBe(false);
  });
});
