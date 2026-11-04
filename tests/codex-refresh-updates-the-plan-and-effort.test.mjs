// A saved Free token hid paid models and their effort controls after an account upgrade.
// Exercise the real refresh with a stale token and fresh account/model responses.
import {it, expect, vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {refreshAgentModels} from '../main/refresh-agent-models.mts';
import {codexAccount, codexFreePlan, rememberCodexAccount} from '../main/codex-account.mts';
import {codexModels} from '../main/codex-models.mts';

it('refreshes the account before models and uses the live plan until the login changes', async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'codex-plan-refresh-'));
 const auth=path.join(home,'auth.json');
 const write=plan=>fs.writeFileSync(auth,JSON.stringify({tokens:{id_token:`h.${Buffer.from(JSON.stringify({email:'test@example.com','https://api.openai.com/auth':{chatgpt_plan_type:plan}})).toString('base64url')}.s`}}));
 try{
  write('free');
  const request=vi.fn(async method=>method==='account/read'?{account:{type:'chatgpt',email:'test@example.com',planType:'pro'}}:{data:[{model:'paid-model',displayName:'Paid model',defaultReasoningEffort:'high',supportedReasoningEfforts:[{reasoningEffort:'low'},{reasoningEffort:'high'}]}]});
  await refreshAgentModels('codex',{codexBin:'/bin/codex'},home,{open:()=>({initialize:async()=>{},request,close:()=>{}})});
  expect(request.mock.calls[0]).toEqual(['account/read',{refreshToken:true}]);
  expect(codexAccount(home).plan).toBe('Pro');
  expect(codexFreePlan([home])).toBeNull();
  expect(codexModels({home})[0]).toMatchObject({defaultLevel:'high',levels:[{id:'low'},{id:'high'}]});
  write('plus');
  expect(codexAccount(home).plan).toBe('Plus');
  rememberCodexAccount(home,null);
  expect(codexAccount(home)).toBeNull();
  expect(codexFreePlan([home])).toBeNull();
  rememberCodexAccount(home,{type:'apiKey'});
  expect(codexAccount(home).plan).toBeNull();
 }finally{fs.rmSync(home,{recursive:true,force:true});}
});
