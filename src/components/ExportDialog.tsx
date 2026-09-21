"use client";
import {useEffect,useId,useRef,useState} from 'react';
import type {ComicPanel,ComicScript} from '@/lib/types';
import {buildExportPlan,defaultExportOptions,type ExportOptions,type PublicationFormat} from '@/lib/export/options';
import {canvasToBlob,loadImage,getWatermarkText} from '@/lib/export/shared';
const LABELS={png:'PNG 合成图',pdf:'PDF 文档',zip:'ZIP 图片包',markdown:'Markdown 图片包','xhs-single':'小红书长图','xhs-pages':'小红书分页','seedance-json':'视频脚本 JSON','seedance-text':'视频脚本 TXT','seedance-zip':'视频脚本与参考图'};
export function ExportDialog({panels,title,format,script,onClose}:{panels:ComicPanel[];title:string;format:PublicationFormat;script?:ComicScript;onClose:()=>void}) {
  const [options,setOptions]=useState(()=>({...defaultExportOptions(format),attribution:getWatermarkText()}));
  const isVideo=format.startsWith('seedance-');
  const textOnly=format==='seedance-json'||format==='seedance-text';
  const isXhs=format.startsWith('xhs-');
  const canPreview=format==='png'||format==='pdf'||isXhs;
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [preview,setPreview]=useState<string>();
  const running=useRef(false);const dialog=useRef<HTMLDialogElement>(null);const heading=useId();
  useEffect(()=>{dialog.current?.showModal();},[]);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
  function change(patch:Partial<ExportOptions>){setOptions(previous=>({...previous,...patch}));setPreview(undefined);setMessage('');}
  let issue='';let count=0;let omitted:number[]=[];
  try{const plan=buildExportPlan(panels,options);count=plan.entries.length;omitted=plan.omittedNumbers;}catch(error){issue=error instanceof Error?error.message:'导出设置无效';}
  async function execute(previewOnly=false){
    if(running.current)return;running.current=true;setBusy(true);setMessage(previewOnly?'正在生成实际排版预览…':'正在生成文件，请保持此页打开…');
    try{
      const plan=buildExportPlan(panels,options);
      if(isVideo&&!script)throw new Error('缺少完整脚本，无法导出视频分镜。');
      if(previewOnly){
        let canvas:HTMLCanvasElement;
        if(format==='pdf'){
          const {renderPdfCoverPage,renderPdfPage}=await import('@/lib/export/pdf');
          const entries=plan.entries.slice(0,options.pdf.panelsPerPage);
          canvas=options.pdf.cover?await renderPdfCoverPage(title,'Comic',plan.entries.length,await loadImage(entries[0].panel.imageUrl!),options):await renderPdfPage(entries.map(entry=>entry.panel),0,Math.ceil(plan.entries.length/options.pdf.panelsPerPage),title,true,0,options,entries.map(entry=>entry.number));
        }else if(isXhs){const {renderXhsCanvas}=await import('@/lib/export/xhs');canvas=await renderXhsCanvas(panels,title,options);}
        else{const {renderComicCanvas}=await import('@/lib/export/image');canvas=await renderComicCanvas(panels,title,options);}
        const blob=await canvasToBlob(canvas);canvas.width=0;canvas.height=0;
        if(!blob)throw new Error('预览编码失败。');setPreview(URL.createObjectURL(blob));setMessage((format==='pdf'||format==='xhs-pages')?'已生成第一页预览；不是所有页面的验收。':'已生成整张合成图预览。');
      }else{
        if(format==='pdf'){const {downloadAsPdf}=await import('@/lib/export/pdf');await downloadAsPdf(panels,title,options);}
        else if(format==='png'){const {downloadComicAsImage}=await import('@/lib/export/image');await downloadComicAsImage(panels,title,options);}
        else if(format==='zip'){const {downloadAsZip}=await import('@/lib/export/zip');await downloadAsZip(panels,title,options);}
        else if(isXhs){const {downloadForXiaohongshu}=await import('@/lib/export/xhs');await downloadForXiaohongshu(panels,title,format==='xhs-single'?'single':'pages',options);}
        else if(isVideo){const exports=await import('@/lib/export/seedance');if(format==='seedance-json')exports.downloadForSeedanceJSON(script!,options);else if(format==='seedance-text')exports.downloadForSeedanceText(script!,options);else await exports.downloadForSeedanceZip(script!,options);}
        else{const {downloadMarkdownWithImages}=await import('@/lib/export/markdown');await downloadMarkdownWithImages(panels,title,options);}
        setMessage('文件已生成，并已交给浏览器下载；请检查浏览器下载记录。');
      }
    }catch(error){setMessage(error instanceof Error?error.message:'导出失败，请重试。');}
    finally{running.current=false;setBusy(false);}
  }
  const selected=options.panelIndices??panels.map((_,index)=>index);
  return <dialog ref={dialog} aria-labelledby={heading} aria-busy={busy} onCancel={event=>{event.preventDefault();if(!running.current)onClose();}} className="fixed m-auto w-[calc(100%_-_2rem)] max-w-2xl max-h-[90dvh] overflow-y-auto rounded-xl border bg-card p-5 text-foreground shadow-lg backdrop:bg-black/50">
    <div className="flex items-center justify-between gap-4"><h2 id={heading} className="text-lg font-semibold">导出设置 · {LABELS[format]}</h2><button type="button" disabled={busy} onClick={onClose} className="min-h-[44px] px-3 underline underline-offset-4 disabled:opacity-50">关闭</button></div>
    <p className="mt-2 text-sm text-foreground/80">出版文件不是完整作品备份；不包含任务历史、模型凭据或可恢复的生成状态。</p>
    <fieldset disabled={busy} className="mt-5 space-y-4 disabled:opacity-70">
      <fieldset className="rounded-lg border p-3"><legend className="px-1 text-sm font-medium">选择分镜（按原顺序）</legend><div className="flex max-h-32 flex-wrap gap-x-4 gap-y-2 overflow-y-auto">{panels.map((panel,index)=><label key={`${panel.id}-${index}`} className="inline-flex min-h-[36px] items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(index)} onChange={event=>change({panelIndices:event.target.checked?[...selected,index]:selected.filter(value=>value!==index)})}/>第 {index+1} 格{panel.status!=='completed'||!panel.imageUrl?'（缺图）':''}</label>)}</div></fieldset>
      {!textOnly&&<label className="block space-y-1 text-sm"><span>缺图策略</span><select className="min-h-[44px] w-full rounded-lg border bg-background px-3" value={options.missingImages} onChange={event=>change({missingImages:event.target.value as ExportOptions['missingImages']})}><option value="error">阻止导出，先修复缺图</option><option value="skip">明确跳过未完成或缺图的分镜</option></select></label>}
      <div className="flex flex-wrap gap-4 text-sm"><label className="inline-flex min-h-[44px] items-center gap-2"><input type="checkbox" checked={options.includeDialogue} onChange={event=>change({includeDialogue:event.target.checked})}/>包含对话 / 旁白</label><label className="inline-flex min-h-[44px] items-center gap-2"><input type="checkbox" checked={options.includeScene} onChange={event=>change({includeScene:event.target.checked})}/>包含场景说明</label></div>
      <label className="block space-y-1 text-sm"><span>署名（可选，最多 120 字）</span><input className="min-h-[44px] w-full rounded-lg border bg-background px-3" value={options.attribution} maxLength={120} onChange={event=>change({attribution:event.target.value})}/></label>
      {format==='png'&&<div className="grid grid-cols-2 gap-3"><label className="space-y-1 text-sm"><span>每行格数</span><select className="min-h-[44px] w-full rounded-lg border bg-background px-3" value={options.png.columns} onChange={event=>change({png:{...options.png,columns:Number(event.target.value) as 1|2|3}})}>{[1,2,3].map(value=><option key={value} value={value}>{value} 格</option>)}</select></label><label className="space-y-1 text-sm"><span>渲染倍率</span><select className="min-h-[44px] w-full rounded-lg border bg-background px-3" value={options.png.scale} onChange={event=>change({png:{...options.png,scale:Number(event.target.value) as 1|2}})}><option value={1}>1×</option><option value={2}>2×</option></select></label></div>}
      {isXhs&&<label className="block space-y-1 text-sm"><span>导出宽度</span><select className="min-h-[44px] w-full rounded-lg border bg-background px-3" value={options.xhs.width} onChange={event=>change({xhs:{width:Number(event.target.value) as 1080|1440}})}><option value={1080}>1080 px</option><option value={1440}>1440 px</option></select></label>}
      {isVideo&&<div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-sm"><span>视频画幅（建议）</span><select className="min-h-[44px] w-full rounded-lg border bg-background px-3" value={options.seedance.aspectRatio} onChange={event=>change({seedance:{...options.seedance,aspectRatio:event.target.value as '16:9'|'9:16'|'1:1'}})}>{['16:9','9:16','1:1'].map(value=><option key={value}>{value}</option>)}</select></label>
        <label className="space-y-1 text-sm"><span>建议时长</span><select className="min-h-[44px] w-full rounded-lg border bg-background px-3" value={options.seedance.durationMode} onChange={event=>change({seedance:{...options.seedance,durationMode:event.target.value as 'auto'|'fixed'}})}><option value="auto">按旁白估算</option><option value="fixed">固定每段秒数</option></select></label>
        {options.seedance.durationMode==='fixed'&&<label className="space-y-1 text-sm"><span>每段秒数（3–10）</span><input type="number" min={3} max={10} step={0.5} value={options.seedance.seconds} onChange={event=>change({seedance:{...options.seedance,seconds:Number(event.target.value)}})} className="min-h-[44px] w-full rounded-lg border bg-background px-3"/></label>}
      </div>}
      {format==='pdf'&&<div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-sm"><span>纸张</span><select className="min-h-[44px] w-full rounded-lg border bg-background px-3" value={options.pdf.paper} onChange={event=>change({pdf:{...options.pdf,paper:event.target.value as 'a4'|'letter'}})}><option value="a4">A4</option><option value="letter">Letter</option></select></label>
        <label className="space-y-1 text-sm"><span>方向</span><select className="min-h-[44px] w-full rounded-lg border bg-background px-3" value={options.pdf.orientation} onChange={event=>change({pdf:{...options.pdf,orientation:event.target.value as 'portrait'|'landscape'}})}><option value="portrait">纵向</option><option value="landscape">横向</option></select></label>
        <label className="space-y-1 text-sm"><span>每页格数</span><select className="min-h-[44px] w-full rounded-lg border bg-background px-3" value={options.pdf.panelsPerPage} onChange={event=>change({pdf:{...options.pdf,panelsPerPage:Number(event.target.value) as 1|2|4}})}>{[1,2,4].map(value=><option key={value} value={value}>{value} 格</option>)}</select></label>
        <label className="space-y-1 text-sm"><span>分辨率（DPI）</span><select className="min-h-[44px] w-full rounded-lg border bg-background px-3" value={options.pdf.dpi} onChange={event=>change({pdf:{...options.pdf,dpi:Number(event.target.value) as 150|200|300}})}>{[150,200,300].map(value=><option key={value} value={value}>{value}</option>)}</select></label>
        <label className="space-y-1 text-sm"><span>边距（mm）</span><input type="number" min={5} max={25} className="min-h-[44px] w-full rounded-lg border bg-background px-3" value={options.pdf.marginMm} onChange={event=>change({pdf:{...options.pdf,marginMm:Number(event.target.value)}})}/></label>
        <label className="inline-flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={options.pdf.cover} onChange={event=>change({pdf:{...options.pdf,cover:event.target.checked}})}/>包含封面</label>
      </div>}
    </fieldset>
    <div className="mt-4 space-y-2 text-sm" aria-live="polite"><p>{issue||`将导出 ${count} 格${format==='pdf'?`，共 ${Math.ceil(count/options.pdf.panelsPerPage)+(options.pdf.cover?1:0)} 页`:''}。`}</p>{omitted.length>0&&<p>跳过原始第 {omitted.join('、')} 格。已完成图片若读取失败，仍会停止导出。</p>}{(format==='pdf'||format==='png')&&<p className="text-foreground/80">画面按比例放入，不拉伸。{format==='pdf'&&' PDF 使用图片排版，文字不可检索；长文字可能省略，请检查预览，完整文字可另导出 Markdown 图片包。'}</p>}{isXhs&&<p className="text-foreground/80">{format==='xhs-pages'?'每格固定 3:4，文字过长会报错，不自动截断。预览仅第一页。':'长图高度随内容变化，不是固定 3:4。'} 图片保留比例；未验证平台上传限制。</p>}{isVideo&&<p className="text-foreground/80">仅导出本地分镜建议，不是视频生成请求。画幅、时长和脚本结构未验证第三方平台兼容。{textOnly?'本格式不包含图片，无须先出图。':'参考图必须可读取，脚本引用指向包内文件。'}</p>}{message&&<p role="status">{message}</p>}</div>
    {preview&&<figure className="mt-4"><img src={preview} alt={format==='pdf'?'PDF 第一页实际排版预览':format==='xhs-pages'?'小红书第一页预览':'整图实际排版预览'} className="mx-auto max-h-[50dvh] max-w-full border object-contain"/><figcaption className="mt-2 text-center text-xs">{(format==='pdf'||format==='xhs-pages')?'仅预览第一页':'整张合成图预览'}</figcaption></figure>}
    <div className="mt-5 flex flex-wrap justify-end gap-3">{canPreview&&<button type="button" disabled={busy||!!issue} onClick={()=>void execute(true)} className="min-h-[44px] rounded-lg border px-4 disabled:opacity-50">生成预览</button>}<button type="button" disabled={busy||!!issue} onClick={()=>void execute()} className="min-h-[44px] rounded-lg bg-foreground px-4 text-background disabled:opacity-50">{busy?'处理中…':'生成并下载'}</button></div>
  </dialog>;
}
