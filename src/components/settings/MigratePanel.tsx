"use client";

import { useState, useCallback } from "react";
import { getIDBAllComics, getIDBAllCharacters, getIDBAllSeries } from "@/lib/client/db";
import type { GenerateTask, Character, UserAPIConfigV2 } from "@/lib/types";
import type { Series } from "@/lib/series";

type MigrateStage = "idle" | "reading" | "uploading" | "done" | "error";

interface MigrateStats {
  tasks: number;
  characters: number;
  series: number;
  config: boolean;
  uploaded: number;
  total: number;
  skipped: number;
}

const BATCH_SIZE = 5;
const BASE64_PREFIX = "data:image";

interface ExtractedImage {
  key: string;
  blob: Blob;
}

function extractAndReplaceImages(
  obj: unknown,
  images: ExtractedImage[],
  keyPrefix: string,
  pathSuffix: string,
): unknown {
  if (typeof obj === "string" && obj.startsWith(BASE64_PREFIX)) {
    const idx = images.length;
    const key = `${keyPrefix}_img${idx}`;
    const blob = dataUriToBlob(obj);
    images.push({ key, blob });
    return `file://${key}`;
  }
  if (Array.isArray(obj)) {
    return obj.map((item, i) => extractAndReplaceImages(item, images, keyPrefix, `${pathSuffix}[${i}]`));
  }
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = extractAndReplaceImages(v, images, keyPrefix, `${pathSuffix}.${k}`);
    }
    return result;
  }
  return obj;
}

function dataUriToBlob(dataUri: string): Blob {
  const [header, b64] = dataUri.split(",");
  const mime = header.match(/data:(.*?);/)?.[1] ?? "image/png";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

async function uploadRecordWithImages(
  type: string,
  record: GenerateTask | Character,
  keyPrefix: string,
): Promise<number> {
  const images: ExtractedImage[] = [];
  const cleaned = extractAndReplaceImages(record, images, keyPrefix, "");
  for (const img of images) {
    const res = await fetch(`/api/migrate/image?key=${encodeURIComponent(img.key)}`, {
      method: "POST",
      headers: { "Content-Type": img.blob.type || "image/png" },
      body: img.blob,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `图片上传失败: ${res.status}`);
    }
  }
  const res = await fetch("/api/migrate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, data: cleaned }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `元数据上传失败: ${res.status}`);
  }
  return images.length;
}

async function uploadJSON(type: string, data: Series[] | UserAPIConfigV2): Promise<void> {
  const res = await fetch("/api/migrate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, data }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `上传失败: ${res.status}`);
  }
}

export function MigratePanel() {
  const [stage, setStage] = useState<MigrateStage>("idle");
  const [stats, setStats] = useState<MigrateStats>({
    tasks: 0, characters: 0, series: 0, config: false, uploaded: 0, total: 0, skipped: 0,
  });
  const [error, setError] = useState("");
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const startMigration = useCallback(async () => {
    setStage("reading");
    setError("");
    setLogs([]);
    try {
      addLog("正在读取 IndexedDB 数据...");
      const [tasks, characters, seriesList] = await Promise.all([
        getIDBAllComics(), getIDBAllCharacters(), getIDBAllSeries(),
      ]);
      let config: UserAPIConfigV2 | null = null;
      try {
        const raw = localStorage.getItem("comicpedia_api_config");
        if (raw) config = JSON.parse(raw);
      } catch { addLog("⚠ localStorage 配置读取失败，跳过"); }

      const total = tasks.length + characters.length + Math.ceil(seriesList.length / BATCH_SIZE) + (config ? 1 : 0);
      setStats({ tasks: tasks.length, characters: characters.length, series: seriesList.length, config: !!config, uploaded: 0, total, skipped: 0 });
      addLog(`发现 ${tasks.length} 个任务, ${characters.length} 个角色, ${seriesList.length} 个连载`);
      if (total === 0) { addLog("没有需要迁移的数据"); setStage("done"); return; }

      setStage("uploading");
      let uploaded = 0;
      let skipped = 0;

      for (let i = 0; i < tasks.length; i++) {
        try {
          const imgCount = await uploadRecordWithImages("tasks", tasks[i], `task_${tasks[i].id}`);
          addLog(`任务 ${i + 1}/${tasks.length} 已上传 (${imgCount} 张图片)`);
        } catch (err) { skipped++; addLog(`⚠ 任务 ${i + 1}/${tasks.length} 跳过: ${err instanceof Error ? err.message : "未知错误"}`); }
        uploaded++;
        setStats((s) => ({ ...s, uploaded, skipped }));
      }
      for (let i = 0; i < characters.length; i++) {
        try {
          const imgCount = await uploadRecordWithImages("characters", characters[i], `char_${characters[i].id}`);
          addLog(`角色 ${i + 1}/${characters.length} 已上传 (${imgCount} 张图片)`);
        } catch (err) { skipped++; addLog(`⚠ 角色 ${i + 1}/${characters.length} 跳过: ${err instanceof Error ? err.message : "未知错误"}`); }
        uploaded++;
        setStats((s) => ({ ...s, uploaded, skipped }));
      }
      const seriesBatches = Math.ceil(seriesList.length / BATCH_SIZE);
      for (let i = 0; i < seriesList.length; i += BATCH_SIZE) {
        const batch = seriesList.slice(i, i + BATCH_SIZE);
        const batchIdx = Math.ceil((i + 1) / BATCH_SIZE);
        try { await uploadJSON("series", batch); addLog(`连载批次 ${batchIdx}/${seriesBatches} 已上传`); }
        catch (err) { skipped++; addLog(`⚠ 连载批次 ${batchIdx}/${seriesBatches} 跳过: ${err instanceof Error ? err.message : "未知错误"}`); }
        uploaded++;
        setStats((s) => ({ ...s, uploaded, skipped }));
      }
      if (config) {
        try { await uploadJSON("config", config); addLog("API 配置已上传"); }
        catch (err) { skipped++; addLog(`⚠ 配置上传跳过: ${err instanceof Error ? err.message : "未知错误"}`); }
        uploaded++;
        setStats((s) => ({ ...s, uploaded, skipped }));
      }
      addLog(skipped > 0 ? `✓ 迁移完成（${skipped} 项跳过，可重试）` : "✓ 迁移完成！");
      setStage("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "未知错误";
      setError(msg);
      addLog(`✗ 迁移失败: ${msg}`);
      setStage("error");
    }
  }, [addLog]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-medium">数据迁移工具</h2>
        <p className="text-xs text-muted-foreground mt-1">
          将浏览器本地数据（IndexedDB + localStorage）迁移到服务端数据库。此操作为一次性迁移，不会删除本地数据。
        </p>
      </div>

      {stage !== "idle" && (
        <div className="rounded-lg border p-4 space-y-3">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div><div className="text-xl font-bold">{stats.tasks}</div><div className="text-xs text-muted-foreground">任务</div></div>
            <div><div className="text-xl font-bold">{stats.characters}</div><div className="text-xs text-muted-foreground">角色</div></div>
            <div><div className="text-xl font-bold">{stats.series}</div><div className="text-xs text-muted-foreground">连载</div></div>
            <div><div className="text-xl font-bold">{stats.config ? 1 : 0}</div><div className="text-xs text-muted-foreground">配置</div></div>
          </div>
          {stage === "uploading" && stats.total > 0 && (
            <div className="w-full bg-muted rounded-full h-2">
              <div className="bg-info h-2 rounded-full transition-all duration-300" style={{ width: `${Math.round((stats.uploaded / stats.total) * 100)}%` }} />
            </div>
          )}
          <p className="text-sm text-muted-foreground text-center">
            {stage === "reading" && "正在读取本地数据..."}
            {stage === "uploading" && `上传中 ${stats.uploaded}/${stats.total}${stats.skipped ? ` (${stats.skipped} 项跳过)` : ""}`}
            {stage === "done" && (stats.skipped > 0 ? `迁移完成（${stats.skipped} 项跳过）` : "迁移完成")}
            {stage === "error" && error}
          </p>
        </div>
      )}

      <button
        onClick={startMigration}
        disabled={stage === "reading" || stage === "uploading"}
        className="px-4 py-2 text-sm bg-info text-white rounded-lg hover:bg-info/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {stage === "idle" ? "开始迁移" : stage === "done" || stage === "error" ? "重新迁移" : "迁移中..."}
      </button>

      {logs.length > 0 && (
        <div className="bg-gray-900 text-success rounded-lg p-3 font-mono text-xs max-h-48 overflow-y-auto">
          {logs.map((log, i) => (<div key={i}>{log}</div>))}
        </div>
      )}
    </div>
  );
}
