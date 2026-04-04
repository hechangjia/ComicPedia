"use client";

import { useState, useRef } from "react";
import type { ContentType } from "@/lib/types";
import { X, ChevronDown } from "lucide-react";

import {
  ComicTemplate,
  getTemplatesByType,
  deleteCustomTemplate,
  exportTemplatePack,
  importTemplatePack,
  getCustomTemplates,
} from "@/lib/config/templates";

interface TemplatePanelProps {
  contentType: ContentType;
  onSelect: (template: ComicTemplate) => void;
}

export function TemplatePanel({ contentType, onSelect }: TemplatePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [templates, setTemplates] = useState(() => getTemplatesByType(contentType));
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Refresh templates when contentType or expanded changes
  const refreshTemplates = () => setTemplates(getTemplatesByType(contentType));

  const handleDelete = (id: string) => {
    deleteCustomTemplate(id);
    refreshTemplates();
  };

  const handleExport = () => {
    const custom = getCustomTemplates();
    if (custom.length === 0) return;
    const json = exportTemplatePack(custom);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comicpedia-templates-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError("");

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = importTemplatePack(reader.result as string);
        refreshTemplates();
        setImportError(`已导入 ${imported.length} 个模板`);
        setTimeout(() => setImportError(""), 3000);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : "导入失败");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  if (templates.length === 0 && !expanded) return null;

  const customCount = templates.filter((t) => !t.isBuiltIn).length;

  return (
    <div className="space-y-2">
      <button
        onClick={() => {
          setExpanded(!expanded);
          if (!expanded) refreshTemplates();
        }}
        aria-expanded={expanded}
        aria-controls="template-grid"
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full justify-center"
      >
        <ChevronDown
          className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
        从模板开始
        <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">{templates.length}</span>
      </button>

      {expanded && (
        <>
          <div id="template-grid" role="list" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {templates.map((tpl) => (
              <div key={tpl.id} className="relative group">
                <button
                  role="listitem"
                  onClick={() => {
                    onSelect(tpl);
                    setExpanded(false);
                  }}
                  className="w-full p-3 text-left rounded-lg border hover:bg-accent hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-sm">{tpl.name}</span>
                    {!tpl.isBuiltIn && (
                      <span className="text-[10px] px-1 py-0.5 rounded bg-info/10 text-info">
                        自定义
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                    {tpl.description}
                  </div>
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {tpl.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                    {tpl.panelCount && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        {tpl.panelCount} 格
                      </span>
                    )}
                  </div>
                </button>
                {!tpl.isBuiltIn && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(tpl.id);
                    }}
                    className="absolute top-2 right-2 w-5 h-5 rounded-full bg-error/50 text-white items-center justify-center text-xs hidden group-hover:flex"
                    title="删除模板"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* 导入/导出 */}
          <div className="flex items-center justify-center gap-2 pt-1">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground border rounded-lg hover:bg-accent transition-colors"
            >
              导入模板
            </button>
            {customCount > 0 && (
              <button
                onClick={handleExport}
                className="px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground border rounded-lg hover:bg-accent transition-colors"
              >
                导出自定义 ({customCount})
              </button>
            )}
          </div>

          {importError && (
            <p className={`text-xs text-center ${importError.startsWith("已导入") ? "text-success" : "text-error"}`}>
              {importError}
            </p>
          )}
        </>
      )}
    </div>
  );
}
