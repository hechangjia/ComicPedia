import { NextRequest, NextResponse } from "next/server";
import { registerImage } from "@/lib/server/db";
import { saveImageFileAsync } from "@/lib/server/imageStorage";

/**
 * 图片保存 API 路由
 * 将 Base64 图片保存到 data/images/ 目录，并登记到 images 表
 *
 * 支持两种类型：
 * - type: "panel" (默认) — 保存漫画面板图片
 * - type: "reference" — 保存参考图
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, panelIndex, base64Data, type = "panel" } = body;

    if (!base64Data) {
      return NextResponse.json(
        { error: "缺少必要参数: base64Data" },
        { status: 400 }
      );
    }

    if (!taskId) {
      return NextResponse.json(
        { error: "缺少必要参数: taskId" },
        { status: 400 }
      );
    }

    if (type === "panel" && panelIndex === undefined) {
      return NextResponse.json(
        { error: "缺少必要参数: panelIndex" },
        { status: 400 }
      );
    }

    const key = type === "reference"
      ? `${taskId}_ref${body.refIndex ?? 0}`
      : `${taskId}_panel${panelIndex}_cur`;

    const stored = await saveImageFileAsync(key, base64Data);
    if (!stored) {
      return NextResponse.json(
        { error: "无效的 Base64 图片数据" },
        { status: 400 },
      );
    }

    registerImage(key, stored.filePath, stored.size);

    return NextResponse.json({
      success: true,
      ref: `file://${key}`,
      url: `/api/images/${encodeURIComponent(key)}`,
      key,
      size: stored.size,
    });
  } catch (error) {
    console.error("[Save Image] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存图片失败" },
      { status: 500 }
    );
  }
}
