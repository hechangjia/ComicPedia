import { GenerateTask } from "@/lib/types";
import { saveTask } from "./db";
import { useTaskStore } from "@/stores/taskStore";

// ============================================================
// Event Bus: Task state change notifications (Zustand single channel)
// ============================================================

/** Previous snapshot cache for diffing — avoids redundant store updates */
let lastSnapshotId: string | undefined;
let lastSnapshotProgress = -1;
let lastSnapshotStatus: string | undefined;

// ============================================================
// StreamText Channel — bypasses Zustand to avoid full tree re-renders
// ============================================================

type StreamTextListener = (text: string) => void;
const streamTextListeners = new Map<string, Set<StreamTextListener>>();
const streamTextCache = new Map<string, string>();

/** Subscribe to streamText updates for a specific task */
export function subscribeStreamText(taskId: string, listener: StreamTextListener): () => void {
  if (!streamTextListeners.has(taskId)) {
    streamTextListeners.set(taskId, new Set());
  }
  streamTextListeners.get(taskId)!.add(listener);
  // Deliver cached value immediately
  const cached = streamTextCache.get(taskId);
  if (cached) listener(cached);
  return () => {
    streamTextListeners.get(taskId)?.delete(listener);
    if (streamTextListeners.get(taskId)?.size === 0) {
      streamTextListeners.delete(taskId);
    }
  };
}

export function getStreamTextSnapshot(taskId: string): string {
  return streamTextCache.get(taskId) ?? "";
}

export function getStreamTextServerSnapshot(): string {
  return "";
}

/** Push streamText update to subscribers (no Zustand involved) */
function emitStreamText(taskId: string, text: string) {
  streamTextCache.set(taskId, text);
  streamTextListeners.get(taskId)?.forEach((fn) => fn(text));
}

/** Clear cached streamText when scripting ends */
export function clearStreamText(taskId: string) {
  streamTextCache.delete(taskId);
}

/**
 * Deep clone task to ensure Zustand store receives a new reference,
 * triggering selector recalculation.
 */
function cloneTask(task: GenerateTask): GenerateTask {
  return {
    ...task,
    script: task.script
      ? {
          ...task.script,
          panels: task.script.panels.map((p) => ({
            ...p,
            imageVersions: p.imageVersions ? [...p.imageVersions] : undefined,
          })),
          referenceEntries: task.script.referenceEntries
            ? task.script.referenceEntries.map((e) => ({
                ...e,
                versions: [...e.versions],
              }))
            : undefined,
        }
      : undefined,
  };
}

/**
 * Notify all subscribers: push task snapshot to Zustand store.
 * StreamText updates are routed to the dedicated channel instead of Zustand,
 * avoiding full React tree re-renders during SSE streaming.
 */
export function notifyListeners(task: GenerateTask) {
  const isStreaming = task.status === "scripting" && task.streamText;

  // Route streamText to dedicated channel (bypasses Zustand)
  if (isStreaming && task.streamText) {
    emitStreamText(task.id, task.streamText);
  }

  // Skip Zustand update when only streamText changed (no status/progress delta)
  if (
    isStreaming &&
    task.id === lastSnapshotId &&
    task.status === lastSnapshotStatus &&
    task.progress === lastSnapshotProgress
  ) {
    return; // streamText already emitted above — no need to touch Zustand
  }

  lastSnapshotId = task.id;
  lastSnapshotProgress = task.progress;
  lastSnapshotStatus = task.status;

  // Strip streamText from Zustand snapshot — it lives in its own channel
  const snapshot = cloneTask(task);
  snapshot.streamText = undefined;
  useTaskStore.getState().updateTask(snapshot);
}

// ============================================================
// DB Write Throttle — with diff-based skip
// ============================================================

const pendingFlush: Map<string, ReturnType<typeof setTimeout>> = new Map();
/** Track last actual write time per task — enables true throttle (not debounce) */
const lastWriteTime: Map<string, number> = new Map();
/** Track last written state fingerprint per task — skip identical writes */
const lastWriteFingerprint: Map<string, string> = new Map();

/**
 * Clean up all event bus state for a task (call on task delete or completion).
 * Prevents memory leak from accumulated Map entries.
 */
export function cleanupTaskState(taskId: string) {
  streamTextCache.delete(taskId);
  streamTextListeners.delete(taskId);
  const timer = pendingFlush.get(taskId);
  if (timer) clearTimeout(timer);
  pendingFlush.delete(taskId);
  lastWriteTime.delete(taskId);
  lastWriteFingerprint.delete(taskId);
}

/**
 * Generate a lightweight fingerprint of task state for diff detection.
 * Only captures fields that matter for persistence — ignores streamText.
 */
function taskFingerprint(task: GenerateTask): string {
  const panelStates = task.script?.panels
    .map((p) => `${p.status}:${p.activeVersionIndex ?? ""}:${p.imageVersions?.length ?? 0}`)
    .join(",") ?? "";
  return `${task.status}|${task.progress}|${panelStates}`;
}

/** Strip ephemeral fields before writing to IndexedDB */
function stripEphemeral(task: GenerateTask): GenerateTask {
  if (!task.streamText) return task;
  const { streamText, ...rest } = task;
  return rest;
}

/**
 * Throttled saveTask: true throttle mode with diff-based skip.
 * - First call writes immediately
 * - Subsequent calls within the interval are batched to the end of the window
 * - Skips writes when state fingerprint hasn't changed
 * - Strips streamText (ephemeral, not worth persisting)
 */
export async function saveTaskThrottled(task: GenerateTask, intervalMs = 300): Promise<void> {
  // Diff check: skip if nothing meaningful changed
  const fp = taskFingerprint(task);
  if (lastWriteFingerprint.get(task.id) === fp) {
    return;
  }

  const now = Date.now();
  const lastWrite = lastWriteTime.get(task.id) ?? 0;
  const elapsed = now - lastWrite;

  const writeTask = stripEphemeral(task);

  // If enough time has passed since last write, write immediately
  if (elapsed >= intervalMs) {
    lastWriteTime.set(task.id, now);
    lastWriteFingerprint.set(task.id, fp);
    const existing = pendingFlush.get(task.id);
    if (existing) {
      clearTimeout(existing);
      pendingFlush.delete(task.id);
    }
    await saveTask(writeTask);
    return;
  }

  // Otherwise, schedule a trailing write at the end of the window
  const existing = pendingFlush.get(task.id);
  if (existing) clearTimeout(existing);

  const remaining = intervalMs - elapsed;
  const timer = setTimeout(async () => {
    pendingFlush.delete(task.id);
    lastWriteTime.set(task.id, Date.now());
    lastWriteFingerprint.set(task.id, fp);
    await saveTask(writeTask);
  }, remaining);

  pendingFlush.set(task.id, timer);
}

/** Immediately flush pending throttled save (call at state termination) */
export async function flushThrottledSave(task: GenerateTask): Promise<void> {
  const existing = pendingFlush.get(task.id);
  if (existing) {
    clearTimeout(existing);
    pendingFlush.delete(task.id);
  }
  lastWriteFingerprint.set(task.id, taskFingerprint(task));
  await saveTask(stripEphemeral(task));
}
