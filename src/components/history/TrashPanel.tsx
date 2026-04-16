"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { formatDate } from "@/lib/utils";
import { Image as ImageIcon, Trash2, Undo2, User } from "lucide-react";

interface TrashItemSummary {
  id: string;
  type: "task" | "character";
  name: string;
  deletedAt: string;
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
          {busy ? <Spinner size="sm" /> : <Undo2 className="w-4 h-4" />}
          恢复
        </button>
        <button
          onClick={onDelete}
          disabled={busy}
          className="px-3 py-1.5 text-sm rounded-lg border text-error hover:bg-error/5 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          title="永久删除（不可恢复）"
        >
          <Trash2 className="w-4 h-4" />
          永久删除
        </button>
      </div>
    </div>
  );
}

export function TrashPanel() {
  const [items, setItems] = useState<TrashItemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const loadTrash = async () => {
    try {
      const res = await fetch("/api/trash");
      if (res.ok) setItems(await res.json());
    } catch (e) {
      console.error("Load trash failed:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTrash(); }, []);

  const handleRestore = async (id: string) => {
    setActionId(id);
    try {
      const res = await fetch(`/api/trash/${id}`, { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        setItems((prev) => prev.filter((it) => it.id !== id));
        alert(`已恢复${result.type === "task" ? "漫画" : "角色"}，可在对应页面查看`);
      } else { alert("恢复失败"); }
    } catch { alert("恢复失败"); }
    finally { setActionId(null); }
  };

  const handlePermanentDelete = async (id: string, name: string) => {
    if (!confirm(`确定永久删除「${name}」？此操作不可恢复！`)) return;
    setActionId(id);
    try {
      const res = await fetch(`/api/trash/${id}`, { method: "DELETE" });
      if (res.ok) setItems((prev) => prev.filter((it) => it.id !== id));
      else alert("永久删除失败");
    } catch { alert("永久删除失败"); }
    finally { setActionId(null); }
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
      if (res.ok) { setItems([]); setConfirmClear(false); }
      else alert("清空失败");
    } catch { alert("清空失败"); }
    finally { setActionId(null); }
  };

  const tasks = items.filter((i) => i.type === "task");
  const characters = items.filter((i) => i.type === "character");

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12 space-y-3">
        <div className="w-14 h-14 mx-auto rounded-full bg-muted flex items-center justify-center">
          <Trash2 className="w-7 h-7 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">回收站是空的</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 清空按钮 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{items.length} 项</span>
        <button
          onClick={handleClearAll}
          disabled={actionId === "clear-all"}
          className={`px-4 py-2 text-sm rounded-lg transition-colors ${
            confirmClear ? "bg-error text-white hover:bg-error/90" : "border hover:bg-accent"
          } disabled:opacity-50`}
        >
          {actionId === "clear-all" ? <Spinner size="sm" /> : confirmClear ? "确认清空？" : "清空回收站"}
        </button>
      </div>

      {tasks.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-muted-foreground" />
            漫画 ({tasks.length})
          </h3>
          <div className="space-y-2">
            {tasks.map((item) => (
              <TrashRow key={item.id} item={item} busy={actionId === item.id}
                onRestore={() => handleRestore(item.id)}
                onDelete={() => handlePermanentDelete(item.id, item.name)} />
            ))}
          </div>
        </section>
      )}

      {characters.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            角色 ({characters.length})
          </h3>
          <div className="space-y-2">
            {characters.map((item) => (
              <TrashRow key={item.id} item={item} busy={actionId === item.id}
                onRestore={() => handleRestore(item.id)}
                onDelete={() => handlePermanentDelete(item.id, item.name)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
