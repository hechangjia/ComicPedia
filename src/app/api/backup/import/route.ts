import { NextResponse } from "next/server";
import { batchUpsertTasks, batchUpsertCharacters, batchUpsertSeries } from "@/lib/server/db";
import type { GenerateTask, Character } from "@/lib/types";
import type { Series } from "@/lib/series";

interface BackupData {
  version: string;
  exportedAt: string;
  tasks: GenerateTask[];
  characters: Character[];
  series: Series[];
}

/**
 * POST /api/backup/import — Import user data from backup JSON.
 * Merges with existing data (upsert by ID).
 *
 * 鉴权：设置 ADMIN_TOKEN 环境变量后，导入请求需要携带
 *   Header: Authorization: Bearer <token>
 * 未设置 ADMIN_TOKEN 时不做鉴权（本地开发模式）。
 *
 * Body: BackupData JSON
 */
export async function POST(request: Request) {
  try {
    // 鉴权检查：如果设置了 ADMIN_TOKEN，要求请求携带正确 token
    const adminToken = process.env.ADMIN_TOKEN;
    if (adminToken) {
      const authHeader = request.headers.get("Authorization");
      const token = authHeader?.replace(/^Bearer\s+/i, "");
      if (token !== adminToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const backup: BackupData = await request.json();

    if (!backup.version || !Array.isArray(backup.tasks)) {
      return NextResponse.json({ error: "Invalid backup format" }, { status: 400 });
    }

    // Validate and sanitize dates
    const tasks = backup.tasks.map((t) => ({
      ...t,
      createdAt: t.createdAt ? new Date(t.createdAt) : new Date(),
      updatedAt: t.updatedAt ? new Date(t.updatedAt) : new Date(),
    }));

    const characters = (backup.characters || []).map((c) => ({
      ...c,
      createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : new Date().toISOString(),
    }));

    const series = (backup.series || []).map((s) => ({
      ...s,
      createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: s.updatedAt ? new Date(s.updatedAt).toISOString() : new Date().toISOString(),
    }));

    // Batch upsert
    batchUpsertTasks(tasks);
    batchUpsertCharacters(characters);
    batchUpsertSeries(series);

    return NextResponse.json({
      success: true,
      imported: {
        tasks: tasks.length,
        characters: characters.length,
        series: series.length,
      },
    });
  } catch (error) {
    console.error("[API /backup/import]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed" },
      { status: 500 },
    );
  }
}
