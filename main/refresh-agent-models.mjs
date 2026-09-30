import {spawn} from 'node:child_process';
import {createCodexAppServer} from './codex-app-server.mjs';
import {rememberCodexModels} from './codex-models.mjs';
import {forget,claudeModels} from './claude-models.mjs';
import {terminalEnv} from './task-terminals.mjs';
export async function refreshAgentModels(engine,config,home){
 if(engine==='claude'){forget();claudeModels({bin:config.claudeBin});return;}
 const client=createCodexAppServer({spawn:()=>spawn(config.codexBin,['app-server'],{cwd:config.home,env:{...terminalEnv(),CODEX_HOME:home},stdio:['pipe','pipe','pipe']}),requestTimeoutMs:10000});
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
