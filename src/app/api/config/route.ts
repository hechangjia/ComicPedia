import { NextRequest, NextResponse } from "next/server";
import { getConfig, saveConfig } from "@/lib/server/db";
import type { UserAPIConfigV2 } from "@/lib/types";
import {
  createEmptyAccuracyConfig,
  mergeAccuracyProviderSecrets,
  normalizeAccuracyConfig,
  sanitizeAccuracyConfigForClient,
} from "@/lib/accuracy/providerConfig";

function createDefaultConfig(): UserAPIConfigV2 {
  return {
    version: 2,
    llmConfigs: [],
    imageConfigs: [],
    vlmConfigs: [],
    accuracyConfig: createEmptyAccuracyConfig(),
    activeLLMId: null,
    activeImageId: null,
    activeVLMId: null,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeUserConfig(config?: UserAPIConfigV2 | null): UserAPIConfigV2 {
  const base = createDefaultConfig();
  if (!config) return base;

  return {
    version: 2,
    llmConfigs: config.llmConfigs || [],
    imageConfigs: config.imageConfigs || [],
    vlmConfigs: config.vlmConfigs || [],
    accuracyConfig: normalizeAccuracyConfig(config.accuracyConfig),
    activeLLMId: config.activeLLMId ?? null,
    activeImageId: config.activeImageId ?? null,
    activeVLMId: config.activeVLMId ?? null,
    updatedAt: config.updatedAt || base.updatedAt,
  };
}

/** GET /api/config — 获取 API 配置 */
export async function GET() {
  try {
    const config = normalizeUserConfig(getConfig());
    return NextResponse.json({
      ...config,
      accuracyConfig: sanitizeAccuracyConfigForClient(config.accuracyConfig),
    });
  } catch (error) {
    console.error("[API /config GET]", error);
    return NextResponse.json(
      { error: "获取配置失败" },
      { status: 500 },
    );
  }
}

/** PUT /api/config — 保存 API 配置 */
export async function PUT(request: NextRequest) {
  try {
    const config = normalizeUserConfig((await request.json()) as UserAPIConfigV2);

    if (config.version !== 2) {
      return NextResponse.json(
        { error: "仅支持 v2 配置格式" },
        { status: 400 },
      );
    }

    const existing = normalizeUserConfig(getConfig());
    const merged: UserAPIConfigV2 = {
      ...config,
      accuracyConfig: mergeAccuracyProviderSecrets(existing.accuracyConfig, config.accuracyConfig),
      updatedAt: new Date().toISOString(),
    };
    saveConfig(merged);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /config PUT]", error);
    return NextResponse.json(
      { error: "保存配置失败" },
      { status: 500 },
    );
  }
}
