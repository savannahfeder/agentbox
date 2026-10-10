// 2026-10-08: `/skill:some-skill` on a pi row was refused with "not
// supported in Agentbox yet". Pi expands `/skill:name` and Grok reads
// `/skill-name` from the message text, so both go through as typed.
import {it,expect,vi} from 'vitest';
import {taskCommand} from '../main/task-commands.mjs';
function fixture(engine) {
 return {store:{readItem:()=>({id:'one',product:'p'})},_engineFor:()=>engine,
 _nativeCommands:{},_compactions:{},_saveState:vi.fn(),onChange:vi.fn()};
}
it.each([['pi','/skill:some-skill draw the flow'],['grok','/some-skill draw the flow']])('forwards an unknown command on a %s row',async(engine,command)=>{
 expect((await taskCommand(fixture(engine),'p','one',command)).state).toBe('forward');
});
it('still refuses an unknown command on a Claude Code row',async()=>{
 expect((await taskCommand(fixture('claude'),'p','one','/skill:some-skill')).state).toBe('failed');
});
