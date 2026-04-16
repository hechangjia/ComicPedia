"use client";

import { useState, useRef } from "react";
import { UserAPIConfigV2, UserLLMConfig, UserImageConfig } from "@/lib/types";
import { Download, Upload } from "lucide-react";

interface ConfigExportData {
  app: "comicpedia";
  type: "config";
  exportedAt: string;
  llmConfigs?: UserLLMConfig[];
  imageConfigs?: UserImageConfig[];
  activeLLMId?: string | null;
  activeImageId?: string | null;
}

function triggerDownload(data: string, filename: string): void {
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function isSameLLM(a: UserLLMConfig, b: UserLLMConfig): boolean {
  return a.name === b.name && a.apiUrl === b.apiUrl && a.model === b.model;
}
function isSameImage(a: UserImageConfig, b: UserImageConfig): boolean {
  return a.name === b.name && a.apiUrl === b.apiUrl && a.model === b.model;
}

interface ConfigImportExportProps {
  config: UserAPIConfigV2;
  addLLM: (data: Omit<UserLLMConfig, "id">) => void;
  addImage: (data: Omit<UserImageConfig, "id">) => void;
  onMessage: (msg: { type: "success" | "error"; text: string }) => void;
}

export function ConfigImportExport({ config, addLLM, addImage, onMessage }: ConfigImportExportProps) {
  const importFileRef = useRef<HTMLInputElement>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const exportConfigs = (mode: "all" | "llm" | "image") => {
    const data: ConfigExportData = {
      app: "comicpedia",
      type: "config",
      exportedAt: new Date().toISOString(),
    };
    if (mode === "all" || mode === "llm") {
      data.llmConfigs = config.llmConfigs;
      data.activeLLMId = config.activeLLMId;
    }
    if (mode === "all" || mode === "image") {
      data.imageConfigs = config.imageConfigs;
      data.activeImageId = config.activeImageId;
    }
    const suffix = mode === "llm" ? "-llm" : mode === "image" ? "-image" : "";
    const filename = `comicpedia-config${suffix}-${new Date().toISOString().slice(0, 10)}.json`;
    triggerDownload(JSON.stringify(data, null, 2), filename);
    setShowExportMenu(false);
    const count = (data.llmConfigs?.length || 0) + (data.imageConfigs?.length || 0);
    onMessage({ type: "success", text: `已导出 ${count} 个配置` });
  };

  const handleImportConfigs = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text) as Partial<ConfigExportData> & Partial<UserAPIConfigV2>;
      const llmList = imported.llmConfigs || [];
      const imgList = imported.imageConfigs || [];
      if (llmList.length === 0 && imgList.length === 0) {
        onMessage({ type: "error", text: "文件中没有找到有效的配置数据" });
        return;
      }
      let addedLLM = 0;
      let addedImg = 0;
      for (const llm of llmList) {
        if (!llm.apiUrl || !llm.model) continue;
        const isDuplicate = config.llmConfigs.some((existing) => isSameLLM(existing, llm));
        if (!isDuplicate) {
          const { id: _llmId, ...llmRest } = llm;
          addLLM(llmRest);
          addedLLM++;
        }
      }
      for (const img of imgList) {
        if (!img.apiUrl) continue;
        const isDuplicate = config.imageConfigs.some((existing) => isSameImage(existing, img));
        if (!isDuplicate) {
          const { id: _imgId, ...imgRest } = img;
          addImage(imgRest);
          addedImg++;
        }
      }
      const total = addedLLM + addedImg;
      const skipped = (llmList.length + imgList.length) - total;
      let msg = `已导入 ${total} 个配置`;
      if (addedLLM > 0) msg += `（LLM: ${addedLLM}`;
      if (addedImg > 0) msg += `${addedLLM > 0 ? ", " : "（"}文生图: ${addedImg}`;
      if (addedLLM > 0 || addedImg > 0) msg += "）";
      if (skipped > 0) msg += `，跳过 ${skipped} 个重复配置`;
      onMessage({ type: "success", text: msg });
    } catch (err) {
      console.error("Import config failed:", err);
      onMessage({ type: "error", text: "导入失败：文件格式不正确" });
    }
    e.target.value = "";
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <button
          onClick={() => setShowExportMenu(!showExportMenu)}
          disabled={config.llmConfigs.length === 0 && config.imageConfigs.length === 0}
          className="px-3 py-1.5 text-sm rounded-lg border hover:bg-accent transition-colors flex items-center gap-1.5 disabled:opacity-40"
        >
          <Download className="w-4 h-4" />
          导出
        </button>
        {showExportMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
            <div className="absolute right-0 mt-1 w-40 py-1 rounded-lg border bg-card shadow-lg z-50">
              <button onClick={() => exportConfigs("all")} className="w-full px-4 py-2 text-sm text-left hover:bg-accent transition-colors">全部导出</button>
              {config.llmConfigs.length > 0 && (
                <button onClick={() => exportConfigs("llm")} className="w-full px-4 py-2 text-sm text-left hover:bg-accent transition-colors">仅 LLM ({config.llmConfigs.length})</button>
              )}
              {config.imageConfigs.length > 0 && (
                <button onClick={() => exportConfigs("image")} className="w-full px-4 py-2 text-sm text-left hover:bg-accent transition-colors">仅文生图 ({config.imageConfigs.length})</button>
              )}
            </div>
          </>
        )}
      </div>
      <input ref={importFileRef} type="file" accept=".json" onChange={handleImportConfigs} className="hidden" />
      <button
        onClick={() => importFileRef.current?.click()}
        className="px-3 py-1.5 text-sm rounded-lg border hover:bg-accent transition-colors flex items-center gap-1.5"
      >
        <Upload className="w-4 h-4" />
        导入
      </button>
    </div>
  );
}

/** 导出单个 LLM 配置 */
export function exportSingleLLM(c: UserLLMConfig, onMessage: (msg: { type: "success" | "error"; text: string }) => void) {
  const data: ConfigExportData = { app: "comicpedia", type: "config", exportedAt: new Date().toISOString(), llmConfigs: [c] };
  triggerDownload(JSON.stringify(data, null, 2), `comicpedia-llm-${c.name}.json`);
  onMessage({ type: "success", text: `已导出 LLM 配置「${c.name}」` });
}

/** 导出单个文生图配置 */
export function exportSingleImage(c: UserImageConfig, onMessage: (msg: { type: "success" | "error"; text: string }) => void) {
  const data: ConfigExportData = { app: "comicpedia", type: "config", exportedAt: new Date().toISOString(), imageConfigs: [c] };
  triggerDownload(JSON.stringify(data, null, 2), `comicpedia-image-${c.name}.json`);
  onMessage({ type: "success", text: `已导出文生图配置「${c.name}」` });
}
