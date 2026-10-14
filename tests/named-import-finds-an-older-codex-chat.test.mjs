// A named conversation outside the recent-day window must still be selectable for import.
import {it,expect} from 'vitest';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {readCodexThreads} from '../main/codex-threads.mjs';
it('finds an old named user chat without offering unrelated old chats',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'agentbox-name-search-'));const codexDir=path.join(home,'.codex');const dir=path.join(codexDir,'sessions','2025','01','01');fs.mkdirSync(dir,{recursive:true});
 const id='11111111-2222-3333-4444-555555555555';
 try{
  fs.writeFileSync(path.join(codexDir,'session_index.jsonl'),JSON.stringify({id,thread_name:'Example archive conversation',updated_at:'2025-01-01T00:00:00Z'})+'\n');
  const file=path.join(dir,`rollout-2025-01-01T00-00-00-${id}.jsonl`);
  fs.writeFileSync(file,[{type:'session_meta',payload:{id,cwd:path.join(home,'example-project'),timestamp:'2025-01-01T00:00:00Z',source:'user'}},{type:'event_msg',payload:{type:'user_message',message:'Example request'}}].map(x=>JSON.stringify(x)).join('\n')+'\n');fs.utimesSync(file,new Date('2025-01-01'),new Date('2025-01-01'));
  expect(readCodexThreads({home,now:Date.UTC(2026,9,13)}).threads).toHaveLength(0);
  expect(readCodexThreads({home,now:Date.UTC(2026,9,13),query:'ARCHIVE'}).threads.map(t=>t.id)).toEqual([id]);
  expect(readCodexThreads({home,query:'unrelated'}).threads).toHaveLength(0);
  const recent=path.join(codexDir,'sessions','2026','10','13');fs.mkdirSync(recent,{recursive:true});
  const other='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';fs.writeFileSync(path.join(recent,`rollout-2026-10-13T00-00-00-${other}.jsonl`),[{type:'session_meta',payload:{id:other,cwd:path.join(home,'example-project'),source:'user'}},{type:'event_msg',payload:{type:'user_message',message:'Unnamed example conversation'}}].map(x=>JSON.stringify(x)).join('\n')+'\n');
  expect(readCodexThreads({home,query:'Unnamed'}).threads.map(t=>t.id)).toEqual([other]);
 }finally{fs.rmSync(home,{recursive:true,force:true})}
});
