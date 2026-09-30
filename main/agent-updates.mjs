// Release discovery is read-only. An updater is a dedicated PTY command,
// started only by the app's Update now action, never by a poll or terminal open.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {TaskTerminals,terminalEnv} from './task-terminals.mjs';
const exec=promisify(execFile);
const valid=v=>typeof v==='string'&&/^\d+\.\d+\.\d+$/.test(v);
export function newerVersion(installed,latest){
 if(!valid(installed)||!valid(latest))return false;
 const a=installed.split('.').map(Number),b=latest.split('.').map(Number);
 for(let i=0;i<3;i++){if(b[i]!==a[i])return b[i]>a[i];}return false;
}
export function updatePlan({engine,bin,real,home=os.homedir(),channel='latest'}){
 if(!['claude','codex'].includes(engine)||!path.isAbsolute(bin||'')||!real)return null;
 const name=engine==='claude'?'Claude Code':'Codex';
 const brew=real.match(/^(\/opt\/homebrew|\/usr\/local)\/Caskroom\/(claude-code(?:@latest)?|codex)\//);
 if(brew&&((engine==='claude'&&brew[2].startsWith('claude-code'))||(engine==='codex'&&brew[2]==='codex')))
  return {name,file:`${brew[1]}/bin/brew`,args:['upgrade','--cask',brew[2]],feed:`https://formulae.brew.sh/api/cask/${brew[2]}.json`,format:'brew'};
 const pkg=engine==='claude'?'@anthropic-ai/claude-code':'@openai/codex';
 const tail=`/lib/node_modules/${pkg}/`;
 const at=real.indexOf(tail);
 if(at>0){const prefix=real.slice(0,at);return {name,file:path.join(prefix,'bin/npm'),args:['install','--global','--prefix',prefix,`${pkg}@${channel}`],env:{PATH:`${prefix}/bin:${process.env.PATH||''}`},feed:`https://registry.npmjs.org/${pkg}/${channel}`,format:'npm'};}
 if(engine==='claude'&&real.startsWith(path.join(home,'.local/share/claude/versions')+'/'))return {name,file:bin,args:['update'],feed:`https://downloads.claude.ai/claude-code-releases/${channel}`,format:'text'};
 const standalone=real.match(/^(.*)\/packages\/standalone\/(?:releases|current)\//);
 if(engine==='codex'&&standalone)return {name,file:'/bin/bash',args:['-o','pipefail','-c','/usr/bin/curl -fsSL --connect-timeout 10 --max-time 60 https://chatgpt.com/codex/install.sh | /bin/sh'],env:{CODEX_HOME:standalone[1],CODEX_INSTALL_DIR:path.dirname(bin)},feed:'https://releases.openai.com/codex/channels/latest',format:'codex'};
 return null;
}
const json=file=>{try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return {}}};
export async function installedAgent(engine,config){
 const bin=engine==='codex'?config.codexBin:config.claudeBin;
 if(!bin)throw Error('This agent is not installed.');
 const home=config.home||os.homedir();
 const settings=engine==='claude'?json(path.join(process.env.CLAUDE_CONFIG_DIR||path.join(home,'.claude'),'settings.json')):{};
 const env=terminalEnv();
 // Version inspection must not itself auto-update anything.
 const {stdout}=await exec(bin,['--version'],{timeout:8000,maxBuffer:16384,env:{...env,DISABLE_AUTOUPDATER:'1'}});
 const version=stdout.match(/\b\d+\.\d+\.\d+(?:-[\w.-]+)?\b/)?.[0];
 const channel=settings.autoUpdatesChannel==='stable'?'stable':'latest';
 return {engine,bin,real:fs.realpathSync(bin),home,version,channel,disabled:settings.env?.DISABLE_UPDATES==='1'||process.env.DISABLE_UPDATES==='1'};
}
export async function latestRelease(plan){
 const r=await fetch(plan.feed,{signal:AbortSignal.timeout(10000),headers:{Accept:plan.format==='text'?'text/plain':'application/json'}});
 if(!r.ok)throw Error('Release check failed.');
 const body=await r.text();if(body.length>2_000_000)throw Error('Release response too large.');
 const data=plan.format==='text'?null:JSON.parse(body);
 const version=plan.format==='text'?body.trim():plan.format==='codex'?String(data.version||data.tag_name||'').replace(/^(rust-v|v)/,''):data.version;
 if(!valid(version))throw Error('Release version could not be read.');return version;
}
export class AgentUpdates{
 constructor({installation,latest=latestRelease,refresh=async()=>{},terminals,now=()=>Date.now()}={}){
  this.installation=installation;this.latest=latest;this.refresh=refresh;this.now=now;this.entries=new Map();this.checks=new Map();this.starts=new Map();this.finishes=new Map();this.plans=new Map();
  this.terminals=terminals||new TaskTerminals({sweepMs:0});
  this.terminals.resolve=engine=>{const p=this.plans.get(engine);if(!p)throw Error('Click Update now first.');return {cwd:p.home,command:{file:p.file,args:p.args,env:p.env},notice:`Updating ${p.name}.`}};
 }
 status(engine){return this.entries.get(engine)||{engine,state:'unknown'};}
 check(engine,force=false){
  if(!['claude','codex'].includes(engine))return Promise.reject(Error('Unknown agent.'));
  if(this.starts.has(engine)||this.status(engine).state==='running')return Promise.resolve(this.status(engine));
  if(this.checks.has(engine))return this.checks.get(engine);
  const saved=this.status(engine);if(!force&&saved.checkedAt&&this.now()-saved.checkedAt<3600000)return Promise.resolve(saved);
  const work=(async()=>{let result;try{
   const install=await this.installation(engine);const plan=install.disabled?null:updatePlan(install);
   if(!plan)result={engine,state:'unsupported',message:'Update this installation using its own installer.'};
   else{const latest=await this.latest(plan);result={engine,state:newerVersion(install.version,latest)?'available':'current',installed:install.version,latest};if(!valid(install.version))throw Error('Installed version could not be read.');}
  }catch{result={engine,state:'unknown',message:'Could not check for updates. Your current models are still available.'};}
  result.checkedAt=this.now();if(this.starts.has(engine)||this.status(engine).state==='running')return this.status(engine);this.entries.set(engine,result);return result;})().finally(()=>this.checks.delete(engine));
  this.checks.set(engine,work);return work;
 }
 start(engine){
  if(this.starts.has(engine))return this.starts.get(engine);
  if(this.status(engine).state==='running')return Promise.resolve(this.status(engine));
  // Validate again at click time: an installation may have changed since
  // the picker opened. Never trust a command or a release passed by the UI.
  const work=(async()=>{
   const install=await this.installation(engine);const plan=install.disabled?null:updatePlan(install);
   if(!plan)throw Error('This installation must be updated using its own installer.');
   const target=await this.latest(plan);
   if(!valid(install.version))throw Error('Installed version could not be read.');
   if(!newerVersion(install.version,target)){
    await this.refresh(engine);const current={engine,state:'current',installed:install.version,latest:target,checkedAt:this.now(),message:'Up to date. Available models refreshed.'};this.entries.set(engine,current);return current;
   }
   this.plans.set(engine,{...plan,home:install.home});this.terminals.close(engine);
   this.terminals.open(engine);
   const running={engine,state:'running',installed:install.version,latest:target};this.entries.set(engine,running);
   const finished=this.terminals.get(engine).exitPromise.then(async()=>{
    try{
     if(this.terminals.get(engine).exitCode!==0)throw Error('Update did not finish. You can retry.');
     const after=await this.installation(engine);
     if(!valid(after.version)||newerVersion(after.version,target))throw Error('The installed version is still older. Check the terminal output before retrying.');
     await this.refresh(engine);
     this.entries.set(engine,{engine,state:'current',installed:after.version,latest:target,checkedAt:this.now(),message:'Updated. Available models refreshed.'});
    }catch(error){this.entries.set(engine,{...running,state:'failed',message:error.message});}
   });this.finishes.set(engine,finished);return running;
  })().catch(error=>{this.entries.set(engine,{engine,state:'failed',message:error.message});throw error;}).finally(()=>this.starts.delete(engine));
  this.starts.set(engine,work);return work;
 }
 settled(engine){return this.finishes.get(engine)||Promise.resolve();}
 terminal(engine,p){
  // Opening the viewer is never an install action, including after it ended.
  if(!this.plans.has(engine))throw Error('Click Update now first.');
  switch(p.action){
   case 'open':return this.terminals.read(engine,0);
   case 'read':return this.terminals.read(engine,p.offset);
   case 'write':return this.terminals.write(engine,p.data);
   case 'resize':return this.terminals.resize(engine,p.cols,p.rows);
   case 'close':return this.terminals.close(engine);
   default:throw Error('Unknown terminal action.');
  }
 }
 shutdown(){return this.terminals.shutdown();}
}
