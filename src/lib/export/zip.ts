import type { ComicPanel } from '../types';
import { buildExportPlan, defaultExportOptions, safeExportFilename, type ExportOptions } from './options';
import { triggerBlobDownload, dateSuffix } from './shared';
const MAX_IMAGE_BYTES=20*1024*1024;
const MAX_ARCHIVE_BYTES=128*1024*1024;
/** Fail closed: an HTTP error or unreadable image must not become a successful archive. */
export async function readExportImage(url:string):Promise<{bytes:Uint8Array;extension:string}> {
  const response=await fetch(url,{signal:AbortSignal.timeout(30_000)});
  if(!response.ok)throw new Error(`图片读取失败（HTTP ${response.status}）。`);
  const mime=(response.headers.get('content-type')??'').split(';')[0].toLowerCase();
  const extension=({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'} as Record<string,string>)[mime];
  if(!extension)throw new Error('图片格式不支持或服务器没有返回图片。');
  if(Number(response.headers.get('content-length'))>MAX_IMAGE_BYTES){await response.body?.cancel();throw new Error('单图超过 20 MB 导出预算。');}
  const reader=response.body?.getReader();if(!reader)throw new Error('图片响应为空。');
  const chunks:Uint8Array[]=[];let size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_IMAGE_BYTES)throw new Error('单图超过 20 MB 导出预算。');chunks.push(value);}}
  catch(error){await reader.cancel();throw error;}finally{reader.releaseLock();}
  if(!size)throw new Error('图片响应为空。');
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return {bytes,extension};
}
export async function buildPublicationArchive(panels:ComicPanel[],title:string,options:ExportOptions):Promise<Blob> {
  const plan=buildExportPlan(panels,options);
  const JSZip=(await import('jszip')).default;const zip=new JSZip();
  const outputs:{number:number;path:string}[]=[];let totalBytes=0;
  const lines=[`# ${title}`,'',`面板数量：${plan.entries.length}`,`跳过的原始分镜：${plan.omittedNumbers.join('、')||'无'}`,'',options.attribution?`署名：${options.attribution}`:''];
  for(const entry of plan.entries){
    const {bytes,extension}=await readExportImage(entry.panel.imageUrl!);totalBytes+=bytes.length;
    if(totalBytes>MAX_ARCHIVE_BYTES)throw new Error('图片包超过 128 MB 导出预算，请分批导出。');
    const imagePath=`images/panel_${String(entry.number).padStart(2,'0')}.${extension}`;
    zip.file(imagePath,bytes);outputs.push({number:entry.number,path:imagePath});
    lines.push('',`## 第 ${entry.number} 格`,'',`![第 ${entry.number} 格](${imagePath})`);
    if(options.includeDialogue)lines.push('',`对话/旁白：${entry.panel.dialogue}`);
    if(options.includeScene)lines.push('',`场景：${entry.panel.scene}`);
    if(options.format==='markdown')lines.push('','图片提示词：','',...entry.panel.imagePrompt.split('\n').map(line=>`    ${line}`));
  }
  zip.file('README.md',lines.join('\n'));
  zip.file('export.json',JSON.stringify({schemaVersion:1,kind:'publication',title,createdAt:new Date().toISOString(),options:plan.options,omittedPanelNumbers:plan.omittedNumbers,outputs},null,2));
  return zip.generateAsync({type:'blob',compression:'STORE'});
}
export async function downloadAsZip(panels:ComicPanel[],title:string,options:ExportOptions=defaultExportOptions('zip')):Promise<void>{
  const blob=await buildPublicationArchive(panels,title,{...options,format:'zip'});
  triggerBlobDownload(blob,`${safeExportFilename(title)}_${dateSuffix()}.zip`);
}
