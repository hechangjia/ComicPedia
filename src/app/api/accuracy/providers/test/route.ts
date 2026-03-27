import { NextRequest, NextResponse } from "next/server";
import { searchWithProvider, fetchWithProvider } from "@/lib/accuracy/providerClients";
import { getAssignedProvider, resolveAccuracyProviders } from "@/lib/accuracy/providerRegistry";
import { getConfig, saveConfig } from "@/lib/server/db";
import type { AccuracyProviderConfig, AccuracyProviderHealthStatus, UserAPIConfigV2 } from "@/lib/types";

function updateProviderHealth(
  config: UserAPIConfigV2,
  providerId: string,
  patch: { healthStatus: AccuracyProviderHealthStatus; lastCheckedAt: string; lastError?: string },
): UserAPIConfigV2 {
  return {
    ...config,
    accuracyConfig: {
      ...config.accuracyConfig,
      providers: config.accuracyConfig.providers.map((provider) =>
        provider.id === providerId
          ? {
              ...provider,
              healthStatus: patch.healthStatus,
              lastCheckedAt: patch.lastCheckedAt,
              lastError: patch.lastError,
            }
          : provider,
      ),
    },
    updatedAt: new Date().toISOString(),
  };
}

function findProvider(config: UserAPIConfigV2, providerId: string): AccuracyProviderConfig | null {
  const direct = config.accuracyConfig.providers.find((provider) => provider.id === providerId);
  if (!direct) return null;

  const slotMatch =
    getAssignedProvider(config.accuracyConfig, "primarySearch")?.id === providerId
    || getAssignedProvider(config.accuracyConfig, "fallbackSearch")?.id === providerId
    || getAssignedProvider(config.accuracyConfig, "primaryFetch")?.id === providerId
    || getAssignedProvider(config.accuracyConfig, "fallbackFetch")?.id === providerId;

  if (slotMatch) return direct;
  const resolved = resolveAccuracyProviders(config.accuracyConfig, direct.kind).find((provider) => provider.id === providerId);
  return resolved ?? direct;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const providerId = typeof body.providerId === "string" ? body.providerId : "";
    if (!providerId) {
      return NextResponse.json({ error: "缺少 providerId" }, { status: 400 });
    }

    const config = getConfig();
    if (!config) {
      return NextResponse.json({ error: "尚未保存配置" }, { status: 400 });
    }

    const provider = findProvider(config, providerId);
    if (!provider) {
      return NextResponse.json({ error: "未找到该 provider" }, { status: 404 });
    }

    const lastCheckedAt = new Date().toISOString();

    try {
      if (provider.kind === "search") {
        const results = await searchWithProvider(provider, "ComicPedia accuracy smoke test", {
          limit: 1,
          timeoutMs: 8000,
        });
        const nextConfig = updateProviderHealth(config, providerId, {
          healthStatus: "success",
          lastCheckedAt,
          lastError: undefined,
        });
        saveConfig(nextConfig);
        return NextResponse.json({
          status: "success",
          message: "连接成功",
          detail: results[0]?.title ? `首条结果：${results[0].title}` : "搜索接口可用",
          healthStatus: "success",
          lastCheckedAt,
        });
      }

      const result = await fetchWithProvider(provider, "https://example.com", {
        timeoutMs: 8000,
      });
      const nextConfig = updateProviderHealth(config, providerId, {
        healthStatus: "success",
        lastCheckedAt,
        lastError: undefined,
      });
      saveConfig(nextConfig);
      return NextResponse.json({
        status: "success",
        message: "连接成功",
        detail: result.title ? `抓取成功：${result.title}` : "抓取接口可用",
        healthStatus: "success",
        lastCheckedAt,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const nextConfig = updateProviderHealth(config, providerId, {
        healthStatus: "error",
        lastCheckedAt,
        lastError: detail,
      });
      saveConfig(nextConfig);
      return NextResponse.json({
        status: "error",
        message: "连接失败",
        detail,
        healthStatus: "error",
        lastCheckedAt,
        lastError: detail,
      }, { status: 502 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "测试 provider 失败" },
      { status: 500 },
    );
  }
}
