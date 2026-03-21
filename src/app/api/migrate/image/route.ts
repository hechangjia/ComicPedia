import { NextRequest, NextResponse } from "next/server";
import { saveImageFile } from "@/lib/server/imageStorage";
import { registerImage } from "@/lib/server/db";

// ============================================================
// POST /api/migrate/image — 单张图片上传（迁移专用）
// 接收：binary body (image/*) + query params: key
// 返回：{ ref: "file://{key}" }
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const key = request.nextUrl.searchParams.get("key");
    if (!key) {
      return NextResponse.json(
        { error: "缺少 key 参数" },
        { status: 400 },
      );
    }

    const contentType = request.headers.get("content-type") || "image/png";
    const buffer = await request.arrayBuffer();

    if (buffer.byteLength === 0) {
      return NextResponse.json(
        { error: "空图片数据" },
        { status: 400 },
      );
    }

    // 转换为 base64 data URI（saveImageFile 需要此格式）
    const ext = contentType.includes("jpeg") || contentType.includes("jpg")
      ? "jpeg"
      : contentType.replace("image/", "");
    const b64 = Buffer.from(buffer).toString("base64");
    const dataUri = `data:image/${ext};base64,${b64}`;

    const result = saveImageFile(key, dataUri);
    if (!result) {
      return NextResponse.json(
        { error: "图片保存失败" },
        { status: 500 },
      );
    }

    registerImage(key, result.filePath, result.size);

    return NextResponse.json({
      ref: `file://${key}`,
      size: result.size,
    });
  } catch (error) {
    console.error("[API /migrate/image POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "图片上传失败" },
      { status: 500 },
    );
  }
}
