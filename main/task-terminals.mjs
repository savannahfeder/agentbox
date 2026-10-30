// User-owned shells. Never provider tool calls; no transcript or analytics writes.
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {commandRunning} from '../shared/terminal-state.mjs';
import {loginShell} from './shell-path.mjs';
import {loadPty} from './pty.mjs';
const LIMIT=262144;
export function terminalEnv(source=process.env){
  const env={...source,TERM:'xterm-256color',COLORTERM:'truecolor'};
  for(const key of Object.keys(env)) if(/^(ANTHROPIC_|OPENAI_API_KEY$|CLAUDE_CODE_|CLAUDECODE$|CLAUDE_PID$|CLAUDE_EFFORT$|ELECTRON_|NODE_OPTIONS$)/.test(key)) delete env[key];
  // NPM'S STAND-IN EDITOR IS NOBODY'S CHOICE. `npm start` gives everything it
  // runs EDITOR=vi when neither EDITOR nor VISUAL is set, and zsh reads "vi"
  // there as a request for vi keys: Option+Left deleted and Option+Delete
  // moved. A login shell sets the person's own EDITOR from their startup files.
  if(env.EDITOR==='vi'&&!env.VISUAL) delete env.EDITOR;
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
 * WHICH SHELLS NOBODY IS WATCHING: the panel asks for output at least once a
 * second while it is on screen (each ask waits up to READ_WAIT_MS for some)
 * and stops the instant it is hidden or she leaves the task
 * (TaskTerminal.tsx). So `lastReadAt` is not a guess about attention, it is the
 * last time the app was actually asked what this shell had to say.
 *
 * Idle AND unwatched for an hour is a shell that costs something and is
 * worth nothing, and it goes. Everything else stays until its task is closed:
 * task terminals run in ./terminal-host.mjs, which outlives the app.
 *
 * IT WAS TEN MINUTES, AND THAT WAS TOO SHORT (w-6841800f17): "I come back after
 * maybe 15 minutes and it's gone ... I don't see the error message." A deploy
 * that fails leaves an idle shell with the error on it, and ten minutes away
 * from the task took the error with the shell. So the wait is an hour, and when
 * a shell does go, the end of what it showed comes back with the next one.
 *
 * AND A SHELL THAT PRINTED SOMETHING SHE HAS NOT SEEN IS NOT WORTH NOTHING
 * (w-f147e487a1). She started the AWS tools install, left the thread while it
 * ran, and came back to a new shell: the install finished while she was away,
 * and since the idle clock ran from her last look, the shell went on the next
 * sweep with its output unread. "I was running it." So the hour starts only
 * once she has read everything it printed, and at the cap a shell she has read
 * goes before one she has not; when all twenty hold unread output, the least
 * recently watched still makes room.
 */
const IDLE_MS=3600000;
// How much of a closed shell's screen comes back. The end is where the error
// is; 64K characters is several hundred lines of it.
const KEPT_SCREEN=65536;
// Closed shells whose screen is still held for her. Twice the cap is every
// terminal open now plus as many again that the app has tidied away.
const KEPT_SHELLS=40;
/*
 * THE END OF A SCREEN, CUT AT A LINE. Cutting mid-line would start the replay
   halfway through a word or an escape sequence. */
function keptScreen(buffer){
  if(buffer.length<=KEPT_SCREEN)return buffer;
  const tail=buffer.slice(-KEPT_SCREEN);
  const line=tail.indexOf('\n');
  return line<0?tail:tail.slice(line+1);
}
// The longest a read waits for output before answering with none, so the panel
// still hears about a command that finished quietly and the sweep still sees
// it watching.
const READ_WAIT_MS=1000;
const SWEEP_MS=60000;
const MAX_TERMINALS=20;
/*
 * A TERMINAL LIVES AS LONG AS ITS TASK IS OPEN. Closing the task ends it; so,
 * while memory is critical, does going unwatched. Each says why on the next
 * terminal, in these words.
 */
export const ENDED={
  closed:'This task was closed, so its terminal was ended.',
  memory:'This terminal was ended because this computer was running out of memory.',
};
// While memory is critical, a terminal looked at this recently is still in use.
const WATCHED_MS=600000;
export class TaskTerminals {
  constructor({spawn,resolve,disposeProcess=disposeTerminalProcess,env=terminalEnv(),shell=loginShell(),idleMs=IDLE_MS,sweepMs=SWEEP_MS,now=()=>Date.now(),readPressure=null,watchedMs=WATCHED_MS}={}){
    this.spawn=spawn??((...args)=>loadPty().spawn(...args));this.resolve=resolve;this.disposeProcess=disposeProcess;this.env=env;this.shell=shell;this.sessions=new Map();
    this.idleMs=idleMs;this.now=now;this.readPressure=readPressure;this.watchedMs=watchedMs;
    // Keys whose shell this class ended on its own, and WHY. The next open on
    // one says so rather than handing her a blank screen where her scrollback
    // was, and the two reasons are different sentences because they are
    // different events: one is time passing, the other is her opening a
    // twenty-first terminal.
    this.reaped=new Map();
    // `unref` so a sweep that is merely pending never holds the app open, and
    // never in a test: a suite that leaves an interval behind hangs the runner.
    if(sweepMs>0&&typeof setInterval==='function'){
      this.timer=setInterval(()=>{try{this.sweepIdle();}catch{}this.relieveMemory().catch(()=>{});},sweepMs);
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
  // Output past the last byte a read handed to the panel.
  unread(session){return session.offset+session.buffer.length>(session.seenTo??0);}
  /*
   * THE ONE THE CAP TAKES: one she has read everything in before one she has
     not, then least recently watched, and never a busy one. Null means every
     slot is genuinely working, which is the only case left where she is told
     no. */
  oldestIdle(){
    let pick=null,pickUnread=true,at=Infinity;
    for(const [key,s] of this.sessions){
      if(this.busy(s))continue;
      const unread=this.unread(s),seen=s.lastReadAt??0;
      if(pick===null||(pickUnread&&!unread)||(unread===pickUnread&&seen<at)){pick=key;pickUnread=unread;at=seen;}
    }
    return pick;
  }
  /*
   * THE APP ENDS A SHELL, AND KEEPS WHAT IT SAID. Only these two paths keep the
     screen: when she presses End shell herself, `close` is called directly and
     nothing comes back, because she chose to throw it away. */
  retire(key,why){
    const s=this.sessions.get(key);
    const screen=s?keptScreen(s.buffer):'';
    this.close(key);
    this.reaped.delete(key);
    this.reaped.set(key,{why,screen});
    while(this.reaped.size>KEPT_SHELLS)this.reaped.delete(this.reaped.keys().next().value);
  }
  sweepIdle(){
    const cutoff=this.now()-this.idleMs;
    for(const [key,s] of [...this.sessions]){
      if(this.busy(s)||this.unread(s))continue;
      if((s.lastReadAt??0)>cutoff)continue;
      this.retire(key,'The previous shell here was closed after an hour idle.');
    }
  }
  end(key,why){if(this.sessions.has(key))this.retire(key,why);}
  list(){
    return [...this.sessions].map(([key,s])=>({key,busy:this.busy(s),exited:s.exited,unread:this.unread(s),lastReadAt:s.lastReadAt??0,cwd:s.cwd,pid:s.pty.pid}));
  }
  /*
   * TOO MUCH FOR THIS COMPUTER. Only while memory is critical, checked once a
     minute: every shell at its prompt that nobody has looked at for ten
     minutes, and one terminal running something, the one looked at least
     recently. Never one looked at inside those ten minutes. */
  async relieveMemory(){
    if(!this.readPressure||!this.sessions.size)return [];
    let pressure='normal';
    try{pressure=await this.readPressure();}catch{}
    if(pressure!=='critical')return [];
    const cutoff=this.now()-this.watchedMs,idle=[];let busy=null,at=Infinity;
    for(const [key,s] of this.sessions){
      if(s.exited||(s.lastReadAt??0)>cutoff)continue;
      if(!this.busy(s)){idle.push(key);continue;}
      if((s.lastReadAt??0)<at){busy=key;at=s.lastReadAt??0;}
    }
    const ended=busy?[...idle,busy]:idle;
    for(const key of ended)this.retire(key,ENDED.memory);
    return ended;
  }
  // `given` is where to open it when the caller has already worked that out:
  // the terminal host (./terminal-host.mjs) cannot read the store.
  open(key,given){
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
      this.retire(victim,'This shell was closed to make room for a newer terminal.');
    }
    const place=given??this.resolve(key);
    const cwd=typeof place==='string'?place:place.cwd;
    const command=place?.command;
    const pty=this.spawn(command?.file??place?.shell??this.shell,command?.args??['-l'],{cwd,env:{...(place?.env??this.env),...command?.env},cols:80,rows:24,name:'xterm-256color'});
    let resolveExit;const exitPromise=new Promise(resolve=>{resolveExit=resolve;});
    const session={token:randomUUID(),pty,cwd,buffer:'',offset:0,exitCode:null,exited:false,exitPromise,lastReadAt:this.now(),waiters:new Set()};this.sessions.set(key,session);
    /*
     * AND IT SAYS WHAT HAPPENED TO THE LAST ONE. Without this line, reopening a
       terminal the app tidied away looks exactly like the app losing her
       scrollback, which is the same event read as a bug. Dim, one line, above a
       real prompt, under whatever the old shell last showed. */
    const gone=this.reaped.get(key);
    if(gone!==undefined){
      this.reaped.delete(key);
      const old=gone.screen?`${gone.screen}\x1b[0m${gone.screen.endsWith('\n')?'':'\r\n'}`:'';
      session.buffer=`${old}\x1b[2m[${gone.why}${old?' Its output is above.':''} This is a new one.]\x1b[0m\r\n`;
    }
    if(place?.notice)session.buffer+=`\x1b[2m[${place.notice}]\x1b[0m\r\n`;
    pty.onData(data=>{session.buffer+=data;const trim=Math.max(0,session.buffer.length-LIMIT);session.buffer=session.buffer.slice(trim);session.offset+=trim;this.wake(session);});
    pty.onExit(({exitCode})=>{session.exited=true;session.exitCode=exitCode;resolveExit();this.wake(session);});
    return this.read(key,0);
  }
  get(key){const s=this.sessions.get(key);if(!s)throw Error('Terminal session ended. Open a new terminal to continue.');return s;}
  // EVERY READ IS THE PANEL SAYING IT IS STILL THERE. This one line is the whole
  // attention signal the sweep runs on; see the note on the class.
  read(key,offset=0,wait=0){
    const s=this.get(key);if(!Number.isSafeInteger(offset)||offset<0)throw Error('Invalid terminal cursor.');s.lastReadAt=this.now();
    const end=s.offset+s.buffer.length;
    /*
     * A READ MAY WAIT FOR THE SHELL'S NEXT OUTPUT, and comes back the moment
       there is some. The panel used to ask every 150ms, so the echo of a key
       sat in this buffer until the next ask: deleted characters stayed on her
       screen after she deleted them (w-16e47d0836). `live` tells the panel this
       main can wait, so it asks again at once instead of in 150ms; a main
       older than its renderer (⌘R ahead of a restart) answers without it. */
    if(wait>0&&!s.exited&&offset>=end)return new Promise((resolve,reject)=>{
      const done=()=>{clearTimeout(timer);s.waiters.delete(done);try{if(this.sessions.get(key)!==s)throw Error('Terminal session ended. Open a new terminal to continue.');resolve({...this.read(key,offset),live:true});}catch(e){reject(e);}};
      const timer=setTimeout(done,Math.min(wait,READ_WAIT_MS));
      s.waiters.add(done);
    });
    s.seenTo=end;
    const state={token:s.token,cwd:s.cwd,data:s.buffer.slice(Math.max(0,offset-s.offset)),offset:end,truncated:offset<s.offset,exited:s.exited,exitCode:s.exitCode,process:s.exited?'Exited':s.pty.process||'Shell'};
    return wait>0?{...state,live:true}:state;
  }
  // Answers every waiting read. Deferred a turn so the pieces of one echo the
  // pty hands over back to back go out as one answer.
  wake(s){if(!s.waiters.size||s.waking)return;s.waking=true;setImmediate(()=>{s.waking=false;for(const done of [...s.waiters])done();});}
  write(key,data){const s=this.get(key);if(s.exited)throw Error('This shell has exited. Start a new session.');if(typeof data!=='string'||data.length>65536)throw Error('Terminal input is too large. Paste at most 64 KB at a time.');s.pty.write(data);}
  resize(key,cols,rows){if(!Number.isInteger(cols)||!Number.isInteger(rows)||cols<2||cols>500||rows<2||rows>300)throw Error('Invalid terminal size.');const s=this.get(key);if(!s.exited)s.pty.resize(cols,rows);}
  close(key){const s=this.sessions.get(key);if(s){if(!s.exited)this.disposeProcess(s.pty);this.sessions.delete(key);for(const done of [...s.waiters])done();}}
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
