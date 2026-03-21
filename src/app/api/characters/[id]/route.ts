import { NextRequest, NextResponse } from "next/server";
import { getCharacterById, upsertCharacter, deleteCharacter } from "@/lib/server/db";
import { extractCharacterImagesAsync, trashCharacterImages, fileRefsToUrls } from "@/lib/server/imageExtractor";
import type { Character } from "@/lib/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/characters/[id] — 获取单个角色 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const character = getCharacterById(id);
    if (!character) {
      return NextResponse.json({ error: "角色不存在" }, { status: 404 });
    }

    const result = fileRefsToUrls(character) as Character;
    return NextResponse.json(result);
  } catch (error) {
    console.error("[API /characters/[id] GET]", error);
    return NextResponse.json(
      { error: "获取角色失败" },
      { status: 500 },
    );
  }
}

/** PUT /api/characters/[id] — 更新角色 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const character = body.character as Character;

    if (!character || character.id !== id) {
      return NextResponse.json(
        { error: "character.id 与路由不匹配" },
        { status: 400 },
      );
    }

    const processed = await extractCharacterImagesAsync(character);
    upsertCharacter(processed);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /characters/[id] PUT]", error);
    return NextResponse.json(
      { error: "更新角色失败" },
      { status: 500 },
    );
  }
}

/** DELETE /api/characters/[id] — 删除角色（软删除，图片移到 .trash/） */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    // 先读取完整数据用于 trash 记录
    const char = getCharacterById(id);
    const existed = deleteCharacter(id);
    if (existed) {
      trashCharacterImages(id, char ?? undefined);
    }
    return NextResponse.json({ success: true, deleted: existed });
  } catch (error) {
    console.error("[API /characters/[id] DELETE]", error);
    return NextResponse.json(
      { error: "删除角色失败" },
      { status: 500 },
    );
  }
}
