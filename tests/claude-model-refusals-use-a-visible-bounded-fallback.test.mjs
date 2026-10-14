// A model-specific refusal must choose a bounded replacement, without mistaking account limits or late user choices for permission to switch.
import {describe,it,expect,vi} from 'vitest';
import {Supervisor} from '../main/supervisor.mjs';
import {troubleCause} from '../shared/spawn-trouble.mjs';
const refusal='You do not have access to the model claude-opus-5-5.';
function setup(model='opus') {
 const s=Object.create(Supervisor.prototype),item={id:'w-example',product:'example',engine:'claude',model,status:'open'};
 s.config={codexBin:'/example/codex'};s.store={readItem:()=>item,answerItem:vi.fn(),recordSessionResult:vi.fn()};s._saveState=vi.fn();s._codexLoginWithModel=()=> 'default';
 return {s,item,session:{itemId:item.id,product:item.product,engine:'claude',model,profile:'default',startedAt:Date.now(),tail:[],result:refusal,resultIsError:true}};
}
describe('model refusals',()=>{
 it('recognizes Claude model access refusals',()=>expect(troubleCause(refusal)).toBe('model-not-on-plan'));
 it('does not confuse usage limits or file permissions with a model refusal',()=>{
  expect(troubleCause("You've hit your usage limit")).toBe('at-limit');
  expect(troubleCause('Permission denied opening a project file')).not.toBe('model-not-on-plan');
 });
 it('replaces refused Opus with Sonnet and records the reason',()=>{
  const {s,session}=setup();s.noteExitForBackoff(session);
  expect(s.store.answerItem).toHaveBeenCalledWith('example','w-example',{engine:'claude',model:'sonnet'});
  expect(session.modelFallback.notice).toMatch(/opus.*sonnet/i);
  expect(session.accountFault.cause).toBe('model-not-on-plan');
 });
 it('uses an available Codex login when Sonnet is refused too',()=>{
  const {s,session}=setup('sonnet');s.noteExitForBackoff(session);
  expect(s.store.answerItem).toHaveBeenCalledWith('example','w-example',{engine:'codex',model:'gpt-6.1-sol'});
 });
 it('never guesses an unavailable Codex model',()=>{
  const {s,session}=setup('sonnet');s._codexLoginWithModel=()=>null;s.noteExitForBackoff(session);
  expect(s.store.answerItem).not.toHaveBeenCalled();
 });
 it('preserves a newer manual model selection',()=>{
  const {s,item,session}=setup();item.model='haiku';s.noteExitForBackoff(session);
  expect(s.store.answerItem).not.toHaveBeenCalled();
 });
 it('preserves a finished task and an explicit stop',()=>{
  const {s,item,session}=setup();item.status='done';s.noteExitForBackoff(session);expect(s.store.answerItem).not.toHaveBeenCalled();
  item.status='open';session.stoppedByUs=true;s.noteExitForBackoff(session);expect(s.store.answerItem).not.toHaveBeenCalled();
 });
 it('keeps the fallback notice instead of overwriting it with a dead-run message',()=>{
  const {s,item,session}=setup();s.noteExitForBackoff(session);s.sayTheRunDied(item,session);
  expect(s.store.recordSessionResult).toHaveBeenCalledTimes(1);
  expect(s.store.recordSessionResult.mock.calls[0][2]).toMatchObject({status:null,result:session.modelFallback.notice});
 });

});
