import {describe,expect,it} from 'vitest';
import {buildExportPlan,defaultExportOptions} from '@/lib/export/options';
import {buildSeedanceData} from '@/lib/export/seedance';
import type {ComicScript} from '@/lib/types';
const script:ComicScript={title:'Special formats',topic:'Test',style:'anime',panels:[
 {id:1,scene:'Scene one',dialogue:'First',imagePrompt:'medium close-up of a face',status:'completed',imageUrl:'file://one'},
 {id:2,scene:'Scene two',dialogue:'Second',imagePrompt:'close-up of a hand',status:'pending'},
 {id:3,scene:'Scene three',dialogue:'Third',imagePrompt:'extreme close-up of an eye',status:'completed',imageUrl:'/api/images/three'},
]};
describe('specialized export planning',()=>{
 it('allows text-only video scripts but requires explicit partial image packages',()=>{
  expect(buildExportPlan(script.panels,defaultExportOptions('seedance-json')).entries).toHaveLength(3);
  expect(()=>buildExportPlan(script.panels,defaultExportOptions('seedance-zip'))).toThrow('第 2 格');
 });
 it('preserves original segment IDs and applies video metadata without claiming provider compatibility',()=>{
  const options=defaultExportOptions('seedance-json');options.panelIndices=[2,0];options.seedance={aspectRatio:'9:16',durationMode:'fixed',seconds:7};
  const data=buildSeedanceData(script,options);
  expect(data.aspectRatio).toBe('9:16');expect(data.segments.map(s=>s.id)).toEqual([1,3]);expect(data.totalDuration).toBe(14);
  expect(data.segments[0].referenceImage).toBe('/api/images/one');
 });
 it('distinguishes camera distances instead of labeling every close-up extreme',()=>{
  const data=buildSeedanceData(script);expect(data.segments.map(s=>s.camera)).toEqual(['medium close-up','close-up','extreme close-up']);
 });
 it('rejects invalid specialized numeric settings',()=>{
  const options=defaultExportOptions('xhs-pages');options.xhs.width=123 as 1080;
  expect(()=>buildExportPlan(script.panels,options)).toThrow('小红书');
  const video=defaultExportOptions('seedance-json');video.seedance.seconds=0;
  expect(()=>buildExportPlan(script.panels,video)).toThrow('时长');
 });
});
