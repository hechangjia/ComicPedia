import { authorizeBackup, backupError } from "@/lib/server/backup/http";
import { mapArtworkValue } from "@/lib/server/backup/archive";
import { NextResponse } from "next/server";
import { getAllTasks, getAllCharacters as getServerCharacters, getAllSeriesList as getServerSeries } from "@/lib/server/db";
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
 * Legacy read-only JSON extract, NOT a portable backup: local file references remain.
 * Use /api/backup/archive for media-inclusive, validated portable artwork archives.
 *
 * Query params:
 *   ?strip_images=true — Remove base64 images to reduce file size (metadata only)
 */
export async function GET(request: Request) {
  try {
    authorizeBackup(request);
    const { searchParams } = new URL(request.url);
    const stripImages = searchParams.get("strip_images") === "true";

    const tasks = getAllTasks();
    const characters = getServerCharacters();
    const series = getServerSeries();

    let exportTasks: GenerateTask[] = tasks;
    let exportCharacters: Character[] = characters;

    if (stripImages) {
      // Strip base64 images from tasks
      exportTasks = tasks.map((task) => ({
        ...task,
        script: task.script
          ? {
              ...task.script,
              referenceImage: undefined,
              referenceImages: undefined,
              referenceEntries: task.script.referenceEntries?.map((e) => ({
                ...e,
                imageUrl: e.imageUrl?.startsWith("data:") ? "" : e.imageUrl,
                versions: e.versions?.map((v) => ({
                  ...v,
                  imageUrl: v.imageUrl?.startsWith("data:") ? "" : v.imageUrl,
                })),
              })),
              panels: task.script.panels.map((p) => ({
                ...p,
                imageUrl: p.imageUrl?.startsWith("data:") ? undefined : p.imageUrl,
                referenceImage: undefined,
                referenceImages: undefined,
                imageVersions: p.imageVersions?.map((v) => ({
                  ...v,
                  imageUrl: v.imageUrl?.startsWith("data:") ? "" : v.imageUrl,
                })),
              })),
            }
          : undefined,
      })) as GenerateTask[];

      // Strip base64 images from characters
      exportCharacters = characters.map((char) => ({
        ...char,
        avatarUrl: char.avatarUrl?.startsWith("data:") ? undefined : char.avatarUrl,
        referenceEntries: char.referenceEntries?.map((e) => ({
          ...e,
          imageUrl: e.imageUrl?.startsWith("data:") ? "" : e.imageUrl,
          versions: e.versions?.map((v) => ({
            ...v,
            imageUrl: v.imageUrl?.startsWith("data:") ? "" : v.imageUrl,
          })),
        })),
      })) as Character[];
    }

    const backup: BackupData = {
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      tasks: exportTasks,
      characters: exportCharacters,
      series,
    };

    return NextResponse.json(await mapArtworkValue(backup, async text => text, true), { headers: { "Cache-Control": "no-store", "X-ComicPedia-Scope": "legacy-json-not-portable" } });
  } catch (error) {
    return backupError(error);
  }
}
