// Voice actions must use the displayed chat and refuse stale destructive calls.
import {describe,it,expect} from 'vitest';
import {desktopLiveActions} from '../shared/desktop-live-actions.mjs';
describe('desktop live actions',()=>{
 const setup=()=>{let current=null;let rows=[{id:'w-one',product:'p',title:'First',result:'Latest answer'},{id:'w-two',product:'p',title:'Second',result:'Second answer'}];const writes=[];return {writes,run:desktopLiveActions({state:()=>({current,rows}),open:i=>{current=i},details:async i=>({text:i.result+' in full'}),done:async i=>{writes.push(['done',i.id]);rows=rows.filter(r=>r!==i)},reply:async(i,t)=>writes.push(['reply',i.id,t]),later:async(i,m)=>writes.push(['later',i.id,m])})}};
 it('reviews title and latest answer, moves both ways and reports the boundary',async()=>{const {run}=setup();expect((await run({action:'review'})).current.title).toBe('First');expect((await run({action:'next'})).current.id).toBe('w-two');expect((await run({action:'next'})).boundary).toBe('end');expect((await run({action:'previous'})).current.id).toBe('w-one');expect((await run({action:'details'})).details.text).toContain('in full')});
 it('refuses stale ids and never writes to unseen tasks',async()=>{const {run,writes}=setup();await run({action:'review'});await expect(run({action:'done',id:'w-two'})).rejects.toThrow(/changed/);expect(writes).toEqual([])});
 it('uses the existing done/reply/later callbacks and advances only once',async()=>{const {run,writes}=setup();await run({action:'review'});await run({action:'reply',id:'w-one',text:'Example response'});await run({action:'open',id:'w-one'});await run({action:'later',id:'w-one',text:'60'});await run({action:'done',id:'w-two'});expect(writes).toEqual([['reply','w-one','Example response'],['later','w-one',60],['done','w-two']])});
 it('rejects empty responses and invalid reminders without writing',async()=>{const {run,writes}=setup();await run({action:'review'});for(const text of ['0','-1','tomorrow','Infinity'])await expect(run({action:'later',id:'w-one',text})).rejects.toThrow();await expect(run({action:'reply',id:'w-one',text:' '})).rejects.toThrow();expect(writes).toEqual([])});
});
it('reads the displayed headline and existing two-sentence TLDR, keeping the full result behind details',async()=>{
 const current={id:'example',product:'p',title:'A long original prompt',label:'Startup application',result:'Connection unavailable. Consent remains valid. Third sentence is only a detail.'};
 const run=desktopLiveActions({state:()=>({current,rows:[current]}),open(){},details:async i=>i.result});const view=await run({action:'read'});
 expect(view.current.title).toBe('Startup application');expect(view.latestAgentResult).toBe('Connection unavailable. Consent remains valid.');expect(JSON.stringify(view)).not.toContain('Third sentence');expect(await run({action:'details'})).toHaveProperty('details',current.result);
});

it('review skips a completed chat and mutations cannot operate on a different product',async()=>{
 let current={id:'done',product:'qa',status:'done',title:'Already completed'};
 const next={id:'next',product:'qa',status:'blocked',title:'Next example'};
 const execute=desktopLiveActions({state:()=>({current,rows:[next]}),open:i=>{current=i},details:async()=>({}),done:async()=>{},reply:async()=>{},later:async()=>{}});
 expect((await execute({action:'review'})).current.id).toBe('next');
 await expect(execute({action:'done',id:'next',product:'other'})).rejects.toThrow();
});
