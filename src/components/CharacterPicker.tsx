"use client";

import { useState, useEffect, useCallback } from "react";
import type { Character, ReferenceImageEntry, ComicStyle } from "@/lib/types";
import { getAllCharacters } from "@/lib/client/db";
import { ChevronDown, Users, X } from "lucide-react";


interface CharacterPickerProps {
  /** 当前已选中的角色 ID 列表 */
  selectedIds: string[];
  /** 选中变化回调 */
  onSelectionChange: (ids: string[], characters: Character[]) => void;
  /** 当前风格（用于推荐排序） */
  currentStyle?: ComicStyle;
  /** 是否禁用 */
  disabled?: boolean;
}

/** 角色选择器组件 —— 嵌入各表单中，支持从角色库选择角色 */
export function CharacterPicker({
  selectedIds,
  onSelectionChange,
  currentStyle,
  disabled,
}: CharacterPickerProps) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // 加载角色列表
  const loadCharacters = useCallback(async () => {
    setIsLoading(true);
    try {
      const all = await getAllCharacters();
      setCharacters(all);
    } catch {
      // 静默处理
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 展开时加载
  useEffect(() => {
    if (isExpanded) {
      loadCharacters();
    }
  }, [isExpanded, loadCharacters]);

  // 筛选 + 排序：当前风格优先
  const filteredCharacters = characters
    .filter((c) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      // 当前风格的角色排在前面
      if (currentStyle) {
        const aMatch = a.style === currentStyle ? -1 : 0;
        const bMatch = b.style === currentStyle ? -1 : 0;
        if (aMatch !== bMatch) return aMatch - bMatch;
      }
      return 0; // 保持按更新时间倒序（getAllCharacters 已排好）
    });

  const selectedCharacters = characters.filter((c) => selectedIds.includes(c.id));

  /** 切换角色选中状态 */
  const toggleCharacter = (char: Character) => {
    const isSelected = selectedIds.includes(char.id);
    let newIds: string[];
    let newChars: Character[];

    if (isSelected) {
      newIds = selectedIds.filter((id) => id !== char.id);
      newChars = selectedCharacters.filter((c) => c.id !== char.id);
    } else {
      newIds = [...selectedIds, char.id];
      newChars = [...selectedCharacters, char];
    }

    onSelectionChange(newIds, newChars);
  };

  /** 清除所有选中 */
  const clearSelection = () => {
    onSelectionChange([], []);
  };

  if (characters.length === 0 && !isExpanded && !isLoading) {
    // 首次渲染前先探测是否有角色
    return (
      <div className="p-4 rounded-xl border bg-muted/30 space-y-2">
        <button
          onClick={() => setIsExpanded(true)}
          disabled={disabled}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <Users className="w-4 h-4" />
          从角色库选择（可选）
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl border bg-muted/30 space-y-3">
      {/* 标题行 */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          disabled={disabled}
          className="flex items-center gap-2 text-sm font-medium hover:text-foreground transition-colors disabled:opacity-50"
        >
          <Users className="w-4 h-4 text-muted-foreground" />
          角色库
          {selectedIds.length > 0 && (
            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
              {selectedIds.length} 已选
            </span>
          )}
          <ChevronDown
            className={`w-3 h-3 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
          />
        </button>
        {selectedIds.length > 0 && (
          <button
            onClick={clearSelection}
            disabled={disabled}
            className="text-xs text-red-500 hover:text-red-600 transition-colors"
          >
            清除选择
          </button>
        )}
      </div>

      {/* 已选角色预览（始终显示） */}
      {selectedCharacters.length > 0 && !isExpanded && (
        <div className="flex gap-2 flex-wrap">
          {selectedCharacters.map((char) => (
            <div
              key={char.id}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-primary/10 text-sm"
            >
              {char.avatarUrl ? (
                <img
                  src={char.avatarUrl}
                  alt={char.name}
                  className="w-5 h-5 rounded-full object-cover"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px]">
                  {char.name[0]}
                </div>
              )}
              <span className="text-xs">{char.name}</span>
              <button
                onClick={() => toggleCharacter(char)}
                disabled={disabled}
                className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-500 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 展开的角色列表 */}
      {isExpanded && (
        <div className="space-y-2">
          {/* 搜索框 */}
          {characters.length > 4 && (
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索角色名、描述或标签..."
              className="w-full px-3 py-1.5 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
          )}

          {isLoading ? (
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[240px] overflow-y-auto">
              {filteredCharacters.map((char) => {
                const isSelected = selectedIds.includes(char.id);
                const styleMatch = currentStyle && char.style === currentStyle;

                return (
                  <button
                    key={char.id}
                    onClick={() => toggleCharacter(char)}
                    disabled={disabled}
                    className={`p-2 rounded-lg border text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 ring-2 ring-primary"
                        : "hover:border-primary/50 hover:bg-accent/50"
                    } disabled:opacity-50`}
                  >
                    <div className="flex items-center gap-2">
                      {/* 头像 */}
                      {char.avatarUrl ? (
                        <img
                          src={char.avatarUrl}
                          alt={char.name}
                          className="w-10 h-10 rounded-lg object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-lg shrink-0">
                          {char.name[0]}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-xs truncate">{char.name}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {char.description || char.appearance.clothing}
                        </div>
                      </div>
                    </div>
                    {/* 标签 */}
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {styleMatch && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                          风格匹配
                        </span>
                      )}
                      {char.tags.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* 管理链接 */}
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
      )}
    </div>
  );
}

/** 从角色列表中提取 ReferenceImageEntry 数组（用于注入 ReferenceImagePanel） */
export function extractReferenceEntries(characters: Character[]): ReferenceImageEntry[] {
  return characters.flatMap((char) =>
    char.referenceEntries.map((entry) => ({
      ...entry,
      label: entry.label || char.name,
    }))
  );
}
