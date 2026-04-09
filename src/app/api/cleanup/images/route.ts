import { NextRequest, NextResponse } from "next/server";
import { scanOrphanImages, purgeOrphanImages } from "@/lib/server/imageStorage";

// ============================================================
// GET  /api/cleanup/images — 扫描孤儿/重复图片（dry-run）
// POST /api/cleanup/images — 执行清理
// ============================================================

/**
 * GET — 返回可清理项的报告，不执行删除。
 */
export async function GET() {
  try {
    const scan = scanOrphanImages(new Set());
    return NextResponse.json({
      orphanDirs: scan.orphanDirs,
      legacyOutputDirs: scan.legacyOutputDirs,
      duplicates: scan.duplicates,
      reclaimableBytes: scan.reclaimableBytes,
      reclaimableMB: +(scan.reclaimableBytes / 1024 / 1024).toFixed(2),
    });
  } catch (error) {
    console.error("[API /cleanup/images GET]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scan failed" },
      { status: 500 },
    );
  }
}

/**
 * POST — 执行清理，删除孤儿目录和重复文件。
 * Body (optional): { confirm: true }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    if (!body.confirm) {
      return NextResponse.json(
        { error: "Please send { \"confirm\": true } to execute cleanup" },
        { status: 400 },
      );
    }

    const scan = scanOrphanImages(new Set());
    const result = purgeOrphanImages(scan);

    return NextResponse.json({
      ...result,
      freedMB: +(result.freedBytes / 1024 / 1024).toFixed(2),
      orphanDirsRemoved: scan.orphanDirs.length,
      legacyOutputDirsRemoved: scan.legacyOutputDirs.length,
      duplicatesRemoved: scan.duplicates.length,
    });
  } catch (error) {
    console.error("[API /cleanup/images POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cleanup failed" },
      { status: 500 },
    );
  }
}
