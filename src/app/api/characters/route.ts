import { NextRequest, NextResponse } from "next/server";
import { getAllCharacters, upsertCharacter } from "@/lib/server/db";
import { extractCharacterImagesAsync, fileRefsToUrls } from "@/lib/server/imageExtractor";
import type { Character } from "@/lib/types";

/** GET /api/characters — 获取所有角色 */
export async function GET() {
  try {
    const characters = getAllCharacters();
    // 列表接口：将 file:// 引用转换为 /api/images/ URL（避免返回大量 base64）
    const result = characters.map((c) => fileRefsToUrls(c));
    return NextResponse.json(result);
  } catch (error) {
    console.error("[API /characters GET]", error);
    return NextResponse.json(
      { error: "获取角色列表失败" },
      { status: 500 },
    );
  }
}

/** POST /api/characters — 创建/同步角色 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const character = body.character as Character;

    if (!character?.id) {
      return NextResponse.json(
        { error: "缺少 character.id" },
        { status: 400 },
      );
    }

    const processed = await extractCharacterImagesAsync(character);
    upsertCharacter(processed);

    return NextResponse.json({ success: true, id: processed.id });
  } catch (error) {
    console.error("[API /characters POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存角色失败" },
      { status: 500 },
    );
  }
}
