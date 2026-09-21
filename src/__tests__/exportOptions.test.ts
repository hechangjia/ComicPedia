import { describe, expect, it } from 'vitest';
import { buildExportPlan, defaultExportOptions, checkedCanvasSize, pdfGeometry, safeExportFilename } from '@/lib/export/options';
import type { ComicPanel } from '@/lib/types';
const panels:ComicPanel[]=[
  {id:1,scene:'A',dialogue:'One',imagePrompt:'A',status:'completed',imageUrl:'file://first'},
  {id:2,scene:'B',dialogue:'Two',imagePrompt:'B',status:'failed'},
  {id:3,scene:'C',dialogue:'Three',imagePrompt:'C',status:'completed',imageUrl:'data:image/png;base64,abc'},
];
describe('publication export options',()=>{
  it('requires an explicit partial export and preserves original panel numbers',()=>{
    expect(()=>buildExportPlan(panels,defaultExportOptions('pdf'))).toThrow('第 2 格');
    const plan=buildExportPlan(panels,{...defaultExportOptions('pdf'),missingImages:'skip'});
    expect(plan.entries.map(entry=>entry.number)).toEqual([1,3]);
    expect(plan.omittedNumbers).toEqual([2]);
    expect(plan.entries[0].panel.imageUrl).toBe('/api/images/first');
    expect(panels[0].imageUrl).toBe('file://first');
  });
  it('validates selection without silently changing order or accepting out-of-range indices',()=>{
    const options={...defaultExportOptions('png'),panelIndices:[2,0]};
    expect(buildExportPlan(panels,options).entries.map(entry=>entry.number)).toEqual([1,3]);
    expect(()=>buildExportPlan(panels,{...options,panelIndices:[99]})).toThrow('选择');
    expect(()=>buildExportPlan(panels,{...options,panelIndices:[]})).toThrow('选择');
  });
  it('rejects unsupported enum/numeric options and bounds canvas memory before allocation',()=>{
    expect(()=>buildExportPlan([panels[0]],{...defaultExportOptions('pdf'),pdf:{...defaultExportOptions('pdf').pdf,dpi:Infinity as 150}})).toThrow('PDF');
    expect(()=>checkedCanvasSize(20000,20000)).toThrow('尺寸');
    expect(()=>checkedCanvasSize(8000,8000)).toThrow('内存');
  });
  it('computes landscape Letter dimensions at selected DPI and page capacity',()=>{
    const options=defaultExportOptions('pdf');options.pdf={...options.pdf,paper:'letter',orientation:'landscape',dpi:150,panelsPerPage:2};
    expect(pdfGeometry(options.pdf)).toMatchObject({widthMm:279.4,heightMm:215.9,widthPx:1650,heightPx:1275,cols:2,rows:1});
  });
  it('neutralizes path separators, controls and reserved filenames',()=>{
    expect(safeExportFilename('../bad\\name:*?')).not.toMatch(/[\\/:*?]/);
    expect(safeExportFilename('CON')).not.toBe('CON');
  });
  it('caps aggregate PDF raster work instead of only checking each page',()=>{
    const many=Array.from({length:30},(_,index)=>({...panels[0],id:index+1}));
    const options=defaultExportOptions('pdf');options.pdf={...options.pdf,dpi:300,panelsPerPage:1};
    expect(()=>buildExportPlan(many,options)).toThrow('PDF 总渲染预算');
  });

});
