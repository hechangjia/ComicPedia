import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, readFile, readdir } from "fs/promises";
import path from "path";

/**
 * 图片保存 API 路由
 * 将 Base64 图片保存到 public/output/{dirName}/ 目录
 *
 * 支持两种类型：
 * - type: "panel" (默认) — 保存漫画面板图片
 * - type: "reference" — 保存参考图
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskId, panelIndex, base64Data, title, type = "panel" } = body;

    if (!base64Data) {
      return NextResponse.json(
        { error: "缺少必要参数: base64Data" },
        { status: 400 }
      );
    }

    if (type === "panel" && (panelIndex === undefined || !taskId)) {
      return NextResponse.json(
        { error: "缺少必要参数: taskId, panelIndex" },
        { status: 400 }
      );
    }

    // 提取 Base64 数据（去掉 data:image/xxx;base64, 前缀）
    const matches = base64Data.match(/^data:image\/([\w+]+);base64,(.+)$/);
    if (!matches) {
      return NextResponse.json(
        { error: "无效的 Base64 图片数据" },
        { status: 400 }
      );
    }

    const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
    const buffer = Buffer.from(matches[2], "base64");

    // 使用漫画标题（sanitized）作为目录名基础，回退到 taskId
    const baseName = title
      ? title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 50)
      : taskId;

    // 查找或创建目录（同一 taskId 复用目录，不同 taskId 同名则带时间戳）
    const outputBase = path.join(process.cwd(), "public", "output");
    const dirName = await findOrCreateDir(outputBase, baseName, taskId);

    const outputDir = path.join(outputBase, dirName);

    // Path Traversal 防护：确保最终路径在 outputBase 内
    const resolvedDir = path.resolve(outputDir);
    const resolvedBase = path.resolve(outputBase);
    if (!resolvedDir.startsWith(resolvedBase + path.sep) && resolvedDir !== resolvedBase) {
      return NextResponse.json(
        { error: "非法路径" },
        { status: 400 },
      );
    }

    await mkdir(outputDir, { recursive: true });

    let fileName: string;
    if (type === "reference") {
      const refIndex = body.refIndex ?? 0;
      fileName = `reference_${String(refIndex + 1).padStart(2, "0")}.${ext}`;
    } else {
      fileName = `panel_${String(panelIndex + 1).padStart(2, "0")}.${ext}`;
    }

    const filePath = path.join(outputDir, fileName);
    await writeFile(filePath, buffer);

    const publicPath = `/output/${dirName}/${fileName}`;

    return NextResponse.json({
      success: true,
      path: publicPath,
      absolutePath: filePath,
      dirName,
    });
  } catch (error) {
    console.error("[Save Image] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存图片失败" },
      { status: 500 }
    );
  }
}

/**
 * 查找已有目录或创建带时间戳的新目录。
 * 同一个 taskId 的所有图片复用同一目录，不同 taskId 的同名作品创建新目录。
 */
async function findOrCreateDir(outputBase: string, baseName: string, taskId?: string): Promise<string> {
  if (!taskId) return baseName;

  const mapFile = path.join(outputBase, ".dirmap.json");

  // 尝试从映射文件读取已有目录
  let map: Record<string, string> = {};
  try {
    const raw = await readFile(mapFile, "utf-8");
    map = JSON.parse(raw);
    if (map[taskId]) {
      return map[taskId];
    }
  } catch {
    // 映射文件不存在，继续
  }

  // 检查是否存在不带时间戳的旧目录（向后兼容首次保存）
  let dirName = baseName;
  try {
    await readdir(path.join(outputBase, baseName));
    // 旧目录已存在，可能属于其他任务 —— 创建带时间戳的新目录
    const now = new Date();
    const ts = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      "_",
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join("");
    dirName = `${baseName}_${ts}`;
  } catch {
    // 目录不存在，使用 baseName
  }

  // 保存映射
  try {
    map[taskId] = dirName;
    await mkdir(outputBase, { recursive: true });
    await writeFile(mapFile, JSON.stringify(map, null, 2));
  } catch {
    // 映射保存失败不影响主流程
  }

  return dirName;
}
