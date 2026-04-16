import { randomUUID } from "node:crypto";
import { addMaintenanceAction, deleteImagesByPrefix, deleteTask, getAllTasks, getAllTrash, getTaskById } from "@/lib/server/db";
import { deleteImagesByDir } from "@/lib/server/imageStorage";
import { inferTaskOrigin } from "@/lib/taskOrigin";
import type { GenerateTask } from "@/lib/types";

export interface TaskHealthCandidate {
  id: string;
  origin: GenerateTask["origin"];
  status: GenerateTask["status"];
  title?: string;
  topic?: string;
  reason: string;
  snapshotToken: string;
  createdAt: string;
}

export interface TaskLookupRecord {
  id: string;
  title?: string;
  topic?: string;
  status?: GenerateTask["status"];
  origin?: GenerateTask["origin"];
  hasImages: boolean;
  inTrash: boolean;
  invisibilityReason: "default_visible" | "filtered_non_formal" | "trash_only";
}

export interface TaskCleanupSnapshotEntry {
  id: string;
  snapshotToken: string;
}

function buildSnapshotToken(task: Pick<GenerateTask, "id" | "status" | "updatedAt" | "origin" | "script">): string {
  return [
    task.id,
    task.status,
    task.updatedAt instanceof Date ? task.updatedAt.toISOString() : String(task.updatedAt),
    inferTaskOrigin(task),
  ].join("|");
}

function includesIgnoreCase(value: string | undefined, query: string): boolean {
  return Boolean(value && value.toLowerCase().includes(query.toLowerCase()));
}

function hasTaskImages(task: GenerateTask): boolean {
  return Boolean(task.script?.panels?.some((panel) => typeof panel.imageUrl === "string" && panel.imageUrl.length > 0));
}

function classifyTask(task: GenerateTask): { bucket: "autoDelete" | "manualReview"; reason: string } | null {
  const title = task.script?.title?.trim() ?? "";
  const topic = task.script?.topic?.trim() ?? "";

  if (/^arc_test_/i.test(task.id)) {
    return { bucket: "autoDelete", reason: "id matches arc_test_* fixture" };
  }

  // origin-explicit-* / origin-default-* fixture IDs
  if (/^origin-(explicit|default)-/i.test(task.id)) {
    return { bucket: "autoDelete", reason: "id matches origin-* fixture" };
  }

  if (task.status === "completed" && !task.script) {
    return { bucket: "autoDelete", reason: "completed task has no script payload" };
  }

  // Episode N (any suffix) + topic is "Test" or empty
  if (/^Episode \d+/i.test(title) && (!topic || /^test$/i.test(topic))) {
    return { bucket: "autoDelete", reason: "Episode fixture record" };
  }

  // Bare "Test" title or topic-only "Test"
  if (/^test$/i.test(title) || (/^test$/i.test(topic) && !title)) {
    return { bucket: "autoDelete", reason: "Test fixture record" };
  }

  // "Origin Task" fixture records
  if (/^Origin Task$/i.test(title)) {
    return { bucket: "autoDelete", reason: "Origin Task fixture record" };
  }

  if (!title && task.status === "completed") {
    return { bucket: "manualReview", reason: "completed task is missing a title" };
  }

  if (task.status === "completed" && (task.script?.panels?.length ?? 0) === 0) {
    return { bucket: "manualReview", reason: "completed task has zero panels" };
  }

  return null;
}

export function scanTaskHealth() {
  const autoDelete: TaskHealthCandidate[] = [];
  const manualReview: TaskHealthCandidate[] = [];

  for (const task of getAllTasks()) {
    const classified = classifyTask(task);
    if (!classified) continue;

    const candidate: TaskHealthCandidate = {
      id: task.id,
      origin: inferTaskOrigin(task),
      status: task.status,
      title: task.script?.title,
      topic: task.script?.topic,
      reason: classified.reason,
      snapshotToken: buildSnapshotToken(task),
      createdAt: task.createdAt instanceof Date ? task.createdAt.toISOString() : String(task.createdAt),
    };

    if (classified.bucket === "autoDelete") {
      autoDelete.push(candidate);
    } else {
      manualReview.push(candidate);
    }
  }

  return { autoDelete, manualReview };
}

export function lookupTaskRecords(query: string) {
  const trimmed = query.trim();
  if (!trimmed) return { active: [], trash: [] };

  const active: TaskLookupRecord[] = getAllTasks()
    .filter((task) =>
      task.id === trimmed
      || includesIgnoreCase(task.script?.title, trimmed)
      || includesIgnoreCase(task.script?.topic, trimmed),
    )
    .map((task) => {
      const origin = inferTaskOrigin(task);
      return {
        id: task.id,
        title: task.script?.title,
        topic: task.script?.topic,
        status: task.status,
        origin,
        hasImages: hasTaskImages(task),
        inTrash: false,
        invisibilityReason: origin === "user" ? "default_visible" : "filtered_non_formal",
      };
    });

  const trash: TaskLookupRecord[] = getAllTrash()
    .filter((item) => item.type === "task")
    .flatMap((item) => {
      const payload = JSON.parse(item.data) as { script?: { title?: string; topic?: string } };
      const title = payload.script?.title;
      const topic = payload.script?.topic;
      const match = item.id === trimmed || includesIgnoreCase(title, trimmed) || includesIgnoreCase(topic, trimmed);
      if (!match) return [];

      return [{
        id: item.id,
        title,
        topic,
        hasImages: Boolean(item.imageDir),
        inTrash: true,
        invisibilityReason: "trash_only" as const,
      }];
    });

  return { active, trash };
}

export function executeTaskHealthCleanup(snapshot: TaskCleanupSnapshotEntry[], actor: string) {
  const deleted: Array<{ id: string }> = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const entry of snapshot) {
    const task = getTaskById(entry.id);
    if (!task) {
      skipped.push({ id: entry.id, reason: "missing_task" });
      continue;
    }

    if (buildSnapshotToken(task) !== entry.snapshotToken) {
      skipped.push({ id: entry.id, reason: "snapshot_mismatch" });
      continue;
    }

    const classified = classifyTask(task);
    if (!classified || classified.bucket !== "autoDelete") {
      skipped.push({ id: entry.id, reason: "not_auto_delete_candidate" });
      continue;
    }

    deleteImagesByPrefix(task.id);
    deleteImagesByDir(task.id);
    const removed = deleteTask(task.id);

    if (!removed) {
      skipped.push({ id: entry.id, reason: "delete_failed" });
      continue;
    }

    deleted.push({ id: task.id });
  }

  addMaintenanceAction({
    id: randomUUID(),
    action: "task_health_execute",
    actor,
    summary: `${deleted.length} auto-delete task(s) removed`,
    payload: { deleted, skipped, snapshotSize: snapshot.length },
    createdAt: new Date().toISOString(),
  });

  return { deleted, skipped };
}

export { buildSnapshotToken };
