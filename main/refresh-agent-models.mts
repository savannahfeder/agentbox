import {spawn} from 'node:child_process';
import {createCodexAppServer} from './codex-app-server.mjs';
import {rememberCodexModels} from './codex-models.mts';
import {forget,claudeModels} from './claude-models.mjs';
import {terminalEnv} from './task-terminals.mts';
import {codexLaunchEnv} from './codex-launch-env.mts';
import {ensureCodexHome,rememberCodexAccount} from './codex-account.mts';
import type {LiveAccount} from './codex-account.mts';
import type {LiveModel} from './codex-models.mts';
// `homes` is every Codex login to ask, one after another. A login that cannot
// answer keeps its last list and does not cost the others theirs; only all of
// them failing is an error.
export interface ModelRefreshConfig { claudeBin?: string | null; codexBin?: string | null; home?: string }
export interface ModelRefreshClient {
 initialize(): Promise<unknown>;
 request(method: string, params: unknown): Promise<unknown>;
 close(reason?: string): void;
}
interface ModelPage { data?: unknown; nextCursor?: string | null }
export async function refreshAgentModels(engine: string,config: ModelRefreshConfig,homes: string | (string | null | undefined)[] | null | undefined,{open=(home: string)=>openAppServer(config,home)}: {open?: (home: string) => ModelRefreshClient}={}){
 if(engine==='claude'){forget();claudeModels({bin:config.claudeBin as never});return;}
 // Codex is optional and codexBin is null without it: nothing to ask, and spawn(null) only threw into the terminal.
 if(!config.codexBin)return;
 const list=[...new Set([homes].flat().filter(Boolean) as string[])];const errors=[];
 for(const home of list){try{await refreshOne(open(home),home);}catch(error){errors.push(error);}}
 if(list.length&&errors.length===list.length)throw errors[0];
}
function openAppServer(config: ModelRefreshConfig,home: string): ModelRefreshClient{
 // codex-cli refuses a CODEX_HOME that does not exist rather than making it.
 ensureCodexHome(home);
 return createCodexAppServer({spawn:(()=>spawn(config.codexBin!,['app-server'],{cwd:config.home,env:codexLaunchEnv(config.codexBin!,{...terminalEnv(),CODEX_HOME:home}),stdio:['pipe','pipe','pipe']})) as never,requestTimeoutMs:10000});
}
async function refreshOne(client: ModelRefreshClient,home: string){
 const deadline=setTimeout(()=>client.close('Model refresh timed out'),15000);
 try{
  await client.initialize();
  const {account}=await client.request('account/read',{refreshToken:true}) as {account?: LiveAccount};
  rememberCodexAccount(home,account);
  let cursor: string | null | undefined=null;const models: LiveModel[]=[];const seen=new Set<string | null | undefined>();
  do{const r=await client.request('model/list',{limit:100,includeHidden:true,...(cursor?{cursor}:{})}) as ModelPage;
   if(!Array.isArray(r.data))throw Error('Model list could not be read.');models.push(...r.data);cursor=r.nextCursor;
   if(cursor&&seen.has(cursor))throw Error('Model list did not finish.');seen.add(cursor);
  }while(cursor);
  if(!models.length)throw Error('No models were returned.');rememberCodexModels(home,models);
 }finally{clearTimeout(deadline);client.close('Model refresh complete');}
}
