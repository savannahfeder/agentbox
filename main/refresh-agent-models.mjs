import {spawn} from 'node:child_process';
import {createCodexAppServer} from './codex-app-server.mjs';
import {rememberCodexModels} from './codex-models.mjs';
import {forget,claudeModels} from './claude-models.mjs';
import {terminalEnv} from './task-terminals.mjs';
import {codexLaunchEnv} from './codex-launch-env.mjs';
import {ensureCodexHome} from './codex-account.mjs';
// `homes` is every Codex login to ask, one after another. A login that cannot
// answer keeps its last list and does not cost the others theirs; only all of
// them failing is an error.
export async function refreshAgentModels(engine,config,homes,{open=home=>openAppServer(config,home)}={}){
 if(engine==='claude'){forget();claudeModels({bin:config.claudeBin});return;}
 // Codex is optional and codexBin is null without it: nothing to ask, and spawn(null) only threw into the terminal.
 if(!config.codexBin)return;
 const list=[...new Set([homes].flat().filter(Boolean))];const errors=[];
 for(const home of list){try{await refreshOne(open(home),home);}catch(error){errors.push(error);}}
 if(list.length&&errors.length===list.length)throw errors[0];
}
function openAppServer(config,home){
 // codex-cli refuses a CODEX_HOME that does not exist rather than making it.
 ensureCodexHome(home);
 return createCodexAppServer({spawn:()=>spawn(config.codexBin,['app-server'],{cwd:config.home,env:codexLaunchEnv(config.codexBin,{...terminalEnv(),CODEX_HOME:home}),stdio:['pipe','pipe','pipe']}),requestTimeoutMs:10000});
}
async function refreshOne(client,home){
 const deadline=setTimeout(()=>client.close('Model refresh timed out'),15000);
 try{
  await client.initialize();let cursor=null;const models=[];const seen=new Set();
  do{const r=await client.request('model/list',{limit:100,includeHidden:true,...(cursor?{cursor}:{})});
   if(!Array.isArray(r.data))throw Error('Model list could not be read.');models.push(...r.data);cursor=r.nextCursor;
   if(cursor&&seen.has(cursor))throw Error('Model list did not finish.');seen.add(cursor);
  }while(cursor);
  if(!models.length)throw Error('No models were returned.');rememberCodexModels(home,models);
 }finally{clearTimeout(deadline);client.close('Model refresh complete');}
}
