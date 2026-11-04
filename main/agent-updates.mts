// Release discovery is read-only. An updater is a dedicated PTY command,
// started only by the app's Update now action, never by a poll or terminal open.
import fs from 'node:fs';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {TaskTerminals,terminalEnv} from './task-terminals.mts';
import { harnessFor } from './harnesses.mts';
import { harnessDefinition } from '../shared/harness-definitions.mjs';
import type { HarnessConfig } from './harnesses/common.mts';
const exec=promisify(execFile);
export interface UpdatePlan { feed: string; format?: string; file?: string; args?: string[]; env?: NodeJS.ProcessEnv; name?: string; home?: string }
export interface Installation { engine: string; bin: string; real: string; home: string; version?: string; channel: string; disabled: boolean }
export interface UpdateEntry { engine: string; state: string; message?: string; checkedAt?: number; installed?: string; latest?: string }
export interface UpdateTerminals {
  resolve?: (engine: string) => unknown;
  open(engine: string): unknown;
  close(engine: string): unknown;
  get(engine: string): { exitPromise: Promise<unknown>; exitCode?: number | null };
  read(engine: string, offset?: number, wait?: number): unknown;
  write(engine: string, data: unknown): unknown;
  resize(engine: string, cols: unknown, rows: unknown): unknown;
  shutdown(): unknown;
}
export interface AgentUpdatesOptions {
  installation: (engine: string) => Promise<Installation>;
  latest?: (plan: UpdatePlan) => Promise<string>;
  refresh?: (engine: string) => Promise<unknown>;
  terminals?: UpdateTerminals;
  now?: () => number;
}
export interface TerminalAction { action?: string; offset?: number; wait?: number; data?: string; cols?: number; rows?: number }
const valid=(v:unknown):v is string=>typeof v==='string'&&/^\d+\.\d+\.\d+$/.test(v);
export function newerVersion(installed:unknown,latest:unknown){
 if(!valid(installed)||!valid(latest))return false;
 const a=installed.split('.').map(Number),b=latest.split('.').map(Number);
 for(let i=0;i<3;i++){if(b[i]!==a[i])return b[i]>a[i];}return false;
}
export function updatePlan({engine,bin,real,home=os.homedir(),channel='latest'}:{engine:string,bin:string,real:string,home?:string,channel?:string}){
 if(!harnessDefinition(engine))return null;
 return harnessFor(engine).updatePlan({bin,real,home,channel});
}
export async function installedAgent(engine:string,config:HarnessConfig):Promise<Installation>{
 const harness=harnessFor(engine), bin=harness.binary(config);
 if(!bin)throw Error('This agent is not installed.');
 const home=config.home||os.homedir();
 const settings=harness.updateSettings({home});
 const env=harness.launchEnv(bin,terminalEnv());
 // Version inspection must not itself auto-update anything.
 const {stdout}=await exec(bin,['--version'],{timeout:8000,maxBuffer:16384,env:{...env,DISABLE_AUTOUPDATER:'1'}});
 const version=stdout.match(/\b\d+\.\d+\.\d+(?:-[\w.-]+)?\b/)?.[0];
 const channel=settings.autoUpdatesChannel==='stable'?'stable':'latest';
 return {engine,bin,real:fs.realpathSync(bin),home,version,channel,disabled:settings.env?.DISABLE_UPDATES==='1'||process.env.DISABLE_UPDATES==='1'};
}
export async function latestRelease(plan:UpdatePlan):Promise<string>{
 const r=await fetch(plan.feed,{signal:AbortSignal.timeout(10000),headers:{Accept:plan.format==='text'?'text/plain':'application/json'}});
 if(!r.ok)throw Error('Release check failed.');
 const body=await r.text();if(body.length>2_000_000)throw Error('Release response too large.');
 const data:{version?:unknown,tag_name?:unknown}|null=plan.format==='text'?null:JSON.parse(body);
 const version=plan.format==='text'?body.trim():plan.format==='codex'?String(data!.version||data!.tag_name||'').replace(/^(rust-v|v)/,''):data!.version;
 if(!valid(version))throw Error('Release version could not be read.');return version;
}
export class AgentUpdates{
 declare installation:(engine:string)=>Promise<Installation>;
 declare latest:(plan:UpdatePlan)=>Promise<string>;
 declare refresh:(engine:string)=>Promise<unknown>;
 declare now:()=>number;
 declare entries:Map<string,UpdateEntry>;
 declare checks:Map<string,Promise<UpdateEntry>>;
 declare starts:Map<string,Promise<UpdateEntry>>;
 declare finishes:Map<string,Promise<void>>;
 declare plans:Map<string,UpdatePlan>;
 declare terminals:UpdateTerminals;
 constructor({installation,latest=latestRelease,refresh=async()=>{},terminals,now=()=>Date.now()}:AgentUpdatesOptions={} as AgentUpdatesOptions){
  this.installation=installation;this.latest=latest;this.refresh=refresh;this.now=now;this.entries=new Map();this.checks=new Map();this.starts=new Map();this.finishes=new Map();this.plans=new Map();
  this.terminals=terminals||new TaskTerminals({sweepMs:0});
  this.terminals.resolve=engine=>{const p=this.plans.get(engine);if(!p)throw Error('Click Update now first.');return {cwd:p.home,command:{file:p.file,args:p.args,env:p.env},notice:`Updating ${p.name}.`}};
 }
 status(engine:string):UpdateEntry{return this.entries.get(engine)||{engine,state:'unknown'};}
 check(engine:string,force=false):Promise<UpdateEntry>{
  if(!harnessDefinition(engine))return Promise.reject(Error('Unknown agent.'));
  if(this.starts.has(engine)||this.status(engine).state==='running')return Promise.resolve(this.status(engine));
  if(this.checks.has(engine))return this.checks.get(engine)!;
  const saved=this.status(engine);if(!force&&saved.checkedAt&&this.now()-saved.checkedAt<3600000)return Promise.resolve(saved);
  const work=(async()=>{let result:UpdateEntry;try{
   const install=await this.installation(engine);const plan=install.disabled?null:updatePlan(install);
   if(!plan)result={engine,state:'unsupported',message:'Update this installation using its own installer.'};
   else{const latest=await this.latest(plan);result={engine,state:newerVersion(install.version,latest)?'available':'current',installed:install.version,latest};if(!valid(install.version))throw Error('Installed version could not be read.');}
  }catch{result={engine,state:'unknown',message:'Could not check for updates. Your current models are still available.'};}
  result.checkedAt=this.now();if(this.starts.has(engine)||this.status(engine).state==='running')return this.status(engine);this.entries.set(engine,result);return result;})().finally(()=>this.checks.delete(engine));
  this.checks.set(engine,work);return work;
 }
 start(engine:string):Promise<UpdateEntry>{
  if(this.starts.has(engine))return this.starts.get(engine)!;
  if(this.status(engine).state==='running')return Promise.resolve(this.status(engine));
  // Validate again at click time: an installation may have changed since
  // the picker opened. Never trust a command or a release passed by the UI.
  const work=(async()=>{
   const install=await this.installation(engine);const plan=install.disabled?null:updatePlan(install);
   if(!plan)throw Error('This installation must be updated using its own installer.');
   const target=await this.latest(plan);
   if(!valid(install.version))throw Error('Installed version could not be read.');
   if(!newerVersion(install.version,target)){
    await this.refresh(engine);const current={engine,state:'current',installed:install.version,latest:target,checkedAt:this.now(),message:'Up to date. Available models refreshed.'};this.entries.set(engine,current);return current;
   }
   this.plans.set(engine,{...plan,home:install.home});this.terminals.close(engine);
   this.terminals.open(engine);
   const running={engine,state:'running',installed:install.version,latest:target};this.entries.set(engine,running);
   const finished=this.terminals.get(engine).exitPromise.then(async()=>{
    try{
     if(this.terminals.get(engine).exitCode!==0)throw Error('Update did not finish. You can retry.');
     const after=await this.installation(engine);
     if(!valid(after.version)||newerVersion(after.version,target))throw Error('The installed version is still older. Check the terminal output before retrying.');
     await this.refresh(engine);
     this.entries.set(engine,{engine,state:'current',installed:after.version,latest:target,checkedAt:this.now(),message:'Updated. Available models refreshed.'});
    }catch(error){this.entries.set(engine,{...running,state:'failed',message:(error as Error).message});}
   });this.finishes.set(engine,finished);return running;
  })().catch(error=>{this.entries.set(engine,{engine,state:'failed',message:error.message});throw error;}).finally(()=>this.starts.delete(engine));
  this.starts.set(engine,work);return work;
 }
 settled(engine:string){return this.finishes.get(engine)||Promise.resolve();}
 terminal(engine:string,p:TerminalAction){
  // Opening the viewer is never an install action, including after it ended.
  if(!this.plans.has(engine))throw Error('Click Update now first.');
  switch(p.action){
   case 'open':return this.terminals.read(engine,0);
   case 'read':return this.terminals.read(engine,p.offset,p.wait);
   case 'write':return this.terminals.write(engine,p.data);
   case 'resize':return this.terminals.resize(engine,p.cols,p.rows);
   case 'close':return this.terminals.close(engine);
   default:throw Error('Unknown terminal action.');
  }
 }
 shutdown(){return this.terminals.shutdown();}
}
