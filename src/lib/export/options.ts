import type { ComicPanel } from '../types';
export type PublicationFormat = 'png' | 'pdf' | 'zip' | 'markdown' | 'xhs-single' | 'xhs-pages' | 'seedance-json' | 'seedance-text' | 'seedance-zip';
export interface PdfExportOptions {
  paper:'a4'|'letter'; orientation:'portrait'|'landscape'; dpi:150|200|300;
  panelsPerPage:1|2|4; marginMm:number; cover:boolean;
}
export interface ExportOptions {
  format:PublicationFormat; panelIndices?:number[]; missingImages:'error'|'skip';
  includeDialogue:boolean; includeScene:boolean; attribution:string;
  png:{columns:1|2|3;scale:1|2}; pdf:PdfExportOptions;
  xhs:{width:1080|1440};
  seedance:{aspectRatio:'16:9'|'9:16'|'1:1';durationMode:'auto'|'fixed';seconds:number};
}
export interface ExportEntry { panel:ComicPanel; number:number }
export interface ExportPlan {options:ExportOptions;entries:ExportEntry[];omittedNumbers:number[]}
export function defaultExportOptions(format:PublicationFormat):ExportOptions {
  return {format,missingImages:'error',includeDialogue:true,includeScene:true,attribution:'',xhs:{width:1080},seedance:{aspectRatio:'16:9',durationMode:'auto',seconds:5},png:{columns:2,scale:2},pdf:{paper:'a4',orientation:'portrait',dpi:200,panelsPerPage:4,marginMm:10,cover:true}};
}
export function safeExportFilename(title:string):string {
  const name=title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/^\.+|[. ]+$/g,'').trim().slice(0,100);
  return !name?'comic':/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)?`comic_${name}`:name;
}
export function checkedCanvasSize(width:number,height:number):void {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>16384||height>16384)throw new Error('导出尺寸超过安全范围，请减少分镜、分辨率或改用分页 PDF。');
  if(width*height>32_000_000)throw new Error('导出内存预算超限，请减少分镜、分辨率或改用分页 PDF。');
}
export function pdfGeometry(pdf:PdfExportOptions) {
  let [widthMm,heightMm]=pdf.paper==='letter'?[215.9,279.4]:[210,297];
  if(pdf.orientation==='landscape')[widthMm,heightMm]=[heightMm,widthMm];
  const widthPx=Math.round(widthMm*pdf.dpi/25.4),heightPx=Math.round(heightMm*pdf.dpi/25.4);
  checkedCanvasSize(widthPx,heightPx);
  const cols=pdf.panelsPerPage===4||pdf.panelsPerPage===2&&pdf.orientation==='landscape'?2:1;
  return {widthMm,heightMm,widthPx,heightPx,cols,rows:pdf.panelsPerPage/cols,marginPx:Math.round(pdf.marginMm*pdf.dpi/25.4)};
}
export function buildExportPlan(panels:ComicPanel[], options:ExportOptions):ExportPlan {
  if(!['png','pdf','zip','markdown','xhs-single','xhs-pages','seedance-json','seedance-text','seedance-zip'].includes(options.format)||!['error','skip'].includes(options.missingImages))throw new Error('导出格式或缺图策略无效。');
  if(typeof options.includeDialogue!=='boolean'||typeof options.includeScene!=='boolean'||typeof options.attribution!=='string'||options.attribution.length>120)throw new Error('导出文字选项无效，署名最多 120 字。');
  if(options.format==='png'&&(![1,2,3].includes(options.png.columns)||![1,2].includes(options.png.scale)))throw new Error('PNG 布局或分辨率无效。');
  if(options.format==='pdf'){
    const p=options.pdf;
    if(!['a4','letter'].includes(p.paper)||!['portrait','landscape'].includes(p.orientation)||![150,200,300].includes(p.dpi)||![1,2,4].includes(p.panelsPerPage)||!Number.isFinite(p.marginMm)||p.marginMm<5||p.marginMm>25||typeof p.cover!=='boolean')throw new Error('PDF 参数无效：边距为 5–25 mm，分辨率为 150/200/300 DPI。');
    pdfGeometry(p);
  }
  if (options.format.startsWith('xhs-') && ![1080,1440].includes(options.xhs.width)) throw new Error('小红书图片宽度必须为 1080 或 1440 px。');
  if (options.format.startsWith('seedance-')) {
    const video=options.seedance;
    if (!['16:9','9:16','1:1'].includes(video.aspectRatio)||!['auto','fixed'].includes(video.durationMode)||!Number.isFinite(video.seconds)||video.seconds<3||video.seconds>10) throw new Error('视频画幅或建议时长无效，时长范围为 3–10 秒。');
  }
  const textOnly=options.format==='seedance-json'||options.format==='seedance-text';
  const indices=options.panelIndices??panels.map((_,index)=>index);
  if(!indices.length||indices.some(index=>!Number.isSafeInteger(index)||index<0||index>=panels.length))throw new Error('请选择有效的分镜。');
  const entries:ExportEntry[]=[];const omittedNumbers:number[]=[];
  for(const index of [...new Set(indices)].sort((a,b)=>a-b)){
    const panel=panels[index];const url=panel.imageUrl;
    if(!textOnly&&(panel.status!=='completed'||!url||url.startsWith('data:text/plain'))){omittedNumbers.push(index+1);continue;}
    const imageUrl=url?.startsWith('file://')?`/api/images/${encodeURIComponent(url.slice(7))}`:url;
    entries.push({number:index+1,panel:{...panel,imageUrl,dialogue:options.includeDialogue?panel.dialogue:'',scene:options.includeScene?panel.scene:''}});
  }
  if(omittedNumbers.length&&options.missingImages==='error')throw new Error(`第 ${omittedNumbers.join('、')} 格缺少已完成图片。可修复后导出，或明确选择跳过缺图。`);
  if(!entries.length)throw new Error('所选分镜没有可用图片。');
  if (options.format === 'pdf') {
    const geometry = pdfGeometry(options.pdf);
    const pages = Math.ceil(entries.length / options.pdf.panelsPerPage) + (options.pdf.cover ? 1 : 0);
    if (geometry.widthPx * geometry.heightPx * pages > 100_000_000) {
      throw new Error('PDF 总渲染预算超限，请降低 DPI、增加每页格数或分批导出。');
    }
  }
  return {options:structuredClone(options),entries,omittedNumbers};
}
