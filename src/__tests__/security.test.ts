import { describe, it, expect } from "vitest";
import { isUrlSafe, sanitizeProxyError } from "@/lib/security";

describe("isUrlSafe", () => {
  it("allows standard HTTP URLs", () => {
    expect(isUrlSafe("http://localhost:8080/api")).toEqual({ safe: true });
    expect(isUrlSafe("https://api.openai.com/v1/chat")).toEqual({ safe: true });
  });

  it("allows private/local network URLs (self-hosted tool)", () => {
    expect(isUrlSafe("http://192.168.1.100:11434/api")).toEqual({ safe: true });
    expect(isUrlSafe("http://127.0.0.1:3000")).toEqual({ safe: true });
    expect(isUrlSafe("http://10.0.0.1/api")).toEqual({ safe: true });
  });

  it("rejects invalid URLs", () => {
    const result = isUrlSafe("not-a-url");
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("无效");
  });

  it("rejects non-HTTP protocols", () => {
    expect(isUrlSafe("ftp://example.com/file").safe).toBe(false);
    expect(isUrlSafe("file:///etc/passwd").safe).toBe(false);
    expect(isUrlSafe("javascript:alert(1)").safe).toBe(false);
  });

  it("blocks AWS metadata endpoint", () => {
    const result = isUrlSafe("http://169.254.169.254/latest/meta-data");
    expect(result.safe).toBe(false);
  });

  it("blocks GCP metadata endpoint", () => {
    const result = isUrlSafe("http://metadata.google.internal/computeMetadata/v1");
    expect(result.safe).toBe(false);
  });

  it("allows numeric IP addresses (self-hosted tool permits local access)", () => {
    // Node URL parser resolves numeric IPs to dotted notation before hostname check
    // 0x7f000001 -> 127.0.0.1, 2130706433 -> 127.0.0.1
    // Self-hosted tool intentionally allows local/private IPs
    expect(isUrlSafe("http://0x7f000001/api").safe).toBe(true);
    expect(isUrlSafe("http://2130706433/api").safe).toBe(true);
  });

  it("allows normal hostnames with numbers", () => {
    expect(isUrlSafe("https://api2.example.com").safe).toBe(true);
    expect(isUrlSafe("http://host123.local:8080").safe).toBe(true);
  });
});

describe("sanitizeProxyError", () => {
  it("returns auth message for 401/403", () => {
    expect(sanitizeProxyError(401)).toContain("API Key");
    expect(sanitizeProxyError(403)).toContain("API Key");
  });

  it("returns not-found message for 404", () => {
    expect(sanitizeProxyError(404)).toContain("端点不存在");
  });

  it("returns rate-limit message for 429", () => {
    expect(sanitizeProxyError(429)).toContain("频繁");
  });

  it("returns server error message for 5xx", () => {
    expect(sanitizeProxyError(500)).toContain("不可用");
    expect(sanitizeProxyError(502)).toContain("不可用");
    expect(sanitizeProxyError(503)).toContain("不可用");
  });

  it("returns generic message for other codes", () => {
    const msg = sanitizeProxyError(418);
    expect(msg).toContain("418");
  });
});
