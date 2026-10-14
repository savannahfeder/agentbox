// Repeated transport failures posted the same recovery note as user messages eight times.
import {it,expect,vi} from 'vitest';
import {Supervisor} from '../main/supervisor.mjs';
import {createCodexWorker} from '../main/codex-session.mjs';
const sup=Object.create(Supervisor.prototype);
it('resumes with application context and no extra user message',()=>{
 const params=sup.codexTurnParamsFor({recovery:true,prompt:'Carry on from the interrupted step.',effort:'high'});
 expect(params.input).toEqual([]);
 expect(params.additionalContext.agentbox_resume).toEqual({kind:'application',value:'Carry on from the interrupted step.'});
 expect(params.effort).toBe('high');
});
it('keeps an actual new message and its images as user input',()=>{
 const params=sup.codexTurnParamsFor({prompt:'Change the heading',pictures:['/tmp/example.png']});
 expect(params.input).toEqual([{type:'text',text:'Change the heading'},{type:'localImage',path:'/tmp/example.png'}]);
 expect(params.additionalContext).toBeUndefined();
});
it('keeps attached images available during recovery',()=>{
 const params=sup.codexTurnParamsFor({recovery:true,prompt:'Read the attached picture',pictures:['/tmp/example.png']});
 expect(params.input).toEqual([{type:'localImage',path:'/tmp/example.png'}]);
});
it('reattaches to an already running recovery turn rather than steering it again',async()=>{
 let handlers;const server={resumeThread:vi.fn(async(_p,h)=>{handlers=h;return {thread:{turns:[{id:'live',status:'inProgress'}]}}}),startTurn:vi.fn(),unwatch:vi.fn()};
 const worker=createCodexWorker({server,resumeThreadId:'thread',turnParams:{input:[],additionalContext:{agentbox_resume:{kind:'application',value:'Continue'}}}});
 await new Promise(r=>setImmediate(r));
 expect(server.startTurn).not.toHaveBeenCalled();expect(worker.turnId).toBe('live');
 handlers.onNotification('turn/completed',{turn:{id:'live',status:'completed'}});
});
