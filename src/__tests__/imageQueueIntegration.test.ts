import http from 'node:http';
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
async function upstream() {
  const responses: http.ServerResponse[]=[];
  const server=http.createServer((req,res)=>{req.resume();responses.push(res);});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address() as {port:number};
  const finish=(index:number)=>{const response=responses[index];if(response&&!response.writableEnded){response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({data:[{b64_json:PNG}]}));}};
  return {responses,finish,url:`http://127.0.0.1:${address.port}`,close:()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());})};
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
