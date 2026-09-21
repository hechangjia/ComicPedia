import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerateTask } from "@/lib/types";

function value(status: GenerateTask["status"]): GenerateTask {
 return { id:"poll-restart", origin:"user", status, progress:100, createdAt:new Date(),updatedAt:new Date(),script:{title:"test",topic:"test",style:"flat",panels:[]} };
}

const runtime = vi.hoisted(() => ({ hooks: {} as Record<string, (...args: any[]) => any>, read: vi.fn(), store: {} as any }));
vi.mock("react", () => ({
  useState: (...args: any[]) => runtime.hooks.useState(...args),
  useRef: (...args: any[]) => runtime.hooks.useRef(...args),
  useEffect: (...args: any[]) => runtime.hooks.useEffect(...args),
}));
vi.mock("@/lib/client/db", () => ({ getTask: (...args: any[]) => runtime.read(...args) }));
vi.mock("@/lib/client/generator", () => ({ recoverZombieTask: vi.fn() }));
vi.mock("@/hooks/useTaskPageLifecycle", () => ({ reconcileTaskLifecycle: vi.fn(), shouldAttemptOffPageReconcile: () => false }));
vi.mock("@/stores/taskStore", () => ({ useTaskStore: Object.assign((selector: any) => selector(runtime.store), { getState: () => runtime.store }) }));
// This test runs the hook in an explicit effect/state harness, not a DOM renderer.
import { useTaskSubscription as subscriptionUnderTest } from "@/hooks/useTaskSubscription";

async function harness(initial: GenerateTask, read: (...args: unknown[]) => unknown) {
 const states: unknown[]=[];const refs: {current:unknown}[]=[];
 const effects: {deps?:unknown[];cleanup?:()=>void}[]=[];
 let sc=0,rc=0,ec=0;let pending:(()=>void)[]=[];
 const store={tasks:{[initial.id]:initial}};
 const update=vi.fn((task:GenerateTask)=>{store.tasks[task.id]=task;});
 runtime.hooks={
  useState:(v:unknown)=>{const i=sc++;if(!(i in states))states[i]=v;return[states[i],(next:unknown)=>{states[i]=typeof next==='function'?next(states[i]):next;}];},
  useRef:(v:unknown)=>refs[rc++]??(refs[rc-1]={current:v}),
  useEffect:(fn:()=>void|(()=>void),deps:unknown[])=>{const i=ec++;const previous=effects[i];if(!previous||deps.some((v,j)=>!Object.is(v,previous.deps?.[j])))pending.push(()=>{previous?.cleanup?.();effects[i]={deps,cleanup:fn()||undefined};});},
 };
 runtime.read.mockImplementation((...args: unknown[]) => read(...args));
 runtime.store={...store,loadTask:async()=>initial,updateTask:update};
 function render(){sc=rc=ec=0;pending=[];const result=subscriptionUnderTest(initial.id);pending.forEach(fn=>fn());return result;}
 render();await Promise.resolve();await Promise.resolve();render();
 return {render,update,store,unmount:()=>effects.forEach(e=>e.cleanup?.())};
}

describe("durable task polling lifecycle",()=>{
 beforeEach(()=>{vi.useFakeTimers();});
 afterEach(()=>{vi.useRealTimers();});
 it("restarts polling when an already completed task enters deep review",async()=>{
  const read=vi.fn().mockResolvedValue(value("completed"));const h=await harness(value("completed"),read);
  await vi.advanceTimersByTimeAsync(8000);expect(read).not.toHaveBeenCalled();
  h.render().setTask(value("deep_review_running"));h.render();
  await vi.advanceTimersByTimeAsync(2000);
  expect(read).toHaveBeenCalledTimes(1);expect(h.update).toHaveBeenCalledWith(expect.objectContaining({status:"completed"}));h.unmount();
 });
 it("does not publish a stopped polling request over a newer paused snapshot",async()=>{
  let resolve!:(t:GenerateTask)=>void;
  const read=vi.fn(()=>new Promise<GenerateTask>(r=>{resolve=r;}));const h=await harness(value("deep_review_running"),read);
  await vi.advanceTimersByTimeAsync(2000);expect(read).toHaveBeenCalledTimes(1);
  h.render().setTask(value("deep_review_paused"));h.render();
  resolve(value("deep_review_running"));await Promise.resolve();await Promise.resolve();
  expect(h.update).not.toHaveBeenCalled();h.unmount();
 });
 it("ignores responses after unmount",async()=>{
  let resolve!:(t:GenerateTask)=>void;
  const read=vi.fn(()=>new Promise<GenerateTask>(r=>{resolve=r;}));const h=await harness(value("deep_review_running"),read);
  await vi.advanceTimersByTimeAsync(2000);h.unmount();resolve(value("completed"));await Promise.resolve();await Promise.resolve();expect(h.update).not.toHaveBeenCalled();
 });
});
