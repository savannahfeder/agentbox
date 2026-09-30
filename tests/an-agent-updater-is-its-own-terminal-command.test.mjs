// The update PTY must report the command's exit, not a persistent shell's
// lifetime. This runs a harmless local shell script, never a real updater.
import {it,expect} from 'vitest';
import {TaskTerminals} from '../main/task-terminals.mjs';
it('captures a real command exit and leaves the unrelated task shell alive',async()=>{
 const m=new TaskTerminals({sweepMs:0,resolve:key=>key==='update'?{cwd:'/private/tmp',command:{file:'/bin/sh',args:['-c','printf "update-test-output\\n"; exit 7']}}:'/private/tmp'});
 try{m.open('task');m.open('update');await m.get('update').exitPromise;expect(m.read('update',0)).toMatchObject({exited:true,exitCode:7});expect(m.read('update',0).data).toContain('update-test-output');expect(m.read('task',0).exited).toBe(false);}finally{await m.shutdown();}
});
