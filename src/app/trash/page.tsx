"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Spinner } from "@/components/ui/Spinner";
import { formatDate } from "@/lib/utils";

interface TrashItemSummary {
  id: string;
  type: "task" | "character";
  name: string;
  deletedAt: string;
}

export default function TrashPage() {
  const [items, setItems] = useState<TrashItemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const loadTrash = async () => {
    try {
      const res = await fetch("/api/trash");
      if (res.ok) {
        setItems(await res.json());
      }
    } catch (e) {
      console.error("Load trash failed:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrash();
  }, []);

  const handleRestore = async (id: string) => {
    setActionId(id);
    try {
      const res = await fetch(`/api/trash/${id}`, { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        setItems((prev) => prev.filter((it) => it.id !== id));
        alert(`已恢复${result.type === "task" ? "漫画" : "角色"}，可在对应页面查看`);
      } else {
        alert("恢复失败");
      }
    } catch (e) {
      console.error("Restore failed:", e);
      alert("恢复失败");
    } finally {
      setActionId(null);
    }
  };

  const handlePermanentDelete = async (id: string, name: string) => {
    if (!confirm(`确定永久删除「${name}」？此操作不可恢复！`)) return;
    setActionId(id);
    try {
      const res = await fetch(`/api/trash/${id}`, { method: "DELETE" });
      if (res.ok) {
        setItems((prev) => prev.filter((it) => it.id !== id));
      } else {
        alert("永久删除失败");
      }
    } catch (e) {
      console.error("Permanent delete failed:", e);
      alert("永久删除失败");
    } finally {
      setActionId(null);
    }
  };

  const handleClearAll = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    setActionId("clear-all");
    try {
      const res = await fetch("/api/trash", { method: "DELETE" });
      if (res.ok) {
        setItems([]);
        setConfirmClear(false);
      } else {
        alert("清空失败");
      }
    } catch (e) {
      console.error("Clear trash failed:", e);
      alert("清空失败");
    } finally {
      setActionId(null);
    }
  };

  const tasks = items.filter((i) => i.type === "task");
  const characters = items.filter((i) => i.type === "character");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回
          </Link>
          <h1 className="text-2xl font-bold">回收站</h1>
          <span className="text-sm text-muted-foreground">
            {items.length > 0 ? `${items.length} 项` : ""}
          </span>
        </div>
        {items.length > 0 && (
          <button
            onClick={handleClearAll}
            disabled={actionId === "clear-all"}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              confirmClear
                ? "bg-red-600 text-white hover:bg-red-700"
                : "border hover:bg-accent"
            } disabled:opacity-50`}
          >
            {actionId === "clear-all" ? (
              <Spinner size="sm" />
            ) : confirmClear ? (
              "确认清空？不可恢复！"
            ) : (
              "清空回收站"
            )}
          </button>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="text-center py-16 space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center">
            <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <p className="text-muted-foreground">回收站是空的</p>
        </div>
      )}

      {/* 漫画任务 */}
      {tasks.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
            </svg>
            漫画 ({tasks.length})
          </h2>
          <div className="space-y-2">
            {tasks.map((item) => (
              <TrashRow
                key={item.id}
                item={item}
                busy={actionId === item.id}
                onRestore={() => handleRestore(item.id)}
                onDelete={() => handlePermanentDelete(item.id, item.name)}
              />
            ))}
          </div>
        </section>
      )}

      {/* 角色 */}
      {characters.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            角色 ({characters.length})
          </h2>
          <div className="space-y-2">
            {characters.map((item) => (
              <TrashRow
                key={item.id}
                item={item}
                busy={actionId === item.id}
                onRestore={() => handleRestore(item.id)}
                onDelete={() => handlePermanentDelete(item.id, item.name)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TrashRow({
  item,
  busy,
  onRestore,
  onDelete,
}: {
  item: TrashItemSummary;
  busy: boolean;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-lg border bg-card">
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{item.name}</p>
        <p className="text-xs text-muted-foreground">
          删除于 {formatDate(item.deletedAt, { style: "datetime" })}
        </p>
      </div>
      <div className="flex items-center gap-2 ml-3 shrink-0">
        <button
          onClick={onRestore}
          disabled={busy}
          className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1.5"
          title="恢复到原位置"
        >
          {busy ? (
            <Spinner size="sm" />
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          )}
          恢复
        </button>
        <button
          onClick={onDelete}
          disabled={busy}
          className="px-3 py-1.5 text-sm rounded-lg border text-red-600 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          title="永久删除（不可恢复）"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          永久删除
        </button>
      </div>
    </div>
  );
}
