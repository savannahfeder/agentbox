// Browser E2E 2026-09-18: Stop then Reply wrote an answer onto a blocked row,
// because the open pane still thought it was running. The app workers spawned.
// The store must resolve omitted status from current state, not a stale pane.
import {it,expect} from 'vitest';import {Store} from '../main/store.mjs';
function run(status,patch){let item={id:'w-abcdef',status};const disk={readWorkItem:()=>item,updateWorkItem:(_dir,_id,fields)=>(item={...item,...fields})};const store={modules:{workItemsDisk:disk},productDir:()=>'/fixture'};return Store.prototype.answerItem.call(store,'p',item.id,patch);}
for(const status of ['blocked','done'])it(`reopens ${status} for a genuine new reply`,()=>expect(run(status,{answer:'continue'}).status).toBe('open'));
for(const status of ['open','claimed'])it(`preserves ${status}`,()=>expect(run(status,{answer:'continue'}).status).toBe(status));
it('does not reopen an explicit archive or withdrawal',()=>{expect(run('blocked',{answer:'(withdrawn)'}).status).toBe('blocked');expect(run('open',{answer:'thanks',status:'done'}).status).toBe('done');});
