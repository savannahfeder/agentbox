// 2026-09-16 real browser test: after switching the workspace to Codex, an
// existing Claude chat's byline and reply routing changed to Codex. Its row
// omitted the then-default engine. Saved session ownership must win over
// workspace changes, while explicit choices and capability gates remain.
//
// Half of these cases used to run on a personal project, which kept its chats
// in a map of its own. Personal projects are deleted (w-d19d6d387c,
// 2026-09-22), so every case here reads the one map, `_rowSessions`.
import {expect,it} from 'vitest';
import {Supervisor} from '../main/supervisor.mjs';
function setup(workspace='codex'){
 const s=Object.create(Supervisor.prototype);
 s.config={engine:workspace,engineChoice:'2026-09-01T00:00:00Z',codexBin:'/codex'};
 s._rowSessions={
  one:{sessionId:'c1',product:'mine',engine:'claude'},
  two:{sessionId:'c2',product:'project',engine:'claude'},
 };
 s._sayTheChoiceIsOld=()=>{};
 return s;
}
it.each([['mine','one'],['project','two']])('keeps a saved Claude chat in %s after changing workspace to Codex',(product,id)=>{
 const s=setup();const item={id,product};
 expect(s._engineFor(item)).toBe('claude');
 expect(s.engineFacts([item]).byItem[item.id]).toBe('claude');
});
it('keeps a saved Codex chat after changing workspace to Claude',()=>{
 const s=setup('claude');s._rowSessions.one.engine='codex';
 expect(s._engineFor({id:'one',product:'mine'})).toBe('codex');
});
it('does not let another project’s session choose this task’s engine',()=>{
 const s=setup();expect(s._engineFor({id:'two',product:'other'})).toBe('codex');
});
it('leaves fresh tasks and explicit current choices to the existing resolver',()=>{
 const s=setup();expect(s._engineFor({id:'new',product:'mine'})).toBe('codex');
 expect(s._engineFor({id:'one',product:'mine',engine:'codex',wrote:{engine:{ts:'2026-09-16T00:00:00Z'}}})).toBe('codex');
});
it('does not bypass the Codex gate or installation check for saved chats',()=>{
 const s=setup('claude');s._rowSessions.one.engine='codex';
 s.config.codexBin=null;expect(s._engineFor({id:'one',product:'mine'})).toBe('claude');
 s.config.codexBin='/codex';s.config.engineChoice=null;expect(s._engineFor({id:'one',product:'mine'})).toBe('claude');
});
