import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
vi.mock('react',async original=>({...await original<typeof import('react')>(),useEffect:()=>{}}));
import { ExportDialog } from '@/components/ExportDialog';
describe('publication export dialog',()=>{
  it('shows only format-relevant settings and explicit missing image policy',()=>{
    const panels=[{id:1,scene:'scene',dialogue:'text',imagePrompt:'prompt',status:'completed' as const,imageUrl:'/api/images/one'}];
    const pdf=renderToStaticMarkup(<ExportDialog panels={panels} title="Test" format="pdf" onClose={()=>{}}/>);
    expect(pdf).toContain('纸张');expect(pdf).toContain('缺图策略');expect(pdf).toContain('包含封面');
    const zip=renderToStaticMarkup(<ExportDialog panels={panels} title="Test" format="zip" onClose={()=>{}}/>);
    expect(zip).not.toContain('纸张');expect(zip).not.toContain('包含封面');expect(zip).toContain('不是完整作品备份');
  });
  it('shows video planning controls without requiring images for script-only formats',()=>{
    const panels=[{id:1,scene:'scene',dialogue:'text',imagePrompt:'prompt',status:'pending' as const}];
    const html=renderToStaticMarkup(<ExportDialog panels={panels} title="Test" format="seedance-json" script={{title:'Test',topic:'Test',style:'anime',panels}} onClose={()=>{}}/>);
    expect(html).toContain('视频画幅');expect(html).toContain('建议时长');expect(html).not.toContain('缺图策略');expect(html).not.toContain('尚无可用图片');
    const xhs=renderToStaticMarkup(<ExportDialog panels={panels} title="Test" format="xhs-pages" onClose={()=>{}}/>);
    expect(xhs).toContain('导出宽度');expect(xhs).toContain('固定 3:4');
  });

});
