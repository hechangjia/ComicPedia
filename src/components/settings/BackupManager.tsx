"use client";
import { readArchiveDownload } from "@/lib/backupClient";
import { useId, useRef, useState } from "react";

const tables = ["tasks", "characters", "series", "character_relations"] as const;
const labels = {tasks:"漫画作品",characters:"角色",series:"连载",character_relations:"角色关系"};
export interface ArtworkPreview {
  revision: string;
  counts: Record<typeof tables[number], number>;
  conflicts: Record<typeof tables[number], string[]>;
  assets: number; assetBytes: number; exportedAt: string;
}
const button = "min-h-[44px] rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed";
const primary = `${button} bg-foreground text-background hover:bg-foreground/90`;
const countConflicts = (preview: ArtworkPreview) => tables.reduce((sum, table) => sum + preview.conflicts[table].length, 0);

export function BackupPreview({preview,replace,busy,onReplace,onRestore,onCancel}: {preview:ArtworkPreview;replace:boolean;busy:boolean;onReplace:(value:boolean)=>void;onRestore:()=>void;onCancel:()=>void}) {
  const conflicts = countConflicts(preview);
  return <section aria-label="归档恢复预览" className="mt-5 space-y-4 border-t border-border pt-5">
    <div><h4 className="font-semibold">恢复预览 · 尚未写入</h4><p className="mt-1 text-sm text-secondary-text">导出时间：{new Date(preview.exportedAt).toLocaleString("zh-CN")}。恢复只添加或替换归档内记录，不删除其他作品。</p></div>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">{tables.map(table=><div key={table}><dt className="text-secondary-text">{labels[table]}</dt><dd className="mt-1 font-semibold tabular-nums">{preview.counts[table]}</dd></div>)}</dl>
    <p className="text-sm">图片 {preview.assets} 张 · {(preview.assetBytes / 1024 / 1024).toFixed(2)} MiB · 文件内容及 SHA-256 校验已通过</p>
    {conflicts > 0 ? <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
      <p className="font-medium">发现 {conflicts} 条同 ID 数据</p>
      <details><summary className="min-h-[44px] cursor-pointer py-3">查看冲突 ID</summary><ul className="max-h-48 space-y-1 overflow-auto break-all">{tables.flatMap(table=>preview.conflicts[table].map(id=><li key={`${table}:${id}`}>{labels[table]} ({table})：{id}</li>))}</ul></details>
      <label className="flex min-h-[44px] cursor-pointer items-start gap-3 py-2"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={replace} disabled={busy} onChange={event=>onReplace(event.target.checked)} /><span>我确认替换这些同 ID 记录<span className="mt-1 block text-secondary-text">请先导出现有作品。旧图片不会被覆盖；被替换记录的旧内容不再是当前版本。</span></span></label>
    </div> : <p className="text-sm text-secondary-text">没有同 ID 冲突，将添加归档中的作品。</p>}
    <p className="text-sm text-secondary-text">暂停中的任务会恢复为待操作状态，不会自动调用模型。若预览后数据改变，需要重新预览。</p>
    <div className="flex flex-wrap gap-3"><button type="button" className={primary} disabled={busy || conflicts > 0 && !replace} onClick={onRestore}>{busy ? "正在恢复…" : "确认恢复作品"}</button><button type="button" className={button} disabled={busy} onClick={onCancel}>取消预览</button></div>
  </section>;
}

export function BackupManager({className}: {className?:string}) {
  const id = useId(), fileInput = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const [busy,setBusy] = useState<"export"|"preview"|"restore"|null>(null);
  const [token,setToken] = useState("");
  const [file,setFile] = useState<File|null>(null);
  const [preview,setPreview] = useState<ArtworkPreview|null>(null);
  const [replace,setReplace] = useState(false);
  const [message,setMessage] = useState<{error:boolean;text:string}|null>(null);
  const headers = (): Record<string,string> => token ? {Authorization:`Bearer ${token}`} : {};
  const check = async (response:Response) => {
    if (!response.ok) { const value = await response.json().catch(()=>null); throw new Error(value?.error || `归档请求失败（${response.status}）`); }
    return response;
  };
  const start = (state:NonNullable<typeof busy>) => { if (busyRef.current) return false; busyRef.current=true;setBusy(state);setMessage(null);return true; };
  const finish = () => { busyRef.current=false;setBusy(null); };
  const showError = (error:unknown) => setMessage({error:true,text:error instanceof Error ? error.message : "归档操作失败，请重试"});
  const exportArchive = async () => {
    if(!start("export")) return;
    try {
      const response=await check(await fetch("/api/backup/archive",{headers:headers(),cache:"no-store"}));
      const url=URL.createObjectURL(await readArchiveDownload(response)), anchor=document.createElement("a");
      anchor.href=url;anchor.download=`comicpedia-artwork-${new Date().toISOString().slice(0,10)}.zip`;
      document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      setMessage({error:false,text:"ZIP 作品归档已生成并开始下载。请妥善保存，建议在空白测试实例验证恢复后再用于迁移。"});
    } catch(error){showError(error);} finally{finish();}
  };
  const inspect = async (selected:File|null) => {
    if(!selected || !start("preview")) return;
    setPreview(null);setFile(null);setReplace(false);
    try {
      if(!selected.name.toLowerCase().endsWith(".zip")) throw new Error("请选择 ZIP 作品归档，旧版 JSON 不可直接恢复。");
      if(selected.size > 100*1024*1024) throw new Error("归档超过 100 MiB 限制，请保留原文件，不要手动删减归档内容。");
      const response=await check(await fetch("/api/backup/archive?action=preview",{method:"POST",headers:{...headers(),"Content-Type":"application/zip","X-ComicPedia-Archive":"2"},body:selected}));
      setPreview(await response.json());setFile(selected);
    } catch(error){showError(error);} finally{finish();}
  };
  const restore = async () => {
    if(!file || !preview || countConflicts(preview)>0 && !replace || !start("restore")) return;
    try {
      const response=await check(await fetch("/api/backup/archive?action=restore",{method:"POST",headers:{...headers(),"Content-Type":"application/zip","X-ComicPedia-Archive":"2","X-Archive-Revision":preview.revision,"X-Archive-Replace":String(replace)},body:file}));
      const result=await response.json();setPreview(null);setFile(null);setReplace(false);
      setMessage({error:false,text:`恢复完成：${result.counts.tasks} 部作品、${result.counts.characters} 个角色、${result.counts.series} 个连载、${result.counts.character_relations} 条关系，${result.images} 张图片。返回作品库或刷新页面查看。`});
    } catch(error){setPreview(null);setFile(null);setReplace(false);showError(error);} finally{finish();}
  };
  return <section className={className} aria-labelledby={`${id}-title`} aria-busy={!!busy}>
    <h3 id={`${id}-title`} className="text-lg font-semibold">作品归档与恢复</h3>
    <p className="mt-2 max-w-prose text-sm leading-relaxed text-secondary-text">将漫画、角色、连载、角色关系及引用图片（含历史版本）保存到一个 ZIP。先校验和预览，再由你确认恢复。</p>
    <p className="mt-2 max-w-prose text-sm leading-relaxed text-secondary-text">不包含模型配置、API 密钥、后台队列、回收站或临时导出文件。这是作品归档，不是整个服务的镜像；私人文本和图片仍需妥善保管。</p>
    <div className="my-4 flex flex-wrap gap-3"><button type="button" className={primary} disabled={!!busy} onClick={()=>void exportArchive()}>{busy==="export" ? "正在打包图片…" : "导出 ZIP 作品归档"}</button><button type="button" className={button} disabled={!!busy} onClick={()=>fileInput.current?.click()}>{busy==="preview" ? "正在校验归档…" : "选择 ZIP 并预览"}</button><input ref={fileInput} type="file" className="hidden" aria-label="选择 ZIP 作品归档" accept=".zip,application/zip" disabled={!!busy} onChange={event=>{const selected=event.target.files?.[0]??null;event.target.value="";void inspect(selected);}} /></div>
    <p className="text-xs leading-relaxed text-secondary-text">归档上限 100 MiB，单图上限 20 MiB。生成或评审运行时不可备份或恢复；外部图片需先保存到本地。</p>
    <details className="mt-3 text-sm"><summary className="min-h-[44px] cursor-pointer py-3">服务器访问凭据（可选）</summary><label htmlFor={`${id}-token`} className="block text-secondary-text">管理员令牌 · 仅在服务器配置 ADMIN_TOKEN 时填写</label><input id={`${id}-token`} type="password" autoComplete="off" spellCheck={false} value={token} disabled={!!busy} onChange={event=>setToken(event.target.value)} className="mt-2 min-h-[44px] w-full max-w-md rounded-lg border border-border bg-background px-3" /><p className="mt-2 text-xs text-secondary-text">仅保留在当前组件内存，不写入浏览器存储或归档；不是模型 API 密钥。</p></details>
    {message && <p role={message.error ? "alert" : "status"} className={`mt-4 rounded-lg border p-3 text-sm break-words ${message.error ? "border-error/40 bg-error/5" : "border-success/40 bg-success/5"}`}>{message.text}</p>}
    {preview && <BackupPreview preview={preview} replace={replace} busy={!!busy} onReplace={setReplace} onRestore={()=>void restore()} onCancel={()=>{setPreview(null);setFile(null);setReplace(false);}} />}
    <p className="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-secondary-text">旧版 JSON 只含部分记录或图片引用，不能当作完整可恢复备份。直接 JSON 导入已停用；请保留旧文件，并在原实例导出 ZIP。模型配置请使用页面顶部的独立配置导出功能。</p>
  </section>;
}
