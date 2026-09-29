// MP-04, September 18: the exit handler compared only words, so a second
// identical reply with a newer ledger timestamp produced zero immediate
// continuations. Delivery identity must include when the reply was written.
import {it,expect} from 'vitest';
import {Supervisor} from '../main/supervisor.mjs';
function probe(before,after){
 const s=Object.create(Supervisor.prototype);
 s.store={listItems:()=>[after]};s.pausedProducts=new Set();s.sessions=new Map();
 s._handledAnswers=new Set();s._saveState=()=>{};s.spawned=[];
 s.spawnWorker=(item,options)=>s.spawned.push({item,options});
 s.deliverMidflightReply(before,before.answer);
 return s;
}
const before={id:'w-test',product:'test',answer:'continue',wrote:{answer:{ts:100}}};
it('delivers repeated words written later exactly once',()=>{
 const after={...before,wrote:{answer:{ts:200}}};const s=probe(before,after);
 expect(s.spawned).toHaveLength(1);
 s.deliverMidflightReply(before,before.answer);expect(s.spawned).toHaveLength(1);
});
it('does not replay the same write or an unrelated item update',()=>{
 expect(probe(before,{...before,updatedAt:200}).spawned).toHaveLength(0);
});
it('still delivers different words with legacy missing timestamps',()=>{
 expect(probe({...before,wrote:undefined},{...before,wrote:undefined,answer:'change course'}).spawned).toHaveLength(1);
});
it('does not deliver withdrawn replies',()=>{
 expect(probe(before,{...before,answer:'(withdrawn)',wrote:{answer:{ts:200}}}).spawned).toHaveLength(0);
});
