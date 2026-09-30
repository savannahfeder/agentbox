// w-a501410ca1: the approved top row may check releases but never install
// until clicked. Exercise wrong installations, version edges, retries and
// duplicate clicks without updating the test machine.
import {it,expect,vi} from 'vitest';
import {updatePlan,newerVersion,AgentUpdates} from '../main/agent-updates.mjs';
import {TaskTerminals} from '../main/task-terminals.mjs';
import {rememberCodexModels,codexModels,codexKnownSlugs,codexModelLevels} from '../main/codex-models.mjs';
const native={engine:'claude',bin:'/home/me/.local/bin/claude',real:'/home/me/.local/share/claude/versions/2.1.1',home:'/home/me'};
it('targets the actual native agent and does not guess a manager for a custom binary',()=>{
 expect(updatePlan(native)).toMatchObject({file:native.bin,args:['update']});
 expect(updatePlan({...native,real:'/custom/claude'})).toBeNull();
 expect(updatePlan({...native,engine:'unknown'})).toBeNull();
});
it('keeps npm and Homebrew updates within the detected installation',()=>{
 const npm=updatePlan({...native,engine:'codex',bin:'/opt/node/bin/codex',real:'/opt/node/lib/node_modules/@openai/codex/bin/codex.js'});
 expect(npm.file).toBe('/opt/node/bin/npm');expect(npm.args).toEqual(['install','--global','--prefix','/opt/node','@openai/codex@latest']);
 const brew=updatePlan({...native,real:'/opt/homebrew/Caskroom/claude-code@latest/2.1.1/claude'});
 expect(brew.file).toBe('/opt/homebrew/bin/brew');expect(brew.args).toEqual(['upgrade','--cask','claude-code@latest']);
});
it('uses the selected standalone Codex home and launcher directory',()=>{
 const p=updatePlan({...native,engine:'codex',bin:'/home/me/bin/codex',real:'/home/me/.codex-2/packages/standalone/releases/0.1.0/codex'});
 expect(p.env.CODEX_HOME).toBe('/home/me/.codex-2');expect(p.env.CODEX_INSTALL_DIR).toBe('/home/me/bin');
});
it('only offers a strictly newer stable version, numerically',()=>{
 expect(newerVersion('2.1.9','2.1.10')).toBe(true);
 for(const [a,b] of [['2.1.10','2.1.10'],['2.2.0','2.1.99'],['broken','2.2.0'],['2.1.1-beta','2.1.2'],['2.1.1','2.1.2-beta']])expect(newerVersion(a,b)).toBe(false);
});
function setup(){let version='2.1.1';let finish;const pty={pid:0,process:'claude',onData:vi.fn(),onExit:fn=>finish=fn,write:vi.fn(),kill:vi.fn()};const spawn=vi.fn(()=>pty);const terminals=new TaskTerminals({spawn,sweepMs:0,disposeProcess:()=>{finish({exitCode:130})}});const refresh=vi.fn(async()=>{});const m=new AgentUpdates({terminals,installation:async()=>({...native,version}),latest:async()=> '2.1.2',refresh});return {m,spawn,refresh,finish:(code)=>finish({exitCode:code}),upgrade:()=>version='2.1.2'};}
it('checking never spawns an updater and simultaneous clicks start just one',async()=>{
 const s=setup();expect((await s.m.check('claude')).state).toBe('available');expect(s.spawn).not.toHaveBeenCalled();
 await Promise.all([s.m.start('claude'),s.m.start('claude')]);expect(s.spawn).toHaveBeenCalledTimes(1);
 expect(s.spawn.mock.calls[0].slice(0,2)).toEqual([native.bin,['update']]);
 s.upgrade();s.finish(0);await s.m.settled('claude');expect(s.refresh).toHaveBeenCalledTimes(1);expect(s.m.status('claude').state).toBe('current');
});
it('a failed command keeps its output and can be retried',async()=>{
 const s=setup();await s.m.start('claude');s.finish(2);await s.m.settled('claude');expect(s.m.status('claude').state).toBe('failed');expect(s.refresh).not.toHaveBeenCalled();
 await s.m.start('claude');expect(s.spawn).toHaveBeenCalledTimes(2);
});
it('exit zero alone never claims the installed version was updated',async()=>{
 const s=setup();await s.m.start('claude');s.finish(0);await s.m.settled('claude');expect(s.m.status('claude').state).toBe('failed');
});
it('cannot start through a terminal read or install after a failed release check',async()=>{
 const s=setup();expect(()=>s.m.terminal('claude',{action:'open'})).toThrow();
 s.m.latest=async()=>{throw Error('offline')};expect((await s.m.check('claude',true)).state).toBe('unknown');await expect(s.m.start('claude')).rejects.toThrow();expect(s.spawn).not.toHaveBeenCalled();
});
it('does not offer disabled or unrecognised installations for updating',async()=>{
 const s=setup();s.m.installation=async()=>({...native,version:'2.1.1',disabled:true});expect((await s.m.check('claude')).state).toBe('unsupported');await expect(s.m.start('claude')).rejects.toThrow();expect(s.spawn).not.toHaveBeenCalled();
});
it('refresh failure reports the limitation instead of claiming refreshed models',async()=>{
 const s=setup();s.refresh.mockRejectedValue(Error('Cannot refresh models right now.'));await s.m.start('claude');s.upgrade();s.finish(0);await s.m.settled('claude');expect(s.m.status('claude')).toMatchObject({state:'failed',message:'Cannot refresh models right now.'});
});
it('retry after a successful install only refreshes models rather than reinstalling',async()=>{
 const s=setup();s.refresh.mockRejectedValueOnce(Error('offline'));await s.m.start('claude');s.upgrade();s.finish(0);await s.m.settled('claude');expect(s.m.status('claude').state).toBe('failed');await s.m.start('claude');expect(s.m.status('claude').state).toBe('current');expect(s.spawn).toHaveBeenCalledTimes(1);expect(s.refresh).toHaveBeenCalledTimes(2);
});
it('cancelled updates do not become successful or automatically restart',async()=>{
 const s=setup();await s.m.start('claude');s.m.terminal('claude',{action:'close'});await s.m.settled('claude');expect(s.m.status('claude').state).toBe('failed');expect(()=>s.m.terminal('claude',{action:'open'})).toThrow();expect(s.spawn).toHaveBeenCalledTimes(1);
});
it('fresh account models reach both picker and spawn validation without changing defaults',()=>{
 const home='/test/fresh-codex-catalog';rememberCodexModels(home,[{model:'future-model',displayName:'Future model',hidden:false,defaultReasoningEffort:'medium',supportedReasoningEfforts:[{reasoningEffort:'medium'}]},{model:'hidden-model',hidden:true}]);
 expect(codexModels({home}).map(m=>m.id)).toEqual(['future-model']);expect(codexKnownSlugs({home}).has('future-model')).toBe(true);expect(codexKnownSlugs({home}).has('hidden-model')).toBe(true);expect(codexModelLevels('future-model',{home})).toEqual(['medium']);
 expect(codexModels({home:'/test/another-account',read:()=>null})).toEqual([]);
});
