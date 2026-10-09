// User-owned shells. Never provider tool calls; no transcript or analytics writes.
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {commandRunning} from '../shared/terminal-state.mjs';
const require=createRequire(import.meta.url);
const LIMIT=262144;
export function terminalEnv(source=process.env){
  const env={...source,TERM:'xterm-256color',COLORTERM:'truecolor'};
  for(const key of Object.keys(env)) if(/^(ANTHROPIC_|OPENAI_API_KEY$|CLAUDE_CODE_|CLAUDECODE$|CLAUDE_PID$|CLAUDE_EFFORT$|ELECTRON_|NODE_OPTIONS$)/.test(key)) delete env[key];
  return env;
}
/*
 * A TASK'S OWN CHECKOUT IS DELETED WHEN ITS BRANCH IS MERGED, and the row keeps
   remembering it. That is the normal end of a task, not a broken one, and it
   used to leave the terminal refusing to open at all (w-566a2e749f, on the
   step where she was told to run commands in that very project). So the
   terminal opens in the project folder instead, and says so in its first line,
   because a shell quietly sitting somewhere other than the task's folder is the
   thing this file has always refused to do. */
export function terminalPlace({store,supervisor,product,id,agent}){
  const item=store.listItems().find(i=>i.id===id&&i.product===product);
  if(!item&&!agent) throw Error('This task is no longer available.');
  const prod=store.listProducts().find(p=>p.slug===product);
  const rec=supervisor._liveSessions?.[id] ?? supervisor._rowSessions?.[id];
  const isDir=p=>!!p&&fs.existsSync(p)&&fs.statSync(p).isDirectory();
  const own=agent?.cwd ?? (rec?.product===product?rec.cwd:null);
  const cwd=[own,prod?.repoPath,prod?.dir].find(isDir);
  if(!cwd) throw Error('This task’s working folder is unavailable. Restore it or update the project folder.');
  const notice=own&&cwd!==own?`This task’s own folder is gone, usually because its work was merged. Opened in the project folder, ${cwd}.`:undefined;
  return {cwd,notice};
}
export function terminalFolder(args){return terminalPlace(args).cwd;}
// The shell a person actually has. `$SHELL` when that file exists, then
// zsh, bash, and sh. A machine with no zsh used to spawn `/bin/zsh` and
// the terminal never came up.
export function loginShell(env=process.env,exists=fs.existsSync){
  const preferred=env.SHELL;
  if(preferred&&exists(preferred))return preferred;
  for(const candidate of ['/bin/zsh','/bin/bash','/bin/sh']){
    if(exists(candidate))return candidate;
  }
  return preferred||'/bin/sh';
}
// Enumerate only descendants of our own shell, including background process
// groups. Kill children before shell; closing a pane never calls this.
export function disposeTerminalProcess(pty){
  const descendants=[];
  try{
    const rows=execFileSync('/bin/ps',['-axo','pid=,ppid='],{encoding:'utf8',timeout:2000}).trim().split('\n').map(s=>s.trim().split(/\s+/).map(Number));
    const parents=new Set([pty.pid]);
    for(let found=true;found;){found=false;for(const [pid,ppid] of rows)if(parents.has(ppid)&&!parents.has(pid)){parents.add(pid);descendants.push(pid);found=true;}}
  }catch{}
  for(const pid of descendants.reverse())try{process.kill(pid,'SIGKILL');}catch{}
  try{pty.kill('SIGKILL');}catch{}
}
/*
 * NOBODY ENDS A SHELL, SO THE SHELLS END THEMSELVES.
 *
 * She picked this shape out of three the next day: "Ten minute idle timer, plus
 * reuse the oldest idle slot at the cap."
 *
 * TWO FACTS THE APP ALREADY HAD, and the whole design falls out of them.
 *
 * WHICH SHELLS ARE WORTH KEEPING: one with a command in it. `commandRunning`
 * (../shared/terminal-state.mjs) reads node-pty's foreground process name, and
 * it is the same call the toolbar makes to decide whether to draw Stop command,
 * deliberately, so a shell she can see is busy can never be one this reaps.
 *
 * WHICH SHELLS NOBODY IS WATCHING: the panel asks for output every 150ms while
 * it is on screen and stops the instant it is hidden or she leaves the task
 * (TaskTerminal.tsx). So `lastReadAt` is not a guess about attention, it is the
 * last time the app was actually asked what this shell had to say.
 *
 * Idle AND unwatched for ten minutes is a shell that costs something and is
 * worth nothing, and it goes. Everything else stays until she or the app quits.
 */
const IDLE_MS=600000;
const SWEEP_MS=60000;
const MAX_TERMINALS=20;
export class TaskTerminals {
  constructor({spawn,resolve,disposeProcess=disposeTerminalProcess,env=terminalEnv(),shell=loginShell(),idleMs=IDLE_MS,sweepMs=SWEEP_MS,now=()=>Date.now()}={}){
    this.spawn=spawn??((...args)=>require('node-pty').spawn(...args));this.resolve=resolve;this.disposeProcess=disposeProcess;this.env=env;this.shell=shell;this.sessions=new Map();
    this.idleMs=idleMs;this.now=now;
    // Keys whose shell this class ended on its own, and WHY. The next open on
    // one says so rather than handing her a blank screen where her scrollback
    // was, and the two reasons are different sentences because they are
    // different events: one is time passing, the other is her opening a
    // twenty-first terminal.
    this.reaped=new Map();
    // `unref` so a sweep that is merely pending never holds the app open, and
    // never in a test: a suite that leaves an interval behind hangs the runner.
    if(sweepMs>0&&typeof setInterval==='function'){
      this.timer=setInterval(()=>{try{this.sweepIdle();}catch{}},sweepMs);
      this.timer?.unref?.();
    }
  }
  /*
   * WHETHER THIS SHELL IS DOING ANYTHING. Wrapped, because `pty.process` is a
     getter onto a real process that may have gone between the sweep deciding to
     look and the kernel answering; a throw there must read as idle-and-dead
     rather than take the sweep down with it. */
  busy(session){
    if(session.exited)return false;
    try{return commandRunning(session.pty.process||'Shell',false);}catch{return false;}
  }
  /*
   * THE ONE THE CAP TAKES: least recently watched first, and never a busy one.
     Null means every slot is genuinely working, which is the only case left
     where she is told no. */
  oldestIdle(){
    let pick=null,at=Infinity;
    for(const [key,s] of this.sessions){
      if(this.busy(s))continue;
      const seen=s.lastReadAt??0;
      if(seen<at){at=seen;pick=key;}
    }
    return pick;
  }
  sweepIdle(){
    const cutoff=this.now()-this.idleMs;
    for(const [key,s] of [...this.sessions]){
      if(this.busy(s))continue;
      if((s.lastReadAt??0)>cutoff)continue;
      this.close(key);
      this.reaped.set(key,'The previous shell here was closed after ten minutes idle.');
    }
  }
  open(key){
    if(this.sessions.has(key))return this.read(key,0);
    if(this.sessions.size>=MAX_TERMINALS){
      /*
       * THE CAP REUSES BEFORE IT REFUSES. It used to throw here on the 21st, and
         the sentence told her to end a session, which is the one thing she has
         said she never does. Now the least recently watched IDLE shell makes
         room, and the refusal is kept for the only state it is still true in:
         twenty shells all running something, which is worth interrupting for
         and says so in those words. */
      const victim=this.oldestIdle();
      if(victim===null)throw Error('20 terminals are open and every one of them is running something. Stop one of those commands before opening another terminal.');
      this.close(victim);
      this.reaped.set(victim,'This shell was closed to make room for a newer terminal.');
    }
    const place=this.resolve(key);
    const cwd=typeof place==='string'?place:place.cwd;
    const command=place?.command;
    const pty=this.spawn(command?.file??this.shell,command?.args??['-l'],{cwd,env:{...this.env,...command?.env},cols:80,rows:24,name:'xterm-256color'});
    let resolveExit;const exitPromise=new Promise(resolve=>{resolveExit=resolve;});
    const session={token:randomUUID(),pty,cwd,buffer:'',offset:0,exitCode:null,exited:false,exitPromise,lastReadAt:this.now()};this.sessions.set(key,session);
    /*
     * AND IT SAYS WHAT HAPPENED TO THE LAST ONE. Without this line, reopening a
       terminal the app tidied away looks exactly like the app losing her
       scrollback, which is the same event read as a bug. Dim, one line, above a
       real prompt. */
    const why=this.reaped.get(key);
    if(why!==undefined){this.reaped.delete(key);session.buffer=`\x1b[2m[${why} This is a new one.]\x1b[0m\r\n`;}
    if(place?.notice)session.buffer+=`\x1b[2m[${place.notice}]\x1b[0m\r\n`;
    pty.onData(data=>{session.buffer+=data;const trim=Math.max(0,session.buffer.length-LIMIT);session.buffer=session.buffer.slice(trim);session.offset+=trim;});
    pty.onExit(({exitCode})=>{session.exited=true;session.exitCode=exitCode;resolveExit();});
    return this.read(key,0);
  }
  get(key){const s=this.sessions.get(key);if(!s)throw Error('Terminal session ended. Open a new terminal to continue.');return s;}
  // EVERY READ IS THE PANEL SAYING IT IS STILL THERE. This one line is the whole
  // attention signal the sweep runs on; see the note on the class.
  read(key,offset=0){const s=this.get(key);if(!Number.isSafeInteger(offset)||offset<0)throw Error('Invalid terminal cursor.');s.lastReadAt=this.now();const end=s.offset+s.buffer.length;return {token:s.token,cwd:s.cwd,data:s.buffer.slice(Math.max(0,offset-s.offset)),offset:end,truncated:offset<s.offset,exited:s.exited,exitCode:s.exitCode,process:s.exited?'Exited':s.pty.process||'Shell'};}
  write(key,data){const s=this.get(key);if(s.exited)throw Error('This shell has exited. Start a new session.');if(typeof data!=='string'||data.length>65536)throw Error('Terminal input is too large. Paste at most 64 KB at a time.');s.pty.write(data);}
  resize(key,cols,rows){if(!Number.isInteger(cols)||!Number.isInteger(rows)||cols<2||cols>500||rows<2||rows>300)throw Error('Invalid terminal size.');const s=this.get(key);if(!s.exited)s.pty.resize(cols,rows);}
  close(key){const s=this.sessions.get(key);if(s){if(!s.exited)this.disposeProcess(s.pty);this.sessions.delete(key);}}
  async shutdown(){
    const exits=[...this.sessions.values()].map(s=>s.exitPromise);
    this.dispose();
    let timer;
    await Promise.race([Promise.all(exits),new Promise(resolve=>{timer=setTimeout(resolve,2000);})]);
    clearTimeout(timer);
    await new Promise(resolve=>setImmediate(resolve));
  }
  // The sweep goes with the shells. A disposed manager that keeps a timer is a
  // timer calling `close` on a Map somebody else now owns.
  dispose(){if(this.timer){clearInterval(this.timer);this.timer=null;}for(const key of [...this.sessions.keys()])this.close(key);}
}
