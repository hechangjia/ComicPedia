"use client";

import { useState, useEffect, useCallback } from "react";
import type { Character } from "@/lib/types";
import { getAllCharacters } from "@/lib/client/db";
import { X } from "lucide-react";


interface RefCharacterPickerProps {
  show: boolean;
  onClose: () => void;
  onImport: (char: Character) => void;
}

export function RefCharacterPicker({ show, onClose, onImport }: RefCharacterPickerProps) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const loadCharacters = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getAllCharacters();
      setCharacters(all);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (show) {
      loadCharacters();
    }
  }, [show, loadCharacters]);

  const filteredCharacters = characters.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  if (!show) return null;

  return (
    <div className="p-3 rounded-lg border bg-background space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          从角色库选择参考图
        </span>
        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-accent text-muted-foreground"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {characters.length > 4 && (
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索角色名、描述或标签..."
          className="w-full px-3 py-1.5 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
        />
      )}

      {loading ? (
        <div className="text-center py-4 text-sm text-muted-foreground">
          加载中...
        </div>
      ) : filteredCharacters.length === 0 ? (
        <div className="text-center py-4 space-y-2">
          <p className="text-sm text-muted-foreground">
            {searchQuery ? "未找到匹配角色" : "角色库为空"}
          </p>
          <a
            href="/characters"
            className="inline-block text-xs text-primary hover:underline"
          >
            前往角色库创建角色
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[200px] overflow-y-auto">
          {filteredCharacters.map((char) => {
            const hasRefImages = char.referenceEntries.length > 0 || char.avatarUrl;
            return (
              <button
                key={char.id}
                onClick={() => {
                  onImport(char);
                  onClose();
                }}
                disabled={!hasRefImages}
                className="p-2 rounded-lg border text-left transition-all hover:border-primary/50 hover:bg-accent/50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2">
                  {char.avatarUrl ? (
                    <img
                      src={char.avatarUrl}
                      alt={char.name}
                      className="w-9 h-9 rounded-lg object-cover shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-base shrink-0">
                      {char.name[0]}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-xs truncate">{char.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {char.referenceEntries.length > 0
                        ? `${char.referenceEntries.length} 张参考图`
                        : char.avatarUrl
                          ? "1 张头像"
                          : "无图片"}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {characters.length > 0 && (
        <div className="text-center">
          <a
            href="/characters"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            管理角色库 →
          </a>
        </div>
      )}
    </div>
  );
}
