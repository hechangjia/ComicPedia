import type { ComicScript, GenerateTask, TaskOrigin } from "@/lib/types";

export const DEFAULT_TASK_ORIGIN: TaskOrigin = "user";

const VALID_TASK_ORIGINS = new Set<TaskOrigin>([
  "user",
  "demo",
  "test",
  "imported",
  "system",
]);

export function normalizeTaskOrigin(value: unknown): TaskOrigin {
  return typeof value === "string" && VALID_TASK_ORIGINS.has(value as TaskOrigin)
    ? value as TaskOrigin
    : DEFAULT_TASK_ORIGIN;
}

export function inferTaskOrigin(task: {
  id: string;
  origin?: unknown;
  script?: Pick<ComicScript, "title" | "topic">;
}): TaskOrigin {
  const explicit = normalizeTaskOrigin(task.origin);
  if (task.origin) {
    return explicit;
  }

  const title = task.script?.title?.trim() ?? "";
  const topic = task.script?.topic?.trim() ?? "";

  if (/^arc_test_/i.test(task.id)) {
    return "test";
  }

  // Episode N / Episode N - xxx with topic "Test" or empty topic
  if (/^Episode \d+/i.test(title) && (!topic || /^test$/i.test(topic))) {
    return "test";
  }

  // Bare "Test" title or topic
  if (/^test$/i.test(title) || (/^test$/i.test(topic) && !title)) {
    return "test";
  }

  // Tasks with no script at all (zombie / fixture leftovers)
  if (!task.script?.title && !task.script?.topic) {
    // Only flag as test if id looks auto-generated (UUID-like but not user-created)
    // Leave genuinely empty user tasks alone
  }

  return DEFAULT_TASK_ORIGIN;
}

export function getDefaultListOrigins(): TaskOrigin[] {
  return [DEFAULT_TASK_ORIGIN];
}
