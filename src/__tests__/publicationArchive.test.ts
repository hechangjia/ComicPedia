import JSZip from 'jszip';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {buildPublicationArchive} from '@/lib/export/zip';
import {defaultExportOptions} from '@/lib/export/options';
import type {ComicPanel} from '@/lib/types';
afterEach(()=>vi.unstubAllGlobals());
describe('publication archive contents',()=>{
  it('includes only selected originals, correct image extensions and a reproducible manifest',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png'}})));
    const panels:ComicPanel[]=[1,2,3].map(id=>({id,scene:`scene ${id}`,dialogue:`caption ${id}`,imagePrompt:`prompt ${id}`,status:'completed',imageUrl:`/api/images/${id}`}));
    const options={...defaultExportOptions('markdown'),panelIndices:[2,0],includeScene:false,attribution:'QA'};
    const blob=await buildPublicationArchive(panels,'Archive test',options);
    const zip=await JSZip.loadAsync(await blob.arrayBuffer());
    expect(zip.file('images/panel_01.png')).not.toBeNull();expect(zip.file('images/panel_03.png')).not.toBeNull();expect(zip.file('images/panel_02.png')).toBeNull();
    const text=await zip.file('README.md')!.async('string');expect(text).toContain('(images/panel_03.png)');expect(text).not.toContain('scene 1');expect(text).toContain('caption 3');
    const manifest=JSON.parse(await zip.file('export.json')!.async('string'));expect(manifest.kind).toBe('publication');expect(manifest.outputs.map((entry:{number:number})=>entry.number)).toEqual([1,3]);expect(manifest.options).toMatchObject(options);
  });
});
