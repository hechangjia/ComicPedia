"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { getIDBAllComics, getIDBAllCharacters, getIDBAllSeries } from "@/lib/client/db";
import type { GenerateTask, Character, UserAPIConfigV2 } from "@/lib/types";
import type { Series } from "@/lib/series";

// ============================================================
// 一次性迁移工具：IndexedDB + localStorage → SQLite
//
// 三阶段迁移策略（绕过 V8 JSON.stringify ~10MB 限制）：
// 1. 提取所有 base64 图片 → 逐张上传到 /api/migrate/image → 获得 file:// 引用
// 2. 用 file:// 引用替换原始 base64，得到轻量 JSON 元数据
// 3. 上传轻量 JSON 到 /api/migrate
// ============================================================

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

export default function MigratePage() {
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
      // ── 阶段 1：读取本地数据 ──
      addLog("正在读取 IndexedDB 数据...");

      const [tasks, characters, seriesList] = await Promise.all([
        getIDBAllComics(),
        getIDBAllCharacters(),
        getIDBAllSeries(),
      ]);

      // 读取 localStorage 配置
      let config: UserAPIConfigV2 | null = null;
      try {
        const raw = localStorage.getItem("comicpedia_api_config");
        if (raw) config = JSON.parse(raw);
      } catch {
        addLog("⚠ localStorage 配置读取失败，跳过");
      }

      const total =
        tasks.length +
        characters.length +
        Math.ceil(seriesList.length / BATCH_SIZE) +
        (config ? 1 : 0);

      setStats({
        tasks: tasks.length,
        characters: characters.length,
        series: seriesList.length,
        config: !!config,
        uploaded: 0,
        total,
        skipped: 0,
      });

      addLog(`发现 ${tasks.length} 个任务, ${characters.length} 个角色, ${seriesList.length} 个连载`);

      if (total === 0) {
        addLog("没有需要迁移的数据");
        setStage("done");
        return;
      }

      // ── 阶段 2：逐条上传 ──
      setStage("uploading");
      let uploaded = 0;
      let skipped = 0;

      // 上传任务（逐条，图片逐张预上传）
      for (let i = 0; i < tasks.length; i++) {
        try {
          const imgCount = await uploadRecordWithImages("tasks", tasks[i], `task_${tasks[i].id}`);
          addLog(`任务 ${i + 1}/${tasks.length} 已上传 (${imgCount} 张图片)`);
        } catch (err) {
          skipped++;
          const msg = err instanceof Error ? err.message : "未知错误";
          addLog(`⚠ 任务 ${i + 1}/${tasks.length} 跳过: ${msg}`);
        }
        uploaded++;
        setStats((s) => ({ ...s, uploaded, skipped }));
      }

      // 上传角色（逐条，图片逐张预上传）
      for (let i = 0; i < characters.length; i++) {
        try {
          const imgCount = await uploadRecordWithImages("characters", characters[i], `char_${characters[i].id}`);
          addLog(`角色 ${i + 1}/${characters.length} 已上传 (${imgCount} 张图片)`);
        } catch (err) {
          skipped++;
          const msg = err instanceof Error ? err.message : "未知错误";
          addLog(`⚠ 角色 ${i + 1}/${characters.length} 跳过: ${msg}`);
        }
        uploaded++;
        setStats((s) => ({ ...s, uploaded, skipped }));
      }

      // 上传连载（无大图片，按批 JSON）
      const seriesBatches = Math.ceil(seriesList.length / BATCH_SIZE);
      for (let i = 0; i < seriesList.length; i += BATCH_SIZE) {
        const batch = seriesList.slice(i, i + BATCH_SIZE);
        const batchIdx = Math.ceil((i + 1) / BATCH_SIZE);
        try {
          await uploadJSON("series", batch);
          addLog(`连载批次 ${batchIdx}/${seriesBatches} 已上传`);
        } catch (err) {
          skipped++;
          const msg = err instanceof Error ? err.message : "未知错误";
          addLog(`⚠ 连载批次 ${batchIdx}/${seriesBatches} 跳过: ${msg}`);
        }
        uploaded++;
        setStats((s) => ({ ...s, uploaded, skipped }));
      }

      // 上传配置
      if (config) {
        try {
          await uploadJSON("config", config);
          addLog("API 配置已上传");
        } catch (err) {
          skipped++;
          const msg = err instanceof Error ? err.message : "未知错误";
          addLog(`⚠ 配置上传跳过: ${msg}`);
        }
        uploaded++;
        setStats((s) => ({ ...s, uploaded, skipped }));
      }

      if (skipped > 0) {
        addLog(`✓ 迁移完成（${skipped} 项跳过，可重试）`);
      } else {
        addLog("✓ 迁移完成！");
      }
      setStage("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "未知错误";
      setError(msg);
      addLog(`✗ 迁移失败: ${msg}`);
      setStage("error");
    }
  }, [addLog]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">
          ← 返回首页
        </Link>

        <h1 className="text-2xl font-bold mt-4 mb-2 dark:text-white">
          数据迁移工具
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          将浏览器本地数据（IndexedDB + localStorage）迁移到服务端数据库。
          此操作为一次性迁移，不会删除本地数据。
        </p>

        {/* 状态卡片 */}
        {stage !== "idle" && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4 border dark:border-gray-700">
            <div className="grid grid-cols-4 gap-4 text-center mb-4">
              <StatItem label="任务" count={stats.tasks} />
              <StatItem label="角色" count={stats.characters} />
              <StatItem label="连载" count={stats.series} />
              <StatItem label="配置" count={stats.config ? 1 : 0} />
            </div>

            {stage === "uploading" && stats.total > 0 && (
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.round((stats.uploaded / stats.total) * 100)}%` }}
                />
              </div>
            )}

            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
              {stage === "reading" && "正在读取本地数据..."}
              {stage === "uploading" && `上传中 ${stats.uploaded}/${stats.total}${stats.skipped ? ` (${stats.skipped} 项跳过)` : ""}`}
              {stage === "done" && (stats.skipped > 0 ? `✓ 迁移完成（${stats.skipped} 项跳过）` : "✓ 迁移完成")}
              {stage === "error" && `✗ ${error}`}
            </p>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={startMigration}
            disabled={stage === "reading" || stage === "uploading"}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {stage === "idle" ? "开始迁移" : stage === "done" || stage === "error" ? "重新迁移" : "迁移中..."}
          </button>
        </div>

        {/* 日志 */}
        {logs.length > 0 && (
          <div className="bg-gray-900 text-green-400 rounded-lg p-4 font-mono text-xs max-h-64 overflow-y-auto">
            {logs.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatItem({ label, count }: { label: string; count: number }) {
  return (
    <div>
      <div className="text-2xl font-bold dark:text-white">{count}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  );
}

// ============================================================
// 三阶段图片分离上传
// ============================================================

const BASE64_PREFIX = "data:image";

interface ExtractedImage {
  key: string;
  blob: Blob;
}

/**
 * 递归遍历对象，将所有 base64 图片提取到 images 数组，
 * 并用 `file://{key}` 引用替换原值。返回深拷贝后的对象。
 */
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
    return obj.map((item, i) =>
      extractAndReplaceImages(item, images, keyPrefix, `${pathSuffix}[${i}]`),
    );
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

/** 将 base64 data URI 转换为 Blob */
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

/**
 * 上传单条记录（任务/角色）：
 * 1. 提取所有 base64 → Blob，替换为 file:// 占位
 * 2. 逐张上传图片到 /api/migrate/image
 * 3. 上传轻量 JSON 元数据到 /api/migrate
 * @returns 上传的图片数量
 */
async function uploadRecordWithImages(
  type: string,
  record: GenerateTask | Character,
  keyPrefix: string,
): Promise<number> {
  const images: ExtractedImage[] = [];
  const cleaned = extractAndReplaceImages(record, images, keyPrefix, "");

  // 阶段 1：逐张上传图片
  for (const img of images) {
    const res = await fetch(
      `/api/migrate/image?key=${encodeURIComponent(img.key)}`,
      {
        method: "POST",
        headers: { "Content-Type": img.blob.type || "image/png" },
        body: img.blob,
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `图片上传失败: ${res.status}`);
    }
  }

  // 阶段 2：上传轻量元数据（所有 base64 已替换为 file:// 引用）
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

/** 轻量 JSON 上传（连载、配置等无大图片的数据） */
async function uploadJSON(
  type: string,
  data: Series[] | UserAPIConfigV2,
): Promise<void> {
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
