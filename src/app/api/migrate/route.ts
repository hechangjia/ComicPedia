import { NextRequest, NextResponse } from "next/server";
import {
  upsertTask,
  upsertCharacter,
  saveConfig,
  batchUpsertSeries,
} from "@/lib/server/db";
import type { GenerateTask, Character, UserAPIConfigV2 } from "@/lib/types";
import type { Series } from "@/lib/series";

// ============================================================
// POST /api/migrate — 接收迁移元数据（JSON-only）
// 图片已通过 /api/migrate/image 预上传并替换为 file:// 引用，
// 此处只处理轻量 JSON，无需 extractTaskImages。
// ============================================================

type MigrateType = "tasks" | "characters" | "series" | "config";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, data } = body as { type: MigrateType; data: unknown };

    if (!type || data === undefined) {
      return NextResponse.json(
        { error: "缺少 type 或 data 字段" },
        { status: 400 },
      );
    }

    let count = 0;

    switch (type) {
      case "tasks": {
        // 单条任务（图片已替换为 file:// 引用）
        const task = data as GenerateTask;
        upsertTask(task);
        count = 1;
        break;
      }

      case "characters": {
        // 单条角色
        const char = data as Character;
        upsertCharacter(char);
        count = 1;
        break;
      }

      case "series": {
        const seriesList = data as Series[];
        if (Array.isArray(seriesList)) {
          batchUpsertSeries(seriesList);
          count = seriesList.length;
        }
        break;
      }

      case "config": {
        const config = data as UserAPIConfigV2;
        saveConfig(config);
        count = 1;
        break;
      }

      default:
        return NextResponse.json(
          { error: `未知迁移类型: ${type}` },
          { status: 400 },
        );
    }

    return NextResponse.json({ success: true, type, count });
  } catch (error) {
    console.error("[API /migrate POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "迁移失败" },
      { status: 500 },
    );
  }
}
