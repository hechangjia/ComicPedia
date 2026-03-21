import { NextResponse } from "next/server";
import { getAllTasks, upsertTask } from "@/lib/server/db";
import { loadDemoSeed } from "@/lib/server/demoSeed";

/**
 * POST /api/demo/seed — Seed demo data into the database.
 * Only works when the tasks table is empty (prevents overwriting real data).
 */
export async function POST() {
  try {
    const existing = getAllTasks();
    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Database already has tasks. Seed only works on empty DB.", count: existing.length },
        { status: 409 },
      );
    }

    const demoTasks = loadDemoSeed();
    if (demoTasks.length === 0) {
      return NextResponse.json(
        { error: "No demo seed file found. Generate comics first, then export via GET /api/demo/export." },
        { status: 404 },
      );
    }

    for (const task of demoTasks) {
      upsertTask(task);
    }

    return NextResponse.json({ success: true, seeded: demoTasks.length });
  } catch (error) {
    console.error("[API /demo/seed]", error);
    return NextResponse.json({ error: "Seed failed" }, { status: 500 });
  }
}
