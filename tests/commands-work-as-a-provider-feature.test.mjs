// 2026-09-16: migration parity was reduced to one Codex command. Measure the
// whole command family, argument boundaries, and native dispatch (never an LLM
// imitation), including refusal without losing a draft or widening permissions.
import { describe, it, expect, vi } from 'vitest';
import { providerCommand, CODEX_COMMANDS } from '../shared/provider-commands.mjs';
import { runCodexCommand } from '../main/provider-commands.mjs';
import { commandPrompt } from '../shared/claude-commands.mjs';
describe('provider command routing',()=>{
 it.each(['model','effort','status','usage','skills','mcp','goal','review','diff','rename','copy','help','compact'])('offers /%s for Codex',name=>expect(CODEX_COMMANDS.some(c=>c.name===name)).toBe(true));
 it('preserves quoted and multiline arguments',()=>expect(providerCommand('/review check "x"\nand y','codex')).toMatchObject({name:'review',args:'check "x"\nand y'}));
 it.each(['/tmp/file','please /status','/status.json',null])('does not intercept paths or prose %s',text=>expect(providerCommand(text,'codex')).toBe(null));
 it('recognizes unavailable native commands without inventing a prompt',()=>expect(providerCommand('/remote-control','codex')).toMatchObject({route:'unavailable'}));
 it('keeps aliases provider-specific',()=>{expect(providerCommand('/cost','claude-code')).toMatchObject({name:'usage'});expect(providerCommand('/cost','codex')).toMatchObject({route:'unavailable'});});
 it.each(['advisor','autocompact','output-style','recap','reload-skills','list-agents'])('passes the native Claude /%s without its task brief',name=>expect(commandPrompt('/'+name)).toBe('/'+name));
});
function setup(){return {server:{request:vi.fn(async(method)=> method==='thread/goal/get'?{goal:{objective:'Ship',status:'paused',tokensUsed:8}}:method==='skills/list'?{data:[{skills:[{name:'test',description:'Test things',enabled:true}],errors:[]}]}:{} )},threadId:'same-thread',cwd:'/project'};}
describe('Codex operations',()=>{
 it('reads goals on the same thread',async()=>{const t=setup();expect(await runCodexCommand({...t,name:'goal',args:''})).toContain('Ship');expect(t.server.request).toHaveBeenCalledWith('thread/goal/get',{threadId:'same-thread'});});
 it('refuses goal creation before it can start unmanaged work',async()=>{const t=setup();await expect(runCodexCommand({...t,name:'goal',args:'Ship $(not a shell)'})).rejects.toThrow('worker lifecycle');expect(t.server.request).not.toHaveBeenCalled();});
 it('pauses and clears through native operations',async()=>{const t=setup();await runCodexCommand({...t,name:'goal',args:'pause'});await runCodexCommand({...t,name:'goal',args:'clear'});expect(t.server.request).toHaveBeenCalledWith('thread/goal/set',{threadId:'same-thread',status:'paused'});expect(t.server.request).toHaveBeenCalledWith('thread/goal/clear',{threadId:'same-thread'});});
 it('discovers skills for the task directory',async()=>{const t=setup();expect(await runCodexCommand({...t,name:'skills',args:''})).toContain('test');expect(t.server.request).toHaveBeenCalledWith('skills/list',{cwds:['/project'],forceReload:true});});
 it('refuses arguments that would otherwise silently do nothing',async()=>{const t=setup();await expect(runCodexCommand({...t,name:'skills',args:'delete all'})).rejects.toThrow('on its own');expect(t.server.request).not.toHaveBeenCalled();});
 it('does not implement permission changes or shell execution accidentally',async()=>{const t=setup();await expect(runCodexCommand({...t,name:'permissions',args:'full-access'})).rejects.toThrow();expect(t.server.request).not.toHaveBeenCalled();});
});

import { nativeCommandNames, reviewTarget } from '../shared/provider-commands.mjs';
import { taskCommand } from '../main/task-commands.mjs';
import { Supervisor } from '../main/supervisor.mjs';
describe('native discovery and arguments',()=>{
 it('discovers custom and bundled commands without admitting lifecycle/internal commands',()=>{
  const names=nativeCommandNames({type:'system',subtype:'init',slash_commands:['code-review','my-plugin:check','clear','__remote-workflow','code-review','/tmp/file']});
  expect(names).toEqual(['code-review','my-plugin:check']);
  expect(commandPrompt('/my-plugin:check keep \\slashes\nand "quotes"',names)).toBe('/my-plugin:check keep \\slashes\nand "quotes"');
  expect(commandPrompt('/not-advertised',names)).toBe(null);
 });
 it('accepts Claude’s review alias only when code-review was advertised',()=>{
  expect(commandPrompt('/review check it',['code-review'])).toBe('/code-review check it');
  expect(commandPrompt('/review check it',[])).toBe(null);
 });
 it('keeps review targets native and rejects incomplete flags',()=>{
  expect(reviewTarget('--base main')).toEqual({type:'baseBranch',branch:'main'});
  expect(reviewTarget('--commit abc123')).toEqual({type:'commit',sha:'abc123'});
  expect(()=>reviewTarget('--base')).toThrow();
  expect(()=>reviewTarget('--base ')).toThrow();
 });
});
function taskFixture(engine='codex') {
 const item={id:'one',product:'p',model:'sonnet'};
 const writes=vi.fn((dir,id,patch)=>Object.assign(item,patch));
 const sup={store:{readItem:()=>item,listProducts:()=>[{slug:'p',dir:'/project'}],productDir:()=>'/project',modules:{workItemsDisk:{updateWorkItem:writes}}},sessions:new Map(),_compactionJobs:new Map(),_compactions:{},_nativeCommands:{one:['code-review','my-plugin:check']},_engineFor:()=>engine,isPersonal:()=>false,rowSessionFor:()=>({sessionId:'thread-a',profile:'account-a'}),_codexProfileHome:p=>'/profile/'+p,_codexWorkspaceModel:()=>null,_codexHome:()=>'/profile/account-a',_saveState:vi.fn(),onChange:vi.fn(),codexUsage:()=>null};
 const server={request:vi.fn(async()=>({thread:{id:'thread-a',cwd:'/project',turns:[],status:{type:'idle'}}}))};
 sup._codexServer=vi.fn(()=>({client:server,handshake:Promise.resolve()}));
 return {sup,item,writes,server};
}
describe('task command persistence and isolation',()=>{
 it('persists model and effort through the store without sending an agent message',async()=>{
  const {sup,writes,item}=taskFixture('claude-code');
  expect((await taskCommand(sup,'p','one','/model opus')).state).toBe('done');
  expect((await taskCommand(sup,'p','one','/effort high')).state).toBe('done');
  expect(item).toMatchObject({model:'opus',effort:'high'});
  expect(writes).toHaveBeenCalledWith('/project','one',{model:'opus'},{source:'founder'});
  expect(sup._codexServer).not.toHaveBeenCalled();
 });
 it('does not write unrecognized models or effort',async()=>{
  const {sup,writes}=taskFixture('claude-code');
  expect((await taskCommand(sup,'p','one','/model not-a-model')).state).toBe('failed');
  expect((await taskCommand(sup,'p','one','/effort banana')).state).toBe('failed');
  expect(writes).not.toHaveBeenCalled();
 });
 it('uses the saved account and thread for native reads',async()=>{
  const {sup,server}=taskFixture();await taskCommand(sup,'p','one','/status');
  expect(sup._codexServer).toHaveBeenCalledWith('/profile/account-a');
  expect(server.request).toHaveBeenCalledWith('thread/read',{threadId:'thread-a',includeTurns:true});
  expect(sup._compactionJobs.size).toBe(0);
 });
 it('rejects busy tasks without replacing the conversation or starting a process',async()=>{
  const {sup}=taskFixture();sup.sessions.set('one',{});
  expect((await taskCommand(sup,'p','one','/goal replace it')).state).toBe('busy');
  expect(sup._codexServer).not.toHaveBeenCalled();
 });
 it('forwards discovered custom Claude commands and no unadvertised ones',async()=>{
  const {sup}=taskFixture('claude-code');
  expect((await taskCommand(sup,'p','one','/my-plugin:check now')).state).toBe('forward');
  expect((await taskCommand(sup,'p','one','/invented now')).state).toBe('failed');
 });
 it('refuses compaction arguments at the main-process boundary too',async()=>{
  const {sup}=taskFixture();sup.compactItem=vi.fn();
  expect((await taskCommand(sup,'p','one','/compact keep this')).state).toBe('failed');
  expect(sup.compactItem).not.toHaveBeenCalled();
 });
 it('maps review to a native operation and leaves ordinary prompts intact',()=>{
  const sup=Object.create(Supervisor.prototype);
  expect(sup.codexTurnParamsFor({reviewTarget:{type:'uncommittedChanges'}})).toEqual({reviewTarget:{type:'uncommittedChanges'}});
  expect(sup.codexTurnParamsFor({prompt:'hello'})).toEqual({input:[{type:'text',text:'hello'}]});
 });
});
describe('commands during a response',()=>{
 it('can inspect status while this task is running without changing the turn',async()=>{
  const {sup,server}=taskFixture();sup.sessions.set('one',{});
  expect((await taskCommand(sup,'p','one','/status')).state).toBe('done');
  expect(server.request.mock.calls.map(c=>c[0])).toEqual(['thread/read']);
 });
 it('copies only the latest completed response, not in-progress text',async()=>{
  const server={request:async()=>({thread:{turns:[{status:'completed',items:[{type:'agentMessage',text:'finished'}]},{status:'inProgress',items:[{type:'agentMessage',text:'partial'}]}]}})};
  expect(await runCodexCommand({server,threadId:'a',name:'copy'})).toBe('finished');
 });
});
import { compactCodexThread } from '../main/codex-compaction.mjs';
it('does not wake an active goal just to compact a dormant thread',async()=>{
 const server={request:vi.fn(async method=>method==='thread/goal/get'?{goal:{status:'active'}}:{thread:{turns:[],status:{type:'idle'}}}),resumeThread:vi.fn(),unwatch:vi.fn(),interruptTurn:vi.fn()};
 expect(await compactCodexThread({server,threadId:'a',timeoutMs:1})).toBe('busy');
 expect(server.resumeThread).not.toHaveBeenCalled();
});
