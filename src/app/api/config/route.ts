import { NextRequest, NextResponse } from "next/server";
import { getConfig, saveConfig } from "@/lib/server/db";
import type { UserAPIConfigV2 } from "@/lib/types";

/** GET /api/config — 获取 API 配置 */
export async function GET() {
  try {
    const config = getConfig();
    if (!config) {
      return NextResponse.json({
        version: 2,
        llmConfigs: [],
        imageConfigs: [],
        activeLLMId: null,
        activeImageId: null,
        updatedAt: new Date().toISOString(),
      } satisfies UserAPIConfigV2);
    }
    return NextResponse.json(config);
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
    const config = (await request.json()) as UserAPIConfigV2;

    if (config.version !== 2) {
      return NextResponse.json(
        { error: "仅支持 v2 配置格式" },
        { status: 400 },
      );
    }

    config.updatedAt = new Date().toISOString();
    saveConfig(config);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /config PUT]", error);
    return NextResponse.json(
      { error: "保存配置失败" },
      { status: 500 },
    );
  }
}
