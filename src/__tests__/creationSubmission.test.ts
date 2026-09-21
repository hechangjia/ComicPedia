import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyUserConfig } from "@/lib/config/userConfig";
const state = vi.hoisted(() => ({ values: [] as unknown[], refs: [] as {current: unknown}[], index: 0, refIndex: 0, snapshot: {} as any, start: vi.fn(), push: vi.fn() }));
vi.mock("react", () => ({
  useState: (initial: unknown) => { const i=state.index++; if(!(i in state.values)) state.values[i]=typeof initial==='function' ? (initial as () => unknown)() : initial; return [state.values[i], (next: unknown) => { state.values[i]=typeof next==='function' ? (next as (v: unknown)=>unknown)(state.values[i]) : next; }]; },
  useRef: (initial: unknown) => { const i=state.refIndex++; return state.refs[i] ??= {current: initial}; },
  useMemo: (fn: () => unknown) => fn(), useCallback: (fn: unknown) => fn, useEffect: () => {},
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock("@/hooks/useAPIConfig", () => ({
  useConfigCheck: () => ({isLoaded:true,hasLLM:!!state.snapshot.config.activeLLMId,hasImage:false}),
  useAPIConfig: () => state.snapshot,
  useConfigSnapshot: () => state.snapshot,
  getStoredConfigSnapshot: () => state.snapshot,
  getStoredConfigs: () => state.snapshot.config,
  getStoredRequestConfigs: (llmId?:string) => { const id=llmId??state.snapshot.config.activeLLMId; const model=state.snapshot.config.llmConfigs.find((m:any)=>m.id===id); return {llmConfig:model?{configId:id,configRole:'llm',apiUrl:model.apiUrl,model:model.model,provider:model.protocolType}:undefined}; },
}));
vi.mock("@/lib/client/generator", () => ({startGeneration:state.start}));
vi.mock("@/lib/llm", () => ({generateReferenceImagePrompt:vi.fn(),generateCharacterPrompts:vi.fn()}));
vi.mock("@/lib/imageGen", () => ({getImageAdapter:vi.fn()}));
vi.mock("@/components/CharacterPicker", () => ({extractReferenceEntries:()=>[]}));
import { useContentForm } from "@/hooks/useContentForm";
function resetHookCursor() { state.index=0; state.refIndex=0; }
function useHarness() {resetHookCursor();return useContentForm({contentType:'science',defaultStyle:'flat',emptyInputMessage:'请输入主题'},()=> 'test');}
beforeEach(()=> {state.values=[];state.refs=[];state.start.mockReset().mockResolvedValue('new-task');state.push.mockReset();state.snapshot={config:{...createEmptyUserConfig(),llmConfigs:[{id:'text',name:'Text',provider:'custom',apiUrl:'http://localhost:8317',apiKey:'',model:'text',protocolType:'openai-compatible'}],activeLLMId:'text'},syncStatus:'saved',isLoaded:true};});
describe("creation submission boundary",()=>{
  it("defaults to script review and submits explicit valid selection even without default",async()=>{
    state.snapshot.config.activeLLMId=null;
    let form=useHarness();form.setSelectedLLMId('text');form=useHarness();await form.handleSubmit('topic');
    expect(state.start).toHaveBeenCalledWith(expect.objectContaining({llmConfigId:'text',presetSnapshot:expect.objectContaining({pauseAfterScript:true})}));
  });
  it("rechecks sync status at click time rather than trusting the rendered closure",async()=>{
    const form=useHarness();state.snapshot={...state.snapshot,syncStatus:'saving'};await form.handleSubmit('topic');expect(state.start).not.toHaveBeenCalled();
  });
  it("blocks malformed panel counts",async()=>{
    let form=useHarness();form.setCustomPanelCount('4garbage');form=useHarness();await form.handleSubmit('topic');expect(state.start).not.toHaveBeenCalled();
  });
  it("deduplicates same-tick clicks and allows a retry after failure",async()=>{
    let reject!:(e:Error)=>void;state.start.mockImplementationOnce(()=>new Promise((_resolve,no)=>{reject=no;}));
    const form=useHarness();const first=form.handleSubmit('topic');const second=form.handleSubmit('topic');expect(state.start).toHaveBeenCalledTimes(1);
    reject(new Error('test failure'));await Promise.all([first,second]);await form.handleSubmit('topic');expect(state.start).toHaveBeenCalledTimes(2);
  });
});
