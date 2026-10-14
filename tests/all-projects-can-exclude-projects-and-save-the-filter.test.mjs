// All projects used an empty selection, so the next click selected only one project instead of excluding it.
import {it,expect} from 'vitest';
import {DEFAULT_DISPLAY,keeps,toggleProject,projectSelected,readSavedFilters,writeSavedFilters,readDisplay,writeDisplay} from '../renderer/src/threads/page-rules.ts';
const row=product=>({product,priority:2,updatedAt:Date.now()});
it('all mode excludes one project and includes newly added projects',()=>{
 const all={...DEFAULT_DISPLAY.inbox,projectMode:'all',projects:[],excludedProjects:[]};
 const d=toggleProject(all,'qa-a');
 expect(projectSelected(d,'qa-a')).toBe(false);expect(projectSelected(d,'qa-b')).toBe(true);
 expect(keeps(row('qa-a'),d,Date.now())).toBe(false);expect(keeps(row('qa-new'),d,Date.now())).toBe(true);
 expect(projectSelected(toggleProject(d,'qa-a'),'qa-a')).toBe(true);
});
it('none and a legacy explicit selection remain distinguishable from all',()=>{
 const none={...DEFAULT_DISPLAY.inbox,projects:[],projectMode:'selected'};
 expect(keeps(row('qa-a'),none,Date.now())).toBe(false);
 const d=toggleProject(none,'qa-b');expect(keeps(row('qa-b'),d,Date.now())).toBe(true);expect(keeps(row('qa-a'),d,Date.now())).toBe(false);
 expect(projectSelected({...DEFAULT_DISPLAY.inbox,projects:['qa-b']},'qa-a')).toBe(false);
});
it('persists the active filter and named filters, including removing a saved filter',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
 const display=toggleProject({...DEFAULT_DISPLAY.inbox,projects:[]},'qa-a');
 writeDisplay('inbox',display,storage);expect(readDisplay('inbox',storage)).toMatchObject({excludedProjects:['qa-a'],projectMode:'all'});
 writeSavedFilters('inbox',[{id:'qa',name:'Favorites',display}],storage);
 expect(readSavedFilters('inbox',storage)[0]).toMatchObject({name:'Favorites',display:{excludedProjects:['qa-a']}});
 writeSavedFilters('inbox',[],storage);expect(readSavedFilters('inbox',storage)).toEqual([]);
 data.set('threads.savedFilters.inbox','not json');expect(readSavedFilters('inbox',storage)).toEqual([]);
});

it('the empty inbox can clear both inclusion and exclusion filters',async()=>{
 const {readFileSync}=await import('node:fs');
 const app=readFileSync(new URL('../renderer/src/App.tsx',import.meta.url),'utf8');
 expect(app).toContain("onClear={() => setInboxDisplay({ ...inboxDisplay, priorities: [], projects: [], excludedProjects: [], projectMode: 'all', updated: 'any', privacy: 'any' })}");
});
