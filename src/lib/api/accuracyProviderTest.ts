import type { AccuracyProviderHealthStatus } from "@/lib/types";
import type { TestResult } from "@/lib/api/connectionTest";

export interface AccuracyProviderTestResult extends TestResult {
  healthStatus?: AccuracyProviderHealthStatus;
  lastCheckedAt?: string;
  lastError?: string;
}

export async function testAccuracyProvider(providerId: string): Promise<AccuracyProviderTestResult> {
  try {
    const response = await fetch("/api/accuracy/providers/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        status: "error",
        message: body.error || `API 错误 (${response.status})`,
        detail: body.detail,
        healthStatus: "error",
        lastCheckedAt: body.lastCheckedAt,
        lastError: body.detail || body.error,
      };
    }

    return {
      status: body.status || "success",
      message: body.message || "连接成功",
      detail: body.detail,
      healthStatus: body.healthStatus,
      lastCheckedAt: body.lastCheckedAt,
      lastError: body.lastError,
    };
  } catch (error) {
    return {
      status: "error",
      message: "网络错误",
      detail: error instanceof Error ? error.message : String(error),
      healthStatus: "error",
      lastError: error instanceof Error ? error.message : String(error),
    };
  }
}
