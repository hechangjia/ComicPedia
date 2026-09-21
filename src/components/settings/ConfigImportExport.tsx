"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import type { UserAPIConfigV2, UserImageConfig, UserLLMConfig } from "@/lib/types";
import { exportConfigArchive, MAX_CONFIG_ARCHIVE_BYTES, mergeConfigArchive, parseConfigArchive, type MergeOptions, type MergeResult, type ParsedConfigArchive } from "@/lib/config/configTransfer";
import { createEmptyUserConfig } from "@/lib/config/userConfig";
import { ConfigTransferPreview } from "./ConfigTransferPreview";

type Message = { type: "success" | "error"; text: string };
function triggerDownload(data: unknown, filename: string) {
  const text = JSON.stringify(data, null, 2);
  if (new TextEncoder().encode(text).byteLength > MAX_CONFIG_ARCHIVE_BYTES) throw new Error("配置文件超过 2 MB，请减少工作流或分开导出");
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  // Let the browser begin the download before releasing the backing blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const buttonClass = "min-h-[44px] px-3 py-2 text-sm rounded-lg border hover:bg-accent transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-40";
export function ConfigImportExport({ config, onImport, onMessage }: {
  config: UserAPIConfigV2; onImport: (config: UserAPIConfigV2, options?: MergeOptions) => MergeResult; onMessage: (message: Message) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const readSequence = useRef(0);
  const titleId = useId();
  const [mode, setMode] = useState<"import" | "export" | null>(null);
  const [parsed, setParsed] = useState<ParsedConfigArchive | null>(null);
  const [includeCredentials, setIncludeCredentials] = useState(false);
  const [includeWorkflows, setIncludeWorkflows] = useState(false);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  useEffect(() => {
    if (mode && dialog.current && !dialog.current.open) {
      dialog.current.showModal();
      dialog.current.querySelector<HTMLButtonElement>("[data-initial-focus]")?.focus();
    }
    if (!mode && dialog.current?.open) dialog.current.close();
  }, [mode]);
  const close = () => { setMode(null); setParsed(null); setError(""); setIncludeCredentials(false); setIncludeWorkflows(false); };
  let plan: MergeResult | undefined, planError = "";
  if (parsed) {
    try { let id = 0; plan = mergeConfigArchive(config, parsed.config, { createId: () => `preview-${++id}`, includeCredentials, includeWorkflows }); }
    catch (e) { planError = e instanceof Error ? e.message : "无法合并配置"; }
  }
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    const sequence = ++readSequence.current;
    setReading(true); setError(""); setIncludeCredentials(false); setIncludeWorkflows(false);
    try {
      if (file.size > MAX_CONFIG_ARCHIVE_BYTES) throw new Error("配置文件超过 2 MB 限制");
      const next = parseConfigArchive(await file.text());
      if (sequence !== readSequence.current) return;
      setParsed(next); setMode("import");
    } catch (e) {
      if (sequence === readSequence.current) onMessage({ type: "error", text: e instanceof Error ? e.message : "无法读取配置文件" });
    } finally { if (sequence === readSequence.current) setReading(false); }
  };
  const confirm = () => {
    try {
      if (mode === "import" && parsed) {
        const result = onImport(parsed.config, { includeCredentials, includeWorkflows });
        const added = Object.values(result.added).reduce((a, b) => a + b, 0);
        const skipped = Object.values(result.skipped).reduce((a, b) => a + b, 0);
        onMessage({ type: "success", text: `已向本地草稿合并 ${added} 个配置，跳过 ${skipped} 个重复项；服务器保存状态见上方。` });
      } else if (mode === "export") {
        triggerDownload(exportConfigArchive(config, { includeWorkflows }), `comicpedia-config-${new Date().toISOString().slice(0, 10)}.json`);
        onMessage({ type: "success", text: includeWorkflows ? "已导出全部配置；API 密钥字段已排除，工作流内容请自行保密。" : "已导出全部配置（不含 API 密钥和自定义工作流）。" });
      }
      close();
    } catch (e) { setError(e instanceof Error ? e.message : "配置传输失败，未应用更改"); }
  };
  const workflowCount = config.imageConfigs.filter(i => i.comfyuiWorkflow).length;
  return <div className="flex shrink-0 items-center gap-2">
    <button type="button" disabled={reading} onClick={() => { close(); setMode("export"); }} className={buttonClass}><Download className="h-4 w-4" aria-hidden="true" />导出</button>
    <input ref={fileRef} type="file" accept=".json,application/json" aria-label="选择配置文件" onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; void readFile(file); }} className="hidden" />
    <button type="button" disabled={reading} onClick={() => fileRef.current?.click()} className={buttonClass}><Upload className="h-4 w-4" aria-hidden="true" />{reading ? "读取中…" : "导入"}</button>
    <dialog ref={dialog} aria-labelledby={titleId} onCancel={close} onClose={close} className="m-auto w-[calc(100%_-_2rem)] max-w-lg max-h-[85dvh] overflow-y-auto rounded-xl border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/50">
      <div className="space-y-5 p-5 sm:p-6">
        <h2 id={titleId} className="text-lg font-semibold">{mode === "import" ? "预览配置导入" : "导出模型配置"}</h2>
        {mode === "import" && parsed && plan && <ConfigTransferPreview parsed={parsed} plan={plan} includeCredentials={includeCredentials} onCredentialsChange={setIncludeCredentials} includeWorkflows={includeWorkflows} onWorkflowsChange={setIncludeWorkflows} />}
        {mode === "export" && <div className="space-y-4 text-sm">
          <p>包含文字脚本 {config.llmConfigs.length} 项、视觉复审 {config.vlmConfigs?.length ?? 0} 项、文生图 {config.imageConfigs.length} 项、检索服务 {config.accuracyConfig.providers.length} 项，以及角色选择和域名白名单。</p>
          <p className="rounded-lg border bg-primary/5 p-3">默认排除 API 密钥、密钥掩码及历史测试结果。此文件是可迁移配置，不是可直接恢复凭据的完整备份。</p>
          {workflowCount > 0 && <label className="flex items-start gap-3 rounded-lg border p-3"><input type="checkbox" checked={includeWorkflows} onChange={e => setIncludeWorkflows(e.target.checked)} className="mt-1 h-4 w-4 shrink-0" /><span>包含 {workflowCount} 个自定义工作流<span className="mt-1 block text-muted-foreground">工作流可能包含内嵌令牌或私人内容，无法保证自动脱敏。勾选前请检查。</span></span></label>}
        </div>}
        {(error || planError) && <p role="alert" className="text-sm text-error">{error || planError}</p>}
        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          <button type="button" data-initial-focus onClick={close} className={buttonClass}>取消</button>
          <button type="button" onClick={confirm} disabled={!!planError || (mode === "import" && !plan)} className={`${buttonClass} bg-primary text-primary-foreground hover:opacity-90`}>{mode === "import" ? "确认合并到草稿" : "下载配置 JSON"}</button>
        </div>
      </div>
    </dialog>
  </div>;
}

function singleExport(c: UserLLMConfig | UserImageConfig, role: "llm" | "vlm" | "image", onMessage: (message: Message) => void) {
  try {
    const config = createEmptyUserConfig();
    if (role === "image") { config.imageConfigs = [c as UserImageConfig]; config.activeImageId = c.id; }
    else if (role === "vlm") { config.vlmConfigs = [c as UserLLMConfig]; config.activeVLMId = c.id; }
    else { config.llmConfigs = [c as UserLLMConfig]; config.activeLLMId = c.id; }
    triggerDownload(exportConfigArchive(config), `comicpedia-${role}-${new Date().toISOString().slice(0, 10)}.json`);
    onMessage({ type: "success", text: "已导出配置（不含 API 密钥和自定义工作流）。" });
  } catch (e) { onMessage({ type: "error", text: e instanceof Error ? e.message : "导出失败" }); }
}
export const exportSingleLLM = (c: UserLLMConfig, onMessage: (message: Message) => void) => singleExport(c, "llm", onMessage);
export const exportSingleVLM = (c: UserLLMConfig, onMessage: (message: Message) => void) => singleExport(c, "vlm", onMessage);
export const exportSingleImage = (c: UserImageConfig, onMessage: (message: Message) => void) => singleExport(c, "image", onMessage);
