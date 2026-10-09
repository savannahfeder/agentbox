// Real PTY integration: literal quoting, interactive stdin, shell failures,
// resize, task isolation and descendant cleanup must work without an agent.
import {it,expect} from 'vitest';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {TaskTerminals,terminalEnv} from '../main/task-terminals.mjs';
async function until(fn){const end=Date.now()+7000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('Timed out waiting for terminal output');}
it('runs literal, interactive and failing commands in a directory with spaces',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'real terminal '));const m=new TaskTerminals({resolve:()=>dir,env:{...terminalEnv(),HOME:dir}});
 try{m.open('one');m.write('one',"printf '%s\\n' 'C:\\folder with spaces'\r");await until(()=>m.read('one',0).data.includes('C:\\folder with spaces\r\n'));
 m.write('one',"read reply; printf 'ANSWER=%s\\n' \"$reply\"\r");await new Promise(r=>setTimeout(r,60));m.write('one','interactive-824\r');await until(()=>m.read('one',0).data.includes('ANSWER=interactive-824'));
 m.resize('one',93,31);m.write('one',"stty size; false; printf 'EXIT=%s\\n' $?\r");await until(()=>m.read('one',0).data.includes('31 93'));await until(()=>m.read('one',0).data.includes('EXIT=1'));
 m.open('two');expect(m.read('two',0).data).not.toContain('ANSWER=');m.write('one','exit 7\r');await until(()=>m.read('one',0).exited);expect(m.read('one',0).exitCode).toBe(7);
 }finally{m.dispose();fs.rmSync(dir,{recursive:true,force:true});}
},15000);
it('ends a background child when the task shell is ended',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'terminal cleanup '));const m=new TaskTerminals({resolve:()=>dir,env:{...terminalEnv(),HOME:dir}});let pid;
 try{m.open('one');m.write('one',"sleep 120 & echo $! > child.pid\r");await until(()=>fs.existsSync(path.join(dir,'child.pid')));pid=Number(fs.readFileSync(path.join(dir,'child.pid'),'utf8'));expect(pid).toBeGreaterThan(1);m.close('one');await until(()=>{try{process.kill(pid,0);return false;}catch{return true;}});
 }finally{m.dispose();if(pid)try{process.kill(pid,'SIGKILL');}catch{}fs.rmSync(dir,{recursive:true,force:true});}
},15000);
