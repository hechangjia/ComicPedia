"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  getAllCharacters,
  saveCharacter,
  deleteCharacter,
  clearAllCharacters,
} from "@/lib/client/db";
import type { Character, ComicStyle, ReferenceImageEntry } from "@/lib/types";
import { STYLE_DESCRIPTIONS } from "@/lib/config/styles";
import { exportCharactersAsZip, importDataFromFile } from "@/lib/exportImport";
import type { ExportProgress } from "@/lib/exportImport";
import { Spinner } from "@/components/ui/Spinner";
import { CHARACTER_PRESETS } from "@/lib/config/characterPresets";
import { CharacterDialog } from "@/components/characters/CharacterDialog";
import { CharacterList } from "@/components/characters/CharacterList";
import { ChevronLeft, Download, Link2, Plus, Settings, Trash2, Upload, Users } from "lucide-react";


const STYLE_NAMES: Record<ComicStyle, string> = Object.fromEntries(
  (Object.keys(STYLE_DESCRIPTIONS) as ComicStyle[]).map((key) => [
    key,
    STYLE_DESCRIPTIONS[key].split("，")[0].replace(/风格$/, ""),
  ])
) as Record<ComicStyle, string>;

const ALL_STYLES = Object.keys(STYLE_DESCRIPTIONS) as ComicStyle[];

/** Maximum number of image versions to keep per reference entry */
const MAX_VERSIONS = 5;

export default function CharactersPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStyle, setFilterStyle] = useState<ComicStyle | "">("");
  const [dialogChar, setDialogChar] = useState<Partial<Character> | null | "new">(null);
  const [saveSuccessCount, setSaveSuccessCount] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const [exportMode, setExportMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [repairing, setRepairing] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);

  useEffect(() => {
    loadCharacters();
  }, []);

  const loadCharacters = async () => {
    try {
      const data = await getAllCharacters();
      data.sort((a, b) => {
        const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        return (new Date(b.updatedAt).getTime() || 0) - (new Date(a.updatedAt).getTime() || 0);
      });
      setCharacters(data);
    } catch (e) {
      console.error("Failed to load characters:", e);
    }
  };

  const handleSave = async (
    data: Omit<Character, "id" | "createdAt" | "updatedAt"> & { id?: string },
  ): Promise<Character> => {
    const now = new Date().toISOString();
    const existing = data.id ? characters.find((c) => c.id === data.id) : null;
    const character: Character = {
      id: data.id || crypto.randomUUID(),
      name: data.name,
      description: data.description,
      appearance: data.appearance,
      style: data.style,
      avatarUrl: data.avatarUrl,
      referenceEntries: data.referenceEntries,
      tags: data.tags,
      variants: data.variants,
      visualScore: data.visualScore ?? existing?.visualScore,
      reviewStatus: data.reviewStatus ?? existing?.reviewStatus,
      lastReviewAt: data.lastReviewAt ?? existing?.lastReviewAt,
      sortOrder: existing?.sortOrder,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    try {
      await saveCharacter(character);
      setDialogChar(character);
      setSaveSuccessCount((c) => c + 1);
      await loadCharacters();
      return character;
    } catch (err) {
      console.error("Save character failed:", err);
      alert("保存失败，请重试");
      await loadCharacters();
      throw err;
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`确定删除角色「${name}」？此操作不可撤销。`)) {
      await deleteCharacter(id);
      await loadCharacters();
    }
  };

  const handleClearAll = async () => {
    if (confirmClear) {
      await clearAllCharacters();
      setCharacters([]);
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  };

  // --- Export selection ---

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const enterExportMode = () => {
    setExportMode(true);
    setSelectedIds(new Set());
  };

  const exitExportMode = () => {
    setExportMode(false);
    setSelectedIds(new Set());
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filtered.map((c) => c.id)));
  };

  const handleExportSelected = async () => {
    const selected = characters.filter((c) => selectedIds.has(c.id));
    if (selected.length === 0) return;
    try {
      await exportCharactersAsZip(selected, setExportProgress);
    } catch (err) {
      console.error("Export failed:", err);
      alert("导出失败，请查看控制台日志");
    } finally {
      setExportProgress(null);
    }
    exitExportMode();
  };

  const handleExportAll = async () => {
    if (characters.length === 0) return;
    try {
      await exportCharactersAsZip(characters, setExportProgress);
    } catch (err) {
      console.error("Export failed:", err);
      alert("导出失败，请查看控制台日志");
    } finally {
      setExportProgress(null);
    }
  };

  const handleRepairData = async () => {
    setRepairing(true);
    try {
      let fixedCount = 0;
      for (const char of characters) {
        let modified = false;
        const updatedEntries = char.referenceEntries.map((entry) => {
          const updated = { ...entry };

          if (!entry.style && char.style) {
            updated.style = char.style;
            modified = true;
          }

          if (entry.versions && entry.versions.length > MAX_VERSIONS) {
            updated.versions = entry.versions.slice(-MAX_VERSIONS);
            updated.activeVersionIndex = Math.min(
              entry.activeVersionIndex,
              updated.versions.length - 1,
            );
            modified = true;
          }

          return updated;
        });

        if (modified) {
          fixedCount++;
          await saveCharacter({
            ...char,
            referenceEntries: updatedEntries,
            updatedAt: new Date().toISOString(),
          });
        }
      }

      await loadCharacters();
      alert(fixedCount > 0
        ? `已修复 ${fixedCount} 个角色（补全风格标签 + 清理冗余版本）`
        : "所有角色数据正常，无需修复",
      );
    } catch (err) {
      console.error("Repair failed:", err);
      alert("修复失败，请查看控制台日志");
    } finally {
      setRepairing(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setExportProgress({ phase: "collecting", current: 0, total: 0 });
      const result = await importDataFromFile(file, setExportProgress);

      if (result.type !== "characters") {
        alert("该文件包含的是漫画任务数据，请在「历史记录」页面导入");
        return;
      }

      const arr = result.items as Record<string, unknown>[];
      let count = 0;
      for (const item of arr) {
        if (!item.name) continue;
        const now = new Date().toISOString();
        const character: Character = {
          id: (item.id as string) || crypto.randomUUID(),
          name: item.name as string,
          description: (item.description as string) || "",
          appearance: (item.appearance as Character["appearance"]) || { gender: "", age: "", hair: "", eyes: "", clothing: "" },
          style: (item.style as ComicStyle) || "anime",
          avatarUrl: (item.avatarUrl as string) || null,
          referenceEntries: (item.referenceEntries as ReferenceImageEntry[]) || [],
          tags: (item.tags as string[]) || [],
          variants: item.variants as Character["variants"],
          visualScore: item.visualScore as Character["visualScore"],
          reviewStatus: item.reviewStatus as Character["reviewStatus"],
          lastReviewAt: item.lastReviewAt as Character["lastReviewAt"],
          sortOrder: item.sortOrder as number | undefined,
          createdAt: (item.createdAt as string) || now,
          updatedAt: now,
        };
        await saveCharacter(character);
        count++;
      }

      if (count > 0) {
        await loadCharacters();
      }
      alert(`成功导入 ${count} 个角色` + (result.imageCount > 0 ? `（含 ${result.imageCount} 张图片）` : ""));
    } catch (err) {
      console.error("Import failed:", err);
      alert("导入失败：文件格式不正确");
    } finally {
      setExportProgress(null);
    }

    e.target.value = "";
  };

  const usedStyles = useMemo(() => {
    const counts = new Map<ComicStyle, number>();
    characters.forEach((c) => {
      const styles = new Set<ComicStyle>([c.style]);
      c.referenceEntries.forEach((e) => {
        styles.add(e.style || c.style);
      });
      styles.forEach((s) => counts.set(s, (counts.get(s) || 0) + 1));
    });
    return counts;
  }, [characters]);

  const filtered = characters.filter((c) => {
    if (filterStyle) {
      if (c.style === filterStyle) { /* pass */ }
      else if (c.referenceEntries.some((e) => (e.style || c.style) === filterStyle)) { /* pass */ }
      else return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  const canDrag = !exportMode && !searchQuery.trim() && !filterStyle;

  const handleReorder = useCallback((updated: Character[]) => {
    setCharacters(updated);
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {dialogChar !== null && (
        <CharacterDialog
          character={dialogChar === "new" ? {} : dialogChar}
          onSave={handleSave}
          onClose={() => { setDialogChar(null); setSaveSuccessCount(0); }}
          saveSuccessCount={saveSuccessCount}
        />
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-4 h-4" />
            返回
          </Link>
          <h1 className="text-2xl font-bold">角色库</h1>
          <span className="text-sm text-muted-foreground">{characters.length} 个角色</span>
        </div>

        {exportMode ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              已选 {selectedIds.size} / {filtered.length}
            </span>
            <button
              onClick={selectedIds.size === filtered.length ? () => setSelectedIds(new Set()) : selectAllFiltered}
              className="px-3 py-2 text-sm rounded-lg border hover:bg-accent transition-colors"
            >
              {selectedIds.size === filtered.length ? "取消全选" : "全选"}
            </button>
            <button
              onClick={handleExportSelected}
              disabled={selectedIds.size === 0}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              导出 {selectedIds.size} 个
            </button>
            <button
              onClick={exitExportMode}
              className="px-3 py-2 text-sm rounded-lg border hover:bg-accent transition-colors"
            >
              取消
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href="/characters/relations"
              className="px-3 py-2 text-sm rounded-lg border hover:bg-accent transition-colors flex items-center gap-1.5"
              title="角色关系图"
            >
              <Link2 className="w-4 h-4" />
              <span className="hidden sm:inline">关系图</span>
            </Link>
            <button
              onClick={() => setDialogChar("new")}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              创建角色
            </button>
            {characters.length > 0 && (
              <>
                <button
                  onClick={enterExportMode}
                  className="px-3 py-2 text-sm rounded-lg border hover:bg-accent transition-colors flex items-center gap-1.5"
                  title="选择并导出"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">导出</span>
                </button>
                <button
                  onClick={handleExportAll}
                  className="px-3 py-2 text-sm rounded-lg border hover:bg-accent transition-colors"
                  title="一键导出所有角色"
                >
                  <span className="hidden sm:inline">全部导出</span>
                  <span className="sm:hidden text-xs">全部</span>
                </button>
              </>
            )}
            <input ref={importFileRef} type="file" accept=".json,.zip" onChange={handleImport} className="hidden" />
            <button
              onClick={() => importFileRef.current?.click()}
              className="px-3 py-2 text-sm rounded-lg border hover:bg-accent transition-colors flex items-center gap-1.5"
              title="导入角色库"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">导入</span>
            </button>
            {characters.length > 0 && (
              <button
                onClick={handleRepairData}
                disabled={repairing}
                className="px-3 py-2 text-sm rounded-lg border hover:bg-accent transition-colors flex items-center gap-1.5 disabled:opacity-50"
                title="修复风格标签 + 清理冗余版本历史"
              >
                {repairing ? <Spinner size="sm" /> : (
                  <Settings className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">修复数据</span>
              </button>
            )}
            {characters.length > 0 && (
              <button
                onClick={handleClearAll}
                className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                  confirmClear
                    ? "bg-error text-white hover:bg-error/90"
                    : "border hover:bg-accent"
                }`}
              >
                {confirmClear ? "确认清空？" : "清空全部"}
              </button>
            )}
            <Link
              href="/trash"
              className="px-3 py-2 text-sm rounded-lg border hover:bg-accent transition-colors flex items-center gap-1.5"
              title="回收站"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">回收站</span>
            </Link>
          </div>
        )}
      </div>

      {characters.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索角色名、描述或标签..."
            className="flex-1 min-w-[200px] px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <select
            value={filterStyle}
            onChange={(e) => setFilterStyle(e.target.value as ComicStyle | "")}
            className="px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">全部风格 ({characters.length})</option>
            {ALL_STYLES.filter((s) => usedStyles.has(s)).map((s) => (
              <option key={s} value={s}>{STYLE_NAMES[s]} ({usedStyles.get(s)})</option>
            ))}
          </select>
        </div>
      )}

      {characters.length === 0 && (
        <div className="space-y-8">
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">角色库为空</p>
            <button
              onClick={() => setDialogChar("new")}
              className="inline-block px-6 py-2 rounded-lg bg-[#3d8b84] text-white font-medium hover:shadow-lg hover:shadow-[#3d8b84]/25 active:scale-[0.98] transition-all duration-200"
            >
              创建第一个角色
            </button>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground text-center">或从预设角色开始：</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {CHARACTER_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => setDialogChar({
                    name: preset.name,
                    description: preset.description,
                    appearance: preset.appearance,
                    style: preset.style,
                    tags: preset.tags,
                    avatarUrl: null,
                    referenceEntries: [],
                  })}
                  className="p-3 rounded-lg border text-center hover:bg-accent hover:border-primary/30 transition-all duration-200 hover:shadow-sm"
                >
                  <div className="text-2xl mb-1">
                    {preset.tags.includes("科普") ? "🔬" :
                     preset.tags.includes("古风") ? "⚔️" :
                     preset.tags.includes("诗词") ? "👘" :
                     preset.tags.includes("科幻") ? "🤖" :
                     preset.tags.includes("动物") ? "🐱" :
                     preset.tags.includes("小红书") ? "📱" : "👤"}
                  </div>
                  <div className="font-medium text-xs">{preset.name}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{preset.description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <CharacterList
        characters={characters}
        filtered={filtered}
        onEdit={(char) => setDialogChar(char)}
        onDelete={handleDelete}
        exportMode={exportMode}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        canDrag={canDrag}
        onReorder={handleReorder}
      />

      {characters.length > 0 && filtered.length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">没有匹配的角色</p>
        </div>
      )}

      {/* Export/Import progress overlay */}
      {exportProgress && exportProgress.phase !== "done" && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-card rounded-xl p-6 shadow-lg max-w-sm w-full mx-4 space-y-3">
            <div className="flex items-center gap-3">
              <Spinner size="sm" />
              <span className="text-sm font-medium">
                {exportProgress.phase === "collecting" && "正在收集图片引用..."}
                {exportProgress.phase === "fetching" && `正在处理图片 ${exportProgress.current}/${exportProgress.total}...`}
                {exportProgress.phase === "packing" && "正在打包 ZIP..."}
              </span>
            </div>
            {exportProgress.phase === "fetching" && exportProgress.total > 0 && (
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${Math.round((exportProgress.current / exportProgress.total) * 100)}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
