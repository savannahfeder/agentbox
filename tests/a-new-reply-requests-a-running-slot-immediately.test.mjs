// A saved reply could sit behind unrelated projects for hours although Run now
// already knew how to make room and resume the displaced session afterwards.
import {it,expect,vi} from 'vitest';
import {submitReply} from '../main/live-replies.mjs';
it('requests Run now after the reply has been saved',async()=>{
 const order=[];const supervisor={sessions:new Map(),runNow:vi.fn(()=>order.push('start'))};
 await submitReply(supervisor,{product:'p',id:'w',answer:'Yes, continue.'},()=>{order.push('saved');return {id:'w',answer:'Yes, continue.'}});
 expect(order).toEqual(['saved','start']);expect(supervisor.runNow).toHaveBeenCalledWith('p','w');
});
it('does not start done, empty, withdrawn or unsuccessfully saved replies',async()=>{
 const supervisor={sessions:new Map(),runNow:vi.fn()};
 for(const payload of [{answer:'Done',status:'done'},{answer:''},{answer:'  '},{answer:'(withdrawn)'}])
  await submitReply(supervisor,{product:'p',id:'w',...payload},()=>({id:'w'}));
 await expect(submitReply(supervisor,{product:'p',id:'w',answer:'Go'},()=>{throw Error('disk full')})).rejects.toThrow('disk full');
 expect(supervisor.runNow).not.toHaveBeenCalled();
});
it('does not preempt a turn that accepted live context',async()=>{
 const supervisor={sessions:new Map([['w',{product:'p',child:{steer:vi.fn()}}]]),runNow:vi.fn(),_handledAnswers:new Set(),_answerKey:()=> 'key',_saveState(){}};
 await submitReply(supervisor,{product:'p',id:'w',answer:'Also check this.'},()=>({id:'w'}));
 expect(supervisor.runNow).not.toHaveBeenCalled();
});
