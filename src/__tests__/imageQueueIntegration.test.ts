import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import { vi } from 'vitest';
import { deleteTask, getTaskById, listTaskJobsByTaskId, saveConfig, upsertTask } from '@/lib/server/db';
import { createEmptyUserConfig } from '@/lib/config/userConfig';
import { enqueuePanelImageJobs, runTaskImageQueue } from '@/lib/server/taskOrchestrator/imageRunner';
import { pauseTaskJobs, resumeTaskJobs } from '@/lib/server/taskOrchestrator/reconcile';
import { readImageByKey } from '@/lib/server/imageStorage';
import type { GenerateTask } from '@/lib/types';

// Real HTTP + SQLite + image files, isolated by setup.ts. No model or credentials.
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY9sAAAAASUVORK5CYII=';
async function upstream(image = PNG) {
  const responses: http.ServerResponse[]=[];
  const requests: Record<string, unknown>[]=[];
  const server=http.createServer((req,res)=>{let body=""; req.on("data",chunk=>body+=chunk); req.on("end",()=>requests.push(JSON.parse(body))); responses.push(res);});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address() as {port:number};
  const finish=(index:number)=>{const response=responses[index];if(response&&!response.writableEnded){response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({data:[{b64_json:image}]}));}};
  return {responses,requests,finish,url:`http://127.0.0.1:${address.port}`,close:()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());})};
}
function createTask(id:string,count=3):GenerateTask {
  return {id,status:'script_ready',progress:30,createdAt:new Date(),updatedAt:new Date(),presetSnapshot:{presetId:'integration',imageConcurrency:2,lightCheckMode:'off'},script:{title:'Queue integration',topic:'Synthetic',style:'anime',panels:Array.from({length:count},(_,i)=>({id:i+1,scene:'Synthetic',dialogue:'',imagePrompt:`Panel ${i}`,status:'pending'}))}};
}
async function prepare(id:string,url:string,count=3) {
  saveConfig({...createEmptyUserConfig(),imageConfigs:[{id:'synthetic',name:'Synthetic HTTP',provider:'custom',model:'synthetic',apiUrl:url,apiKey:'',size:'1024x1024',endpointType:'images'}],activeImageId:'synthetic'});
  upsertTask(createTask(id,count));
  await enqueuePanelImageJobs(id,{panelIndices:Array.from({length:count},(_,i)=>i),imageConfigId:'synthetic'});
}
describe('image queue real storage and HTTP integration',()=>{
  it('does not count completed flags without image references as a finished comic',async()=>{
    const task=createTask('missing-image-flag',1);
    task.status='completed';task.script!.panels[0].status='completed';upsertTask(task);
    await enqueuePanelImageJobs(task.id,{panelIndices:[]});
    expect(getTaskById(task.id)?.status).toBe('script_ready');
    expect(getTaskById(task.id)?.progress).toBe(30);
  });
  it('persists multi-megabyte image responses without stack overflow',async()=>{
    const host=await upstream(randomBytes(4 * 1024 * 1024).toString('base64'));
    let running:Promise<void>|undefined;
    try {
      await prepare('large-image-integration',host.url,1);
      running=runTaskImageQueue('large-image-integration');
      await vi.waitFor(()=>expect(host.responses.length).toBe(1));
      host.finish(0); await running;
      const jobs=listTaskJobsByTaskId('large-image-integration');
      expect(jobs.map(job=>({status:job.status,error:job.lastError}))).toEqual([{status:'completed',error:undefined}]);
      expect(readImageByKey(jobs[0].outputFileKey!)).toBeTruthy();
    } finally {await host.close();await running?.catch(()=>{});}
  });
  it('preserves out-of-order parallel images, job files and completion through an independent SQLite reader',async()=>{
    const host=await upstream();let running:Promise<void>|undefined;
    try {
      await prepare('parallel-integration',host.url);
      running=runTaskImageQueue('parallel-integration');
      await vi.waitFor(()=>expect(host.responses.length).toBe(2));
      host.finish(1);
      await vi.waitFor(()=>expect(host.responses.length).toBe(3));
      expect(getTaskById('parallel-integration')?.script?.panels[1].status).toBe('completed');
      host.finish(2);host.finish(0);await running;
      const reader = new Database(path.join(process.env.COMICPEDIA_DATA_DIR!, 'comicpedia.db'), { readonly: true });
      try { expect(reader.prepare('SELECT status FROM tasks WHERE id = ?').get('parallel-integration')).toEqual({ status: 'completed' }); }
      finally { reader.close(); }
      const task=getTaskById('parallel-integration')!;
      expect(task.status).toBe('completed');expect(task.progress).toBe(100);
      const jobs=listTaskJobsByTaskId(task.id);
      expect(jobs).toHaveLength(3);
      for(const job of jobs){expect(job.status).toBe('completed');expect(readImageByKey(job.outputFileKey!)).toBeTruthy();expect(task.script!.panels[job.panelIndex!].imageUrl).toBe(`file://${job.outputFileKey}`);}
    } finally {await host.close();await running?.catch(()=>{});}
  });
  it('redraws through the queue with a new seed and preserves the previous image version',async()=>{
    const host=await upstream(); let running:Promise<void>|undefined;
    try {
      await prepare('redraw-integration',host.url,1);
      running=runTaskImageQueue('redraw-integration');
      await vi.waitFor(()=>expect(host.responses.length).toBe(1)); host.finish(0); await running;
      const original=getTaskById('redraw-integration')!.script!.panels[0].imageUrl!;
      const oldKey=listTaskJobsByTaskId('redraw-integration')[0].outputFileKey!;
      const beforeRedraw=getTaskById('redraw-integration')!;beforeRedraw.visualDiagnosisStale=false;beforeRedraw.visualDiagnosisReport={schemaVersion:1,generatedAt:new Date().toISOString(),sourceEvaluatedAt:new Date().toISOString(),model:{},summary:{problemPanelCount:0,highSeverityCount:0,actionableCount:0,crossPanelIssueCount:0},panels:[]};upsertTask(beforeRedraw);
      await enqueuePanelImageJobs('redraw-integration',{panelIndices:[0],imageConfigId:'synthetic',seedOverride:42});
      running=runTaskImageQueue('redraw-integration');
      await vi.waitFor(()=>expect(host.responses.length).toBe(2)); host.finish(1); await running;
      expect(host.requests[1].seed).toBe(42);
      const task=getTaskById('redraw-integration')!;
      expect(task.status).toBe('completed');
      expect(task.visualDiagnosisStale).toBe(true);
      expect(task.script!.panels[0].imageUrl).not.toBe(original);
      expect(task.script!.panels[0].imageVersions?.map(v=>v.imageUrl)).toContain(original);
      expect(readImageByKey(oldKey)).toBeTruthy();
    } finally {await host.close();await running?.catch(()=>{});}
  });
  it('retries only failed panels and keeps successful image files unchanged',async()=>{
    const host=await upstream(); let running:Promise<void>|undefined;
    const log=vi.spyOn(console,'error').mockImplementation(()=>{});
    try {
      await prepare('failed-retry-integration',host.url,2);
      running=runTaskImageQueue('failed-retry-integration');
      await vi.waitFor(()=>expect(host.responses.length).toBe(2));
      host.finish(0); host.responses[1].writeHead(503); host.responses[1].end('Synthetic upstream failure'); await running;
      const paused=getTaskById('failed-retry-integration')!;
      const original=paused.script!.panels[0].imageUrl;
      expect(paused.status).toBe('image_queue_paused');
      expect(paused.script!.panels[1].status).toBe('failed');
      await enqueuePanelImageJobs(paused.id,{panelIndices:[1],imageConfigId:'synthetic'});
      expect(getTaskById(paused.id)!.script!.panels[1].status).toBe('pending');
      running=runTaskImageQueue(paused.id);
      await vi.waitFor(()=>expect(host.responses.length).toBe(3)); host.finish(2); await running;
      const completed=getTaskById(paused.id)!;
      expect(completed.status).toBe('completed');
      expect(completed.script!.panels[0].imageUrl).toBe(original);
      expect(listTaskJobsByTaskId(paused.id).map(job=>job.attemptCount)).toEqual([1,2]);
    } finally {log.mockRestore();await host.close();await running?.catch(()=>{});}
  });
  it('honors real pause/resume transitions without issuing the waiting request',async()=>{
    const host=await upstream();let running:Promise<void>|undefined;
    try {
      await prepare('pause-integration',host.url);
      running=runTaskImageQueue('pause-integration');
      await vi.waitFor(()=>expect(host.responses.length).toBe(2));
      await pauseTaskJobs('pause-integration');host.finish(0);host.finish(1);await running;
      expect(host.responses.length).toBe(2);expect(getTaskById('pause-integration')?.status).toBe('image_queue_paused');
      await resumeTaskJobs('pause-integration');running=runTaskImageQueue('pause-integration');
      await vi.waitFor(()=>expect(host.responses.length).toBe(3));host.finish(2);await running;
      expect(getTaskById('pause-integration')?.status).toBe('completed');
    } finally {await host.close();await running?.catch(()=>{});}
  });
  it('does not recreate a deleted task or jobs when active HTTP responses arrive',async()=>{
    const host=await upstream();let running:Promise<void>|undefined;
    try {
      await prepare('delete-integration',host.url);
      running=runTaskImageQueue('delete-integration');
      await vi.waitFor(()=>expect(host.responses.length).toBe(2));
      expect(deleteTask('delete-integration')).toBe(true);
      host.finish(0);host.finish(1);await running;
      expect(host.responses.length).toBe(2);
      expect(getTaskById('delete-integration')).toBeNull();expect(listTaskJobsByTaskId('delete-integration')).toEqual([]);
    } finally {await host.close();await running?.catch(()=>{});}
  });
});
