import {afterEach,describe,expect,it,vi} from 'vitest';
import JSZip from 'jszip';
import {defaultExportOptions} from '@/lib/export/options';
import type {ComicPanel,ComicScript} from '@/lib/types';
const state=vi.hoisted(()=>({load:vi.fn(),download:vi.fn(),draws:[] as number[][],texts:[] as string[]}));
vi.mock('@/lib/export/shared',async original=>({...await original<typeof import('@/lib/export/shared')>(),loadImage:state.load,triggerBlobDownload:state.download}));
const panels:ComicPanel[]=[{id:1,scene:'Scene',dialogue:'Dialogue',imagePrompt:'Test',status:'completed',imageUrl:'file://one'}];
function canvasEnvironment(){
 vi.stubGlobal('document',{createElement:()=>{const ctx=new Proxy({measureText:(s:string)=>({width:s.length*10}),drawImage:(_image:unknown,...args:number[])=>state.draws.push(args),fillText:(text:string)=>state.texts.push(text)},{get:(o,k)=>k in o?o[k as keyof typeof o]:()=>{}});return {width:0,height:0,getContext:()=>ctx,toBlob:(cb:(b:Blob)=>void)=>cb(new Blob(['png'],{type:'image/png'}))};}});
 state.load.mockResolvedValue({width:640,height:400});
}
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();state.draws=[];state.texts=[];});
describe('specialized rendering and assets',()=>{
 it('renders fixed 3:4 pages at the requested width without stretching landscape sources',async()=>{
  canvasEnvironment();const {renderXhsCanvas}=await import('@/lib/export/xhs');
  const options=defaultExportOptions('xhs-pages');options.xhs.width=1440;
  const canvas=await renderXhsCanvas(panels,'Test',options);
  expect([canvas.width,canvas.height]).toEqual([1440,1920]);
  const draw=state.draws[0];expect(draw[2]/draw[3]).toBeCloseTo(640/400);
 });
 it('does not quietly truncate overflowing page text',async()=>{
  canvasEnvironment();const {renderXhsCanvas}=await import('@/lib/export/xhs');
  await expect(renderXhsCanvas([{...panels[0],dialogue:'x'.repeat(20000)}],'Test',defaultExportOptions('xhs-pages'))).rejects.toThrow('文字');
 });
 it('uses the checked renderer for clipboard/share output and propagates broken images',async()=>{
  canvasEnvironment();state.load.mockRejectedValueOnce(new Error('missing fixture'));
  const {generateComicImageBlob}=await import('@/lib/export/image');
  await expect(generateComicImageBlob(panels,'Test')).rejects.toThrow('missing fixture');
 });
 it('packages local file/API references with real extensions and linked script paths',async()=>{
  const fetcher=vi.fn(async()=>new Response(new Uint8Array([255,216,255]),{headers:{'Content-Type':'image/jpeg'}}));vi.stubGlobal('fetch',fetcher);
  const {buildSeedanceArchive}=await import('@/lib/export/seedance');
  const script:ComicScript={title:'Test',topic:'Test',style:'anime',panels};
  const archive=await buildSeedanceArchive(script);
  const zip=await JSZip.loadAsync(await archive.arrayBuffer());
  expect(fetcher).toHaveBeenCalledWith('/api/images/one',expect.anything());
  expect(zip.file('references/segment_01.jpg')).not.toBeNull();
  const data=JSON.parse(await zip.file('script.json')!.async('string'));
  expect(data.segments[0].referenceImage).toBe('references/segment_01.jpg');
  expect(JSON.parse(await zip.file('export.json')!.async('string')).providerCompatibilityVerified).toBe(false);
 });
});
