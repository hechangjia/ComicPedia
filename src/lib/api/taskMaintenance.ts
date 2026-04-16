export interface TaskHealthCandidate {
  id: string;
  origin?: string;
  status: string;
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
  status?: string;
  origin?: string;
  hasImages: boolean;
  inTrash: boolean;
  invisibilityReason: "default_visible" | "filtered_non_formal" | "trash_only";
}

export async function scanTaskHealth() {
  const response = await fetch("/api/admin/task-health/scan", { method: "POST" });
  if (!response.ok) throw new Error("扫描任务健康状态失败");
  return response.json() as Promise<{
    autoDelete: TaskHealthCandidate[];
    manualReview: TaskHealthCandidate[];
  }>;
}

export async function lookupTaskRecords(query: string) {
  const response = await fetch(`/api/admin/task-lookup?q=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error("查找作品失败");
  return response.json() as Promise<{
    active: TaskLookupRecord[];
    trash: TaskLookupRecord[];
  }>;
}

export async function executeTaskHealthCleanup(snapshot: Array<{ id: string; snapshotToken: string }>) {
  const response = await fetch("/api/admin/task-health/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actor: "settings", snapshot }),
  });
  if (!response.ok) throw new Error("执行任务清理失败");
  return response.json() as Promise<{
    deleted: Array<{ id: string }>;
    skipped: Array<{ id: string; reason: string }>;
  }>;
}
