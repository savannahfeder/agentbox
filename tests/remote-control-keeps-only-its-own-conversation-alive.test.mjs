// MP-06: a result currently closes Claude stdin. Remote continuation must keep
// precisely the opted-in process alive, correlate replies, and never trust a
// provider-supplied URL outside Claude. Ordinary sessions still close normally.
import {it,expect} from 'vitest';
import {EventEmitter} from 'node:events';
import {attachClaudeInput} from '../main/claude-input.mjs';
function fake(){const c=new EventEmitter();c.stdout=new EventEmitter();c.stdin=new EventEmitter();c.frames=[];c.stdin.writable=true;c.stdin.write=s=>c.frames.push(JSON.parse(s));c.stdin.end=()=>c.stdin.writable=false;c.event=x=>c.stdout.emit('data',JSON.stringify(x)+'\n');return c;}
it('holds an opted-in session across results and releases it when disabled',()=>{const c=attachClaudeInput(fake());c.holdInput(true);c.event({type:'result'});expect(c.stdin.writable).toBe(true);c.holdInput(false);expect(c.stdin.writable).toBe(false);});
it('does not hold unrelated sessions',()=>{const a=attachClaudeInput(fake()),b=attachClaudeInput(fake());a.holdInput(true);b.event({type:'result'});expect(b.stdin.writable).toBe(false);expect(a.stdin.writable).toBe(true);});
it('correlates control replies and surfaces provider errors',async()=>{const c=attachClaudeInput(fake());const p=c.control({subtype:'remote_control',enabled:true});const id=c.frames[0].request_id;c.event({type:'control_response',response:{request_id:'other',subtype:'success'}});c.event({type:'control_response',response:{request_id:id,subtype:'error',error:'Sign in again'}});await expect(p).rejects.toThrow('Sign in again');});
it('rejects control operations after exit',async()=>{const c=attachClaudeInput(fake());const p=c.control({subtype:'initialize'});c.emit('exit',1);await expect(p).rejects.toThrow();await expect(c.control({subtype:'remote_control',enabled:true})).rejects.toThrow();});
it('publishes only unmatched top-level text user messages as remote input',async()=>{const c=attachClaudeInput(fake());const got=[];c.on('remote-user',x=>got.push(x));c.holdInput(true);const p=c.steer('local');c.event({type:'user',uuid:c.frames[0].uuid,message:{content:'local'}});await p;c.event({type:'user',uuid:'tool',message:{content:[{type:'tool_result',content:'not a message'}]}});c.event({type:'user',uuid:'remote',message:{content:'phone'}});expect(got.map(x=>x.message.content)).toEqual(['phone']);});
