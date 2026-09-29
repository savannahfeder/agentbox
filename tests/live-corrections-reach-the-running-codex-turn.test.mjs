// MP-04: corrections must use the running turn, not wait for worker exit.
// Assert accepted turn identity, stale/ended rejection and transport failure.
import {it,expect} from 'vitest';
import {createCodexWorker} from '../main/codex-session.mjs';
async function setup(){let handlers;const calls=[];const server={startThread:async(p,h)=>{handlers=h;return {threadId:'thread'};},startTurn:async()=>({turn:{id:'turn'}}),unwatch(){},steerTurn:async(...args)=>{calls.push(args);return {turnId:'turn'};}};
 const worker=createCodexWorker({server});worker.stderr.on('data',()=>{});await new Promise(r=>setImmediate(r));return {worker,server,calls,notify:(m,p)=>handlers.onNotification(m,p)};}
it('delivers a correction to exactly the active turn',async()=>{const s=await setup();await s.worker.steer('change direction');expect(s.calls).toEqual([['thread','turn','change direction']]);});
it('refuses ended turns and mismatched acceptance',async()=>{const s=await setup();s.server.steerTurn=async()=>({turnId:'other'});await expect(s.worker.steer('x')).rejects.toThrow();s.notify('turn/completed',{turn:{id:'turn',status:'completed'}});await expect(s.worker.steer('x')).rejects.toThrow();});
it('does not report success for transport failures',async()=>{const s=await setup();s.server.steerTurn=async()=>{throw Error('disconnected');};await expect(s.worker.steer('x')).rejects.toThrow('disconnected');});

it('sends the documented turn/steer frame through the real transport',async()=>{
 const {EventEmitter}=await import('node:events');
 const {createCodexAppServer}=await import('../main/codex-app-server.mjs');
 const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();child.kill=()=>{};
 let sent;child.stdin.write=(chunk,cb)=>{sent=JSON.parse(String(chunk));cb?.();return true;};
 const server=createCodexAppServer({transport:child});const pending=server.steerTurn('T','V','literal \\path\nsecond line');
 expect(sent.method).toBe('turn/steer');expect(sent.params).toEqual({threadId:'T',expectedTurnId:'V',input:[{type:'text',text:'literal \\path\nsecond line'}]});
 child.stdout.emit('data',JSON.stringify({id:sent.id,result:{turnId:'V'}})+'\n');await expect(pending).resolves.toEqual({turnId:'V'});server.close();
});
