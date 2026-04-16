"use client";

import { useState } from "react";
import {
  executeTaskHealthCleanup,
  lookupTaskRecords,
  scanTaskHealth,
  type TaskHealthCandidate,
  type TaskLookupRecord,
} from "@/lib/api/taskMaintenance";

export function MaintenancePanel() {
  const [scanLoading, setScanLoading] = useState(false);
  const [executeLoading, setExecuteLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupQuery, setLookupQuery] = useState("");
  const [scanResult, setScanResult] = useState<{ autoDelete: TaskHealthCandidate[]; manualReview: TaskHealthCandidate[] } | null>(null);
  const [lookupResult, setLookupResult] = useState<{ active: TaskLookupRecord[]; trash: TaskLookupRecord[] } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleScan = async () => {
    setScanLoading(true);
    setError(null);
    setMessage(null);
    try {
      setScanResult(await scanTaskHealth());
    } catch (err) {
      setError(err instanceof Error ? err.message : "扫描失败");
    } finally {
      setScanLoading(false);
    }
  };

  const handleLookup = async () => {
    if (!lookupQuery.trim()) {
      setLookupResult({ active: [], trash: [] });
      return;
    }
    setLookupLoading(true);
    setError(null);
    try {
      setLookupResult(await lookupTaskRecords(lookupQuery));
    } catch (err) {
      setError(err instanceof Error ? err.message : "查找失败");
    } finally {
      setLookupLoading(false);
    }
  };

  const handleExecute = async () => {
    const snapshot = scanResult?.autoDelete.map((item) => ({ id: item.id, snapshotToken: item.snapshotToken })) ?? [];
    if (snapshot.length === 0) return;
    if (!window.confirm(`确定删除 ${snapshot.length} 条明确识别的测试任务吗？此操作不可恢复。`)) {
      return;
    }

    setExecuteLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await executeTaskHealthCleanup(snapshot);
      setMessage(`已删除 ${result.deleted.length} 条测试任务${result.skipped.length > 0 ? `，跳过 ${result.skipped.length} 条` : ""}`);
      const refreshed = await scanTaskHealth();
      setScanResult(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "执行删除失败");
    } finally {
      setExecuteLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-medium">维护与修复</h2>
        <p className="text-xs text-muted-foreground">
          先扫描，再预览，再执行。自动删除只处理明确识别的测试垃圾数据。
        </p>
      </div>

      {message && (
        <div className="rounded-lg border border-success/20 bg-success/5 p-3 text-sm text-success">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-error/20 bg-error/5 p-3 text-sm text-error">
          {error}
        </div>
      )}

      <div className="rounded-xl border bg-background/40 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-medium">任务健康扫描</h3>
            <p className="text-xs text-muted-foreground">识别可自动删除的测试任务，以及需要人工复核的异常记录。</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleScan}
              disabled={scanLoading}
              className="px-3 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {scanLoading ? "扫描中..." : "扫描任务健康"}
            </button>
            <button
              onClick={handleExecute}
              disabled={executeLoading || !scanResult || scanResult.autoDelete.length === 0}
              className="px-3 py-2 text-sm rounded-lg border hover:bg-accent disabled:opacity-50"
            >
              {executeLoading ? "删除中..." : "执行自动删除"}
            </button>
          </div>
        </div>

        {scanResult && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">可自动删除 ({scanResult.autoDelete.length})</div>
              {scanResult.autoDelete.length > 0 ? scanResult.autoDelete.map((item) => (
                <div key={item.id} className="rounded-lg border p-3 text-sm space-y-1">
                  <div className="font-mono text-xs break-all">{item.id}</div>
                  <div>{item.title || "无标题"}</div>
                  <div className="text-xs text-muted-foreground">{item.reason}</div>
                </div>
              )) : (
                <div className="text-sm text-muted-foreground">没有明确识别的测试垃圾数据。</div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">需人工确认 ({scanResult.manualReview.length})</div>
              {scanResult.manualReview.length > 0 ? scanResult.manualReview.map((item) => (
                <div key={item.id} className="rounded-lg border p-3 text-sm space-y-1">
                  <div className="font-mono text-xs break-all">{item.id}</div>
                  <div>{item.title || "无标题"}</div>
                  <div className="text-xs text-muted-foreground">{item.reason}</div>
                </div>
              )) : (
                <div className="text-sm text-muted-foreground">没有需要人工确认的异常记录。</div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-background/40 p-4 space-y-3">
        <div className="space-y-1">
          <label htmlFor="task-lookup-input" className="text-sm font-medium">作品找回搜索</label>
          <p className="text-xs text-muted-foreground">按任务 ID、标题或主题关键词查 SQLite 权威数据。</p>
        </div>
        <div className="flex gap-2">
          <input
            id="task-lookup-input"
            value={lookupQuery}
            onChange={(e) => setLookupQuery(e.target.value)}
            placeholder="例如：神农、264c7dde、Episode 3"
            className="flex-1 rounded-lg border bg-background p-3 text-sm"
          />
          <button
            onClick={handleLookup}
            disabled={lookupLoading}
            className="px-3 py-2 text-sm rounded-lg border hover:bg-accent disabled:opacity-50"
          >
            {lookupLoading ? "搜索中..." : "搜索作品"}
          </button>
        </div>

        {lookupResult && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">活动数据 ({lookupResult.active.length})</div>
              {lookupResult.active.length > 0 ? lookupResult.active.map((item) => (
                <div key={item.id} className="rounded-lg border p-3 text-sm space-y-1">
                  <div className="font-medium">{item.title || item.id}</div>
                  <div className="text-xs text-muted-foreground break-all">{item.id}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.invisibilityReason === "default_visible" ? "默认可见" : "默认被过滤为非正式任务"}
                  </div>
                </div>
              )) : (
                <div className="text-sm text-muted-foreground">没有找到活动数据。</div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">回收站 ({lookupResult.trash.length})</div>
              {lookupResult.trash.length > 0 ? lookupResult.trash.map((item) => (
                <div key={item.id} className="rounded-lg border p-3 text-sm space-y-1">
                  <div className="font-medium">{item.title || item.id}</div>
                  <div className="text-xs text-muted-foreground break-all">{item.id}</div>
                  <div className="text-xs text-muted-foreground">已在回收站中</div>
                </div>
              )) : (
                <div className="text-sm text-muted-foreground">没有找到回收站记录。</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
