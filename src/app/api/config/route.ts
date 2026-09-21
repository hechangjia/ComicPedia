import { sanitizeModelCredentials, mergeModelCredentials, ModelCredentialError } from "@/lib/config/modelCredentials";
import { normalizeUserConfig } from "@/lib/config/userConfig";
import { configRevision } from "@/lib/server/configRevision";
import { validateConfigPayload } from "@/lib/config/configValidation";
import { NextRequest, NextResponse } from "next/server";
import { getConfig, saveConfigIfMatch } from "@/lib/server/db";
import type { UserAPIConfigV2 } from "@/lib/types";
import {
  mergeAccuracyProviderSecrets,
  sanitizeAccuracyConfigForClient,
} from "@/lib/accuracy/providerConfig";

/** GET /api/config — 获取 API 配置 */
export async function GET() {
  try {
    const stored = getConfig();
    const config = normalizeUserConfig(stored);
    return NextResponse.json({
      ...sanitizeModelCredentials(config),
      accuracyConfig: sanitizeAccuracyConfigForClient(config.accuracyConfig),
    }, { headers: { ETag: configRevision(stored), "Cache-Control": "no-store" } });
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
    let payload: unknown;
    try { payload = await request.json(); } catch {
      return NextResponse.json({ error: "请求不是有效 JSON" }, { status: 400 });
    }
    const validationError = validateConfigPayload(payload);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const expectedRevision = request.headers.get("if-match");
    if (!expectedRevision) return NextResponse.json({ error: "请先读取服务器配置版本" }, { status: 428 });
    const config = normalizeUserConfig(payload as UserAPIConfigV2);
    const existing = normalizeUserConfig(getConfig());
    const merged: UserAPIConfigV2 = {
      ...mergeModelCredentials(existing, config),
      accuracyConfig: mergeAccuracyProviderSecrets(existing.accuracyConfig, config.accuracyConfig),
      updatedAt: new Date().toISOString(),
    };
    if (!saveConfigIfMatch(merged, expectedRevision)) {
      return NextResponse.json({ error: "配置版本已变化，请重新读取后保存" }, { status: 412 });
    }
    return NextResponse.json({ success: true }, { headers: { ETag: configRevision(merged), "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ModelCredentialError) return NextResponse.json({ code: "MODEL_CREDENTIAL_ACTION_REQUIRED", error: error.message }, { status: 400 });
    console.error("[API /config PUT] Save failed");
    return NextResponse.json(
      { error: "保存配置失败" },
      { status: 500 },
    );
  }
}
