// A reply that lands in the seconds after the agent's turn closed its input
// used to come back as "Error invoking remote method 'zero:answer': Error: The
// turn has ended. Send the message again to continue it.", with her words put
// back in the box on whatever screen she had moved on to (w-12730c6506). It is
// not a failed send. It is saved as an ordinary reply, left undelivered, so the
// session's exit or the next tick starts the run that carries it.
import {it,expect} from 'vitest';import {EventEmitter} from 'node:events';
import {attachClaudeInput,TURN_CLOSED} from '../main/claude-input.mjs';
import {submitReply} from '../main/live-replies.mjs';
function fake(){const c=new EventEmitter();c.stdout=new EventEmitter();c.stdin={writable:true,write:()=>true,end:()=>{c.stdin.writable=false;},on:()=>{}};return c;}
function supervisor(child){return {sessions:new Map([['w',{product:'p',child}]]),_handledAnswers:new Set(),_answerKey:i=>i.answer,_saveState(){}};}
it('marks a send after the result as too late, not as a failure',async()=>{const c=fake();attachClaudeInput(c);c.stdout.emit('data',JSON.stringify({type:'result'})+'\n');await expect(c.steer('late')).rejects.toMatchObject({code:TURN_CLOSED});});
it('marks a send the exiting process never took as too late',async()=>{const c=fake();attachClaudeInput(c);const p=c.steer('x');c.emit('exit',0);await expect(p).rejects.toMatchObject({code:TURN_CLOSED});});
it('saves the reply after the turn closed and leaves it for the next run',async()=>{const c=fake();attachClaudeInput(c);c.stdout.emit('data',JSON.stringify({type:'result'})+'\n');const s=supervisor(c);let saved=0;const item=await submitReply(s,{product:'p',id:'w',answer:'one more thing'},()=>{saved++;return {answer:'one more thing'};});expect(saved).toBe(1);expect(item).toMatchObject({product:'p',id:'w',answer:'one more thing'});expect(s._handledAnswers.size).toBe(0);expect(s.sessions.get('w').lastLiveReply).toBeUndefined();});
it('still refuses a real refusal on a running turn',async()=>{const c=fake();attachClaudeInput(c);const s=supervisor(c);let saved=0;await expect(submitReply(s,{product:'p',id:'w',answer:'x',permissionMode:'bypassPermissions'},()=>saved++)).rejects.toThrow('permissions');expect(saved).toBe(0);});
