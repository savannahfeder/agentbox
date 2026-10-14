// Changing the inbox's project grouping must not move a running worker's workspace or conversation.
import {it,expect} from 'vitest';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {Store} from '../main/store.mjs';import {DEFAULT_DISPLAY,keeps} from '../renderer/src/threads/page-rules.ts';
it('persists the chosen project as grouping metadata while retaining origin and history',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'agentbox-project-group-'));
 for(const id of ['one','two']){const dir=path.join(root,id);fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'project.json'),JSON.stringify({schemaVersion:1,id,name:id}))}
 const config={accountRoot:root,storeRoot:root,products:[],personalProducts:[],accountId:'qa'};const store=await new Store(config).init();
 try{
  const item=store.composeItem('one',{title:'Own example',body:'Original context',kind:'question'});store.recordSessionResult('one',item.id,{result:'Original response',status:'blocked'});
  const before=store.readThread('one',item.id);
  store.threadEdit('one',item.id,{displayProject:'two'});
  const row=store.readItem('one',item.id);expect(row.product).toBe('one');expect(row.displayProject).toBe('two');expect(store.readThread('one',item.id)).toEqual(before);
  expect(keeps(row,{...DEFAULT_DISPLAY.inbox,projects:['two']},Date.now())).toBe(true);
  expect(()=>store.threadEdit('one',item.id,{displayProject:'unknown'})).toThrow();expect(()=>store.threadEdit('one',item.id,{displayProject:{bad:true}})).toThrow();
  const reopened=await new Store(config).init();expect(reopened.readItem('one',item.id).displayProject).toBe('two');reopened.unwatch();
 }finally{store.unwatch();fs.rmSync(root,{recursive:true,force:true})}
});
