import { NextRequest, NextResponse } from "next/server";
import { readImageByKey, readImageAsBase64 } from "@/lib/server/imageStorage";
import { getImagePath } from "@/lib/server/db";
import path from "path";
import fs from "fs";

interface RouteParams {
  params: Promise<{ key: string }>;
}

/** GET /api/images/[key] — 提供图片文件 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { key } = await params;
    const decodedKey = decodeURIComponent(key);

    // Character images (char_*) are mutable — they can be replaced on re-generation.
    // Comic panel images are immutable — once generated, content never changes at same key.
    const isMutable = decodedKey.startsWith("char_");
    const cacheControl = isMutable
      ? "public, max-age=0, must-revalidate"
      : "public, max-age=31536000, immutable";

    // 优先从 images 表查路径
    const filePath = getImagePath(decodedKey);
    if (filePath) {
      const accept = request.headers.get("accept") || "";

      // 如果客户端请求 JSON / base64
      if (accept.includes("application/json")) {
        const base64 = readImageAsBase64(filePath);
        if (base64) {
          return NextResponse.json({ imageUrl: base64 });
        }
      }

      // 默认返回二进制图片
      const absPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(process.cwd(), filePath);

      if (!fs.existsSync(absPath)) {
        return NextResponse.json({ error: "图片文件不存在" }, { status: 404 });
      }

      const buffer = fs.readFileSync(absPath);
      const ext = path.extname(absPath).slice(1);
      const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;

      return new NextResponse(buffer, {
        headers: {
          "Content-Type": mime,
          "Cache-Control": cacheControl,
        },
      });
    }

    // 降级：直接通过 key 在文件系统查找
    const found = readImageByKey(decodedKey);
    if (!found) {
      return NextResponse.json({ error: "图片不存在" }, { status: 404 });
    }

    const buffer = fs.readFileSync(found.absPath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": found.mime,
        "Cache-Control": cacheControl,
      },
    });
  } catch (error) {
    console.error("[API /images/[key] GET]", error);
    return NextResponse.json(
      { error: "获取图片失败" },
      { status: 500 },
    );
  }
}
