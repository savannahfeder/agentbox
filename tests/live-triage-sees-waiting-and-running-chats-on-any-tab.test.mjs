// The spoken inbox must not shrink when the visual tab changes or the last row is done.
import {it,expect} from 'vitest';
import {desktopLiveRows,desktopLiveActions,desktopLiveView} from '../shared/desktop-live-actions.mjs';
import {contextCommentary} from '../renderer/src/live/live-actions.js';
it('merges waiting and running threads, deduplicating by project and id',()=>{
 const a={id:'a',product:'p'},b={id:'b',product:'p'};
 expect(desktopLiveRows([a],[a,b])).toEqual([a,b]);
 expect(desktopLiveRows([a],[{...a,product:'q'}])).toHaveLength(2);
});
it('reviews an active chat even when the displayed chat is done, then opens a running chat',async()=>{
 let current={id:'done',product:'p',status:'done'};const rows=[{id:'a',product:'p',title:'Waiting'},{id:'b',product:'p',title:'Running',status:'claimed'}];
 const run=desktopLiveActions({state:()=>({rows,current}),open:i=>current=i,done:async()=>{},reply:async()=>{},later:async()=>{},details:async()=>({})});
 const first=await run({action:'review'});expect(first.current.id).toBe('a');expect(first.availableChats.map(i=>i.id)).toEqual(['a','b']);
 expect((await run({action:'open',id:'b',product:'p'})).current.title).toBe('Running');
});
it('includes the navigation catalog in silent context even with no open chat',()=>{
 const result=desktopLiveView(null,[{id:'a',product:'p',title:'Waiting'}]);
 expect(contextCommentary(result)).toContain('Waiting');
});

it('navigates repeated ids in different projects without choosing the wrong next chat',async()=>{
 const rows=[{id:'same',product:'p'},{id:'same',product:'q'},{id:'last',product:'q'}];let current=rows[1];
 const run=desktopLiveActions({state:()=>({rows,current}),open:i=>current=i,done:async()=>{},reply:async()=>{},later:async()=>{},details:async()=>({})});
 expect((await run({action:'next'})).current.id).toBe('last');
});
