import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultExportOptions } from '@/lib/export/options';
import type { ComicPanel } from '@/lib/types';
const state=vi.hoisted(()=>({renderSizes:[] as number[][],downloads:vi.fn(),pdf:vi.fn(),save:vi.fn(),addPage:vi.fn(),addImage:vi.fn(),load:vi.fn()}));
vi.mock('@/lib/export/shared',async original=>({...await original<typeof import('@/lib/export/shared')>(),loadImage:state.load,triggerBlobDownload:state.downloads}));
vi.mock('jspdf',()=>({jsPDF:class {constructor(options:unknown){state.pdf(options);}addPage=state.addPage;addImage=state.addImage;save=state.save;}}));
const panels:ComicPanel[]=[{id:1,scene:'SCENE',dialogue:'CAPTION',imagePrompt:'p',imageUrl:'/api/images/one',status:'completed'},{id:2,scene:'TWO',dialogue:'SECOND',imagePrompt:'p',imageUrl:'/api/images/two',status:'completed'}];
const canvases:{width:number;height:number;ctx:any}[]=[];
function setupCanvas(){
  const create=()=>{const ctx:any={measureText:(s:string)=>({width:s.length*10}),createLinearGradient:()=>({addColorStop:()=>{}}),fillText:vi.fn(),drawImage:vi.fn(),arc:vi.fn()};const proxy=new Proxy(ctx,{get:(o,k)=>k in o?o[k]:()=>{}});const canvas={width:0,height:0,ctx,getContext:()=>proxy,toDataURL:()=> {state.renderSizes.push([canvas.width,canvas.height]);return 'data:image/png;base64,AA';},toBlob:(fn:(blob:Blob)=>void)=>fn(new Blob(['png'],{type:'image/png'}))};canvases.push(canvas);return canvas;};
  vi.stubGlobal('document',{createElement:create});state.load.mockResolvedValue({width:640,height:400});
}
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();canvases.length=0;state.renderSizes.length=0;});
describe('publication exporter wiring',()=>{
  it('renders the same square center-crop as the reader, with captions below',async()=>{
    setupCanvas();state.load.mockResolvedValue({width:1536,height:1024});
    const options=defaultExportOptions('png');options.includeScene=false;options.png.scale=1;
    const {renderComicCanvas}=await import('@/lib/export/image');
    const result=await renderComicCanvas(panels,'Jobs',options);
    const context=canvases.find(c=>c.ctx.drawImage.mock.calls.length)!.ctx;
    const image=context.drawImage.mock.calls[0];
    const caption=context.fillText.mock.calls.find((call:unknown[])=>call[0]==='CAPTION');
    expect(image).toEqual([expect.anything(),256,0,1024,1024,20,expect.any(Number),512,512]);
    expect(caption[2]-(image[6]+image[8])).toBeLessThanOrEqual(20);
    expect(context.arc.mock.calls[0][1]).toBeGreaterThan(image[6]);
    expect(result.height).toBeGreaterThan(550);
  });
  it('passes paper, orientation, cover, DPI and selected panel capacity to PDF renderer',async()=>{
    setupCanvas();const options=defaultExportOptions('pdf');options.includeDialogue=false;options.includeScene=false;options.pdf={...options.pdf,paper:'letter',orientation:'landscape',dpi:150,panelsPerPage:1,cover:false};
    const {downloadAsPdf}=await import('@/lib/export/pdf');await downloadAsPdf(panels,'Synthetic',options);
    expect(state.pdf).toHaveBeenCalledWith(expect.objectContaining({format:'letter',orientation:'landscape'}));
    expect(state.addImage).toHaveBeenCalledTimes(2);expect(state.addPage).toHaveBeenCalledTimes(1);
    expect(state.renderSizes).toEqual([[1650,1275],[1650,1275]]);
    expect(canvases.flatMap(c=>c.ctx.fillText.mock.calls).flat()).not.toContain('CAPTION');
  });
  it('does not claim successful PNG export when a panel fails to load',async()=>{
    setupCanvas();state.load.mockRejectedValueOnce(new Error('broken image'));
    const {downloadComicAsImage}=await import('@/lib/export/image');
    await expect(downloadComicAsImage(panels,'Synthetic',defaultExportOptions('png'))).rejects.toThrow('broken image');
    expect(state.downloads).not.toHaveBeenCalled();
  });
  it('rejects ZIP HTTP failures rather than including an error page or silently skipping it',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('not found',{status:404,headers:{'Content-Type':'text/html'}})));
    const {downloadAsZip}=await import('@/lib/export/zip');
    await expect(downloadAsZip(panels,'Synthetic',defaultExportOptions('zip'))).rejects.toThrow('404');
    expect(state.downloads).not.toHaveBeenCalled();
  });
});
