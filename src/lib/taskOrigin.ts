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

  if (/^Episode \d+$/i.test(title) && topic === "Test") {
    return "test";
  }

  return DEFAULT_TASK_ORIGIN;
}

export function getDefaultListOrigins(): TaskOrigin[] {
  return [DEFAULT_TASK_ORIGIN];
}
