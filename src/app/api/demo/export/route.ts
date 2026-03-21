import { NextResponse } from "next/server";
import { getAllTasks } from "@/lib/server/db";
import type { GenerateTask } from "@/lib/types";

/**
 * GET /api/demo/export — Export all completed tasks as a demo seed JSON.
 * Strips base64 image data (too large); keeps scripts, prompts, and metadata.
 * Run this after generating sample comics, then save the output as data/demo-seed.json.
 */
export async function GET() {
  try {
    const tasks = getAllTasks();
    const completed = tasks.filter((t) => t.status === "completed" && t.script?.panels?.length);

    // Strip base64 images to keep the seed file small
    const stripped: GenerateTask[] = completed.map((task) => ({
      ...task,
      script: task.script
        ? {
            ...task.script,
            referenceImage: undefined,
            referenceImages: undefined,
            referenceEntries: undefined,
            panels: task.script.panels.map((p) => ({
              ...p,
              // Keep image URL only if it's a file ref (not base64)
              imageUrl: p.imageUrl?.startsWith("data:") ? undefined : p.imageUrl,
              referenceImage: undefined,
              referenceImages: undefined,
              imageVersions: undefined,
            })),
          }
        : undefined,
    }));

    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      count: stripped.length,
      tasks: stripped,
    });
  } catch (error) {
    console.error("[API /demo/export]", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
