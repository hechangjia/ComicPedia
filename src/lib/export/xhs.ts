import type {ComicPanel} from '../types';
import {buildExportPlan,checkedCanvasSize,defaultExportOptions,safeExportFilename,type ExportOptions,type ExportPlan} from './options';
import {loadImage,canvasToBlob,triggerBlobDownload,dateSuffix,measureTextLines,wrapText} from './shared';
export type XHSExportMode='single'|'pages';
const FONT="'Microsoft YaHei', 'PingFang SC', sans-serif";
function caption(panel:ComicPanel){return [panel.dialogue,panel.scene!==panel.dialogue?panel.scene:''].filter(Boolean).join(' — ');}
function renderGeometry(plan:ExportPlan,pageIndex:number) {
  const paged=plan.options.format==='xhs-pages';
  const entries=paged?[plan.entries[pageIndex]]:plan.entries;
  if(entries.some(entry=>!entry))throw new Error('预览页不存在。');
  const width=plan.options.xhs.width, padding=Math.round(width/27), fontSize=Math.round(width/45),lineHeight=Math.round(fontSize*1.4),header=Math.round(width/12),footer=Math.round(width/16),gap=Math.round(width/36);
  const measurement=document.createElement('canvas').getContext('2d')!;measurement.font=`${fontSize}px ${FONT}`;
  const imageWidth=width-padding*2;
  const textHeights=entries.map(({panel})=>caption(panel)?measureTextLines(measurement,caption(panel),imageWidth)*lineHeight+padding:0);
  const height=paged?Math.round(width*4/3):header+footer+entries.length*(imageWidth+gap)+textHeights.reduce((a,b)=>a+b,0);
  if(paged&&textHeights[0]>height*0.35)throw new Error('本页文字过长，无法在固定 3:4 页面中完整排下。请减少文字、关闭说明或改用长图。');
  checkedCanvasSize(width,height);
  return {entries,width,height,padding,fontSize,lineHeight,header,footer,gap,imageWidth,textHeights,paged};
}
export async function renderXhsCanvas(panels:ComicPanel[],title:string,options:ExportOptions=defaultExportOptions('xhs-single'),pageIndex=0):Promise<HTMLCanvasElement> {
  const plan=buildExportPlan(panels,options);
  const geometry=renderGeometry(plan,pageIndex);
  const {entries,width,height,padding,fontSize,lineHeight,header,footer,gap,imageWidth,textHeights,paged}=geometry;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#333';ctx.font=`bold ${Math.round(width/30)}px ${FONT}`;ctx.textAlign='center';ctx.fillText(title,width/2,header*.65,width-padding*2);
  let y=header;
  for(let index=0;index<entries.length;index++){
    const {panel,number}=entries[index];
    const image=await loadImage(panel.imageUrl!);
    const imageHeight=paged?height-header-footer-textHeights[index]-gap:imageWidth;
    const scale=Math.min(imageWidth/image.width,imageHeight/image.height);
    const drawWidth=image.width*scale,drawHeight=image.height*scale;
    ctx.strokeStyle='#ddd';ctx.strokeRect(padding,y,imageWidth,imageHeight);
    ctx.drawImage(image,padding+(imageWidth-drawWidth)/2,y+(imageHeight-drawHeight)/2,drawWidth,drawHeight);
    ctx.fillStyle='#333';ctx.font=`bold ${fontSize}px ${FONT}`;ctx.textAlign='left';
    ctx.fillText(String(number),padding+10,y+fontSize+10);
    if(caption(panel)) {ctx.font=`${fontSize}px ${FONT}`;ctx.textBaseline='top';wrapText(ctx,caption(panel),padding,y+imageHeight+padding/3,imageWidth,lineHeight);ctx.textBaseline='alphabetic';}
    y+=imageHeight+textHeights[index]+gap;
  }
  ctx.fillStyle='#666';ctx.font=`${Math.round(width/70)}px ${FONT}`;ctx.textAlign='right';ctx.fillText(options.attribution,width-padding,height-padding/2,width-padding*2);
  return canvas;
}
async function encodedCanvas(canvas:HTMLCanvasElement):Promise<Blob>{
  const blob=await canvasToBlob(canvas);canvas.width=0;canvas.height=0;
  if(!blob)throw new Error('图片编码失败，请减少分镜或分辨率。');return blob;
}
export async function buildXhsArchive(panels:ComicPanel[],title:string,options:ExportOptions=defaultExportOptions('xhs-pages')):Promise<Blob>{
  const plan=buildExportPlan(panels,{...options,format:'xhs-pages'});
  const pagePixels=options.xhs.width*Math.round(options.xhs.width*4/3);
  if(pagePixels*plan.entries.length>100_000_000)throw new Error('分页总渲染预算超限，请减少分镜或分批导出。');
  // Check all text/layout before starting expensive raster work.
  for(let index=0;index<plan.entries.length;index++)renderGeometry(plan,index);
  const JSZip=(await import('jszip')).default;const zip=new JSZip();
  const outputs:{number:number;path:string}[]=[];let bytes=0;
  for(let index=0;index<plan.entries.length;index++){
    const blob=await encodedCanvas(await renderXhsCanvas(panels,title,plan.options,index));bytes+=blob.size;
    if(bytes>128*1024*1024)throw new Error('分页文件超过 128 MB，请分批导出。');
    const filename=`pages/panel_${String(plan.entries[index].number).padStart(2,'0')}.png`;
    zip.file(filename,await blob.arrayBuffer());outputs.push({number:plan.entries[index].number,path:filename});
  }
  zip.file('export.json',JSON.stringify({schemaVersion:1,kind:'publication',options:plan.options,omittedPanelNumbers:plan.omittedNumbers,outputs},null,2));
  zip.file('README.md',`# ${title}\n\n每页 ${options.xhs.width} × ${Math.round(options.xhs.width*4/3)} px，固定 3:4；保留原始分镜编号。\n\n本文件是本地排版导出，未验证第三方平台上传兼容。`);
  return zip.generateAsync({type:'blob',compression:'STORE'});
}
export async function downloadForXiaohongshuSingle(panels:ComicPanel[],title:string,options:ExportOptions=defaultExportOptions('xhs-single')):Promise<void>{
  const blob=await encodedCanvas(await renderXhsCanvas(panels,title,{...options,format:'xhs-single'}));
  triggerBlobDownload(blob,`${safeExportFilename(title)}_小红书_${dateSuffix()}.png`);
}
export async function downloadForXiaohongshuPages(panels:ComicPanel[],title:string,options:ExportOptions=defaultExportOptions('xhs-pages')):Promise<void>{
  triggerBlobDownload(await buildXhsArchive(panels,title,options),`${safeExportFilename(title)}_小红书分页_${dateSuffix()}.zip`);
}
export async function downloadForXiaohongshu(panels:ComicPanel[],title:string,mode:XHSExportMode='single',options:ExportOptions=defaultExportOptions(mode==='single'?'xhs-single':'xhs-pages')):Promise<void>{
  if(mode==='single')await downloadForXiaohongshuSingle(panels,title,options);else await downloadForXiaohongshuPages(panels,title,options);
}
