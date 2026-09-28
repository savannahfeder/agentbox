// Migration parity, 2026-09-15: Codex had zero working slash commands.
// Compaction must target the existing thread, never send a prompt, and never
// confuse request acceptance or another thread's completion with success.
import { describe, it, expect, vi } from 'vitest';
import { compactCodexThread } from '../main/codex-compaction.mjs';
import { codexCommand } from '../shared/codex-commands.mjs';

const flush = async () => { for(let i=0;i<12;i++) await Promise.resolve(); };
function setup({busy=false,error=null}={}) {
 let handlers; const states=[];
 const server={
  request:vi.fn(async(method)=>{if(method==='thread/read')return {thread:{turns:busy?[{status:'inProgress'}]:[]}}; if(error)throw error; return {}; }),
  resumeThread:vi.fn(async(p,h)=>{handlers=h;return {thread:{id:p.threadId}};}),
  unwatch:vi.fn(), interruptTurn:vi.fn(async()=>({})),
 };
 const result=compactCodexThread({server,threadId:'thread-a',threadParams:{cwd:'/project'},onState:s=>states.push(s),timeoutMs:1000});
 return {server,states,result,closed:()=>handlers.onClosed(),event:(method,params)=>handlers.onNotification(method,params)};
}
describe('command recognition',()=>{
 it.each(['/compact',' /compact\n'])('recognizes %s',s=>expect(codexCommand(s)).toEqual({name:'compact',valid:true}));
 it.each(['/compact keep the API details','/compact\nplease edit it'])('preserves unsupported arguments: %s',s=>expect(codexCommand(s)).toEqual({name:'compact',valid:false}));
 it.each(['/compact/file','/compaction','read /compact','/model',null])('does not intercept %s',s=>expect(codexCommand(s)).toBe(null));
});
describe('compaction lifecycle',()=>{
 it('resumes the same thread and waits past acknowledgement for its own completed turn',async()=>{
  const t=setup();await flush();
  expect(t.server.resumeThread).toHaveBeenCalledWith(expect.objectContaining({threadId:'thread-a',cwd:'/project'}),expect.any(Object));
  expect(t.server.request).toHaveBeenCalledWith('thread/compact/start',{threadId:'thread-a'});
  expect(t.states).not.toContain('done');
  t.event('turn/started',{threadId:'thread-a',turn:{id:'compact-1'}});
  t.event('turn/completed',{threadId:'thread-b',turn:{id:'compact-1',status:'completed'}});
  t.event('turn/completed',{threadId:'thread-a',turn:{id:'old-turn',status:'completed'}});
  expect(t.states).not.toContain('done');
  t.event('turn/completed',{threadId:'thread-a',turn:{id:'compact-1',status:'completed'}});
  expect(await t.result).toBe('done');
  expect(t.server.request.mock.calls.every(([m])=>m!=='turn/start')).toBe(true);
  expect(t.server.unwatch).toHaveBeenCalledWith('thread-a');
 });
 it('does not compact a running conversation',async()=>{
  const t=setup({busy:true});expect(await t.result).toBe('busy');
  expect(t.server.resumeThread).not.toHaveBeenCalled();
  expect(t.server.request.mock.calls).toHaveLength(1);
 });
 it('reports unsupported methods without retrying or sending a prompt',async()=>{
  const t=setup({error:Object.assign(new Error('Method not found'),{code:-32601})});
  expect(await t.result).toBe('unavailable');
  expect(t.server.request.mock.calls.filter(([m])=>m==='thread/compact/start')).toHaveLength(1);
 });
 it('reports provider failure instead of claiming success',async()=>{
  const t=setup();await flush();t.event('turn/started',{threadId:'thread-a',turn:{id:'c'}});
  t.event('turn/completed',{threadId:'thread-a',turn:{id:'c',status:'failed'}});
  expect(await t.result).toBe('failed');
 });
});

import { Supervisor } from '../main/supervisor.mjs';
function supervisorFixture() {
 const sup=Object.create(Supervisor.prototype);
 const row={id:'w-1',product:'p'};
 sup.sessions=new Map();sup._compactionJobs=new Map();sup._compactions={};
 sup.store={readItem:()=>row,listProducts:()=>[{slug:'p',dir:'/project'}]};
 sup._engineFor=()=> 'codex';sup.isPersonal=()=>false;
 sup.rowSessionFor=()=>({sessionId:'thread-a',profile:'account-a'});
 sup._codexProfileHome=p=>'/profile/'+p;
 sup._saveState=vi.fn();sup.onChange=vi.fn();
 const server={request:vi.fn(async()=>new Promise(()=>{}))};
 sup._codexServer=vi.fn(()=>({client:server,handshake:Promise.resolve()}));
 sup._codexIsolation=async()=>[];
 sup.codexThreadParamsFor=()=>({cwd:'/project'});
 return {sup,row,server};
}
describe('task routing',()=>{
 it('refuses a busy task before connecting or changing its status',()=>{
  const {sup,server}=supervisorFixture();sup.sessions.set('w-1',{});
  expect(sup.compactItem('p','w-1').state).toBe('busy');
  expect(server.request).not.toHaveBeenCalled();
 });
 it('coalesces repeat clicks and uses the conversation account',async()=>{
  const {sup}=supervisorFixture();
  expect(sup.compactItem('p','w-1').state).toBe('running');
  expect(sup.compactItem('p','w-1').state).toBe('running');await flush();
  expect(sup._codexServer).toHaveBeenCalledTimes(1);
  expect(sup._codexServer).toHaveBeenCalledWith('/profile/account-a');
 });
 it('does not create a fresh conversation when the old one is missing',()=>{
  const {sup}=supervisorFixture();sup.rowSessionFor=()=>null;
  expect(sup.compactItem('p','w-1').state).toBe('missing');
  expect(sup._codexServer).not.toHaveBeenCalled();
 });
 it('leaves Claude tasks on the existing command path',()=>{
  const {sup}=supervisorFixture();sup._engineFor=()=> 'claude-code';
  expect(sup.compactItem('p','w-1').state).toBe('unavailable');
  expect(sup._codexServer).not.toHaveBeenCalled();
 });
});

import { slashRows } from '../renderer/src/slash-menu.ts';
describe('Codex slash menu',()=>{
 it('keeps compaction in the expanded command menu',()=>expect(slashRows('',false,false).filter(row=>row.kind==='command').map(row=>row.cmd.name)).toContain('compact'));
 it('filters compact without offering Claude permission modes',()=>{
  expect(slashRows('comp',false,false)).toHaveLength(1);
  expect(slashRows('plan',false,false)).toEqual([]);
  expect(slashRows(null,false,false)).toEqual([]);
 });
});

describe('lost connections and deadlines',()=>{
 it('finishes with failure when the connection closes after acceptance',async()=>{
  const t=setup();await flush();t.closed();expect(await t.result).toBe('failed');
 });
 it('interrupts only its own turn on timeout and never retries',async()=>{
  vi.useFakeTimers();
  try {
   const t=setup();await flush();t.event('turn/started',{threadId:'thread-a',turn:{id:'c'}});
   await vi.advanceTimersByTimeAsync(1001);
   expect(await t.result).toBe('failed');
   expect(t.server.interruptTurn).toHaveBeenCalledWith('thread-a','c');
   expect(t.server.request.mock.calls.filter(([m])=>m==='thread/compact/start')).toHaveLength(1);
  } finally {vi.useRealTimers();}
 });
});
