import { NextRequest, NextResponse } from "next/server";
import { runAccuracyResearch } from "@/lib/accuracy/research";
import { getConfig } from "@/lib/server/db";
import type { WikipediaContent } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const config = getConfig();
    if (!config) {
      return NextResponse.json({ error: "尚未保存配置" }, { status: 400 });
    }

    const topic = typeof body.topic === "string" ? body.topic : "";
    if (!topic) {
      return NextResponse.json({ error: "缺少 topic" }, { status: 400 });
    }

    const result = await runAccuracyResearch({
      topic,
      contentType: typeof body.contentType === "string" ? body.contentType : undefined,
      wikipediaContent: body.wikipediaContent as WikipediaContent | undefined,
      accuracyConfig: config.accuracyConfig,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "准确性研究失败" },
      { status: 500 },
    );
  }
}
