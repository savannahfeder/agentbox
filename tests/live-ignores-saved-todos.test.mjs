// Saved manual tasks must never be read or acted on by live triage, even when open on screen.
import {it,expect,vi} from 'vitest';
import {desktopLiveRows,desktopLiveView,desktopLiveActions} from '../shared/desktop-live-actions.mjs';
const todo={id:'todo',product:'p',start:'manual',title:'Personal to-do',result:'Private reminder',status:'blocked'};
const agent={id:'agent',product:'p',start:'now',title:'Agent needs help',status:'blocked'};
it('excludes manual todos while keeping agent questions and running chats',()=>{
 expect(desktopLiveRows([todo,agent],[{...todo,id:'other'},{id:'running',product:'p',status:'claimed'}]).map(i=>i.id)).toEqual(['agent','running']);
});
it('does not expose a selected todo or its text in the live view',()=>{
 const view=desktopLiveView(todo,[todo,agent]);expect(view.current).toBeNull();expect(view.latestAgentResult).toBe('');expect(JSON.stringify(view)).not.toContain('Personal to-do');expect(view.availableChats.map(i=>i.id)).toEqual(['agent']);
});
it('ignores a selected todo and reviews the next agent without modifying the todo',async()=>{
 let current=todo;const done=vi.fn();const run=desktopLiveActions({state:()=>({current,rows:[todo,agent]}),open:i=>current=i,details:async()=>({}),done,reply:async()=>{},later:async()=>{}});
 expect((await run({action:'read'})).current).toBeNull();await expect(run({action:'done',id:'todo'})).rejects.toThrow();await expect(run({action:'open',id:'todo'})).rejects.toThrow();expect(done).not.toHaveBeenCalled();expect((await run({action:'review'})).current.id).toBe('agent');
});
it('returns no chat when only todos remain',async()=>{
 const run=desktopLiveActions({state:()=>({current:todo,rows:[todo]}),open(){},details:async()=>({}),done:async()=>{},reply:async()=>{},later:async()=>{}});
 expect(await run({action:'review'})).toMatchObject({current:null,availableChats:[],empty:true});
});
