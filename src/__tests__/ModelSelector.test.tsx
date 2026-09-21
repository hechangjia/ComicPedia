import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
import { createEmptyUserConfig } from "@/lib/config/userConfig";
const state=vi.hoisted(()=>({snapshot:{} as any}));
vi.mock("@/hooks/useAPIConfig",()=>({useConfigSnapshot:()=>state.snapshot,getStoredConfigs:()=>state.snapshot.config}));
import { ModelSelector } from "@/components/ModelSelector";
describe("reactive model selection",()=>{
 it("shows even a single model and an explicit missing selection instead of silently displaying the default",()=>{
  state.snapshot={config:{...createEmptyUserConfig(),llmConfigs:[{id:'a',name:'A',provider:'custom',model:'model-a'}],activeLLMId:'a'},isLoaded:true,syncStatus:'saved'};
  const html=renderToStaticMarkup(<ModelSelector type="llm" value="deleted" onChange={()=>{}}/>);
  expect(html).toContain('所选配置已删除');expect(html).toContain('model-a');expect(html).toContain('跟随默认');
 });
 it("reflects a changed configuration rather than a mount-only snapshot",()=>{
  state.snapshot={config:{...createEmptyUserConfig(),llmConfigs:[],activeLLMId:null},isLoaded:true,syncStatus:'saved'};
  expect(renderToStaticMarkup(<ModelSelector type="llm" value={null} onChange={()=>{}}/>)).toContain('尚无模型配置');
 });
});
