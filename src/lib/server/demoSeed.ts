import fs from "fs";
import path from "path";
import type { GenerateTask } from "@/lib/types";

const SEED_PATH = path.join(process.cwd(), "data", "demo-seed.json");

interface DemoSeedFile {
  exportedAt: string;
  count: number;
  tasks: GenerateTask[];
}

/**
 * Load demo seed data from data/demo-seed.json.
 * Returns empty array if file doesn't exist.
 */
export function loadDemoSeed(): GenerateTask[] {
  try {
    if (!fs.existsSync(SEED_PATH)) return [];

    const raw = fs.readFileSync(SEED_PATH, "utf-8");
    const data: DemoSeedFile = JSON.parse(raw);

    if (!Array.isArray(data.tasks)) return [];

    // Ensure all tasks have valid dates
    return data.tasks.map((t) => ({
      ...t,
      createdAt: t.createdAt ? new Date(t.createdAt) : new Date(),
      updatedAt: t.updatedAt ? new Date(t.updatedAt) : new Date(),
    }));
  } catch (error) {
    console.warn("[DemoSeed] Failed to load demo seed:", error);
    return [];
  }
}

/**
 * Check if demo seed file exists.
 */
export function hasDemoSeed(): boolean {
  return fs.existsSync(SEED_PATH);
}
