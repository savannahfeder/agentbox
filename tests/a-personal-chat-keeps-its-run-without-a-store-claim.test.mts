// Real personal-chat browser test, 2026-09-16: the trace contained one hook
// warning but the thread showed zero. Personal workers do not claim store
// items, and itemThread dropped all run lines when there was no claim event.
import { it, expect } from 'vitest';
import { itemThread } from '../renderer/src/item-thread.ts';
const at = Date.parse('2026-09-17T01:00:00Z');
const lines = [{id:'w-test',ts:at,source:'founder',patch:{title:'Probe',body:'Test the hook.'}}];
const run = {startedAt:at+1000,text:'01:00:02  Hook SessionStart:resume failed (exit 1).\nHOOK-WARNING-824\n01:00:03  Work continues.'};
it('shows run diagnostics and narration even without a store claim', () => {
  const result = itemThread(lines,[run]);
  const text = result.events.map(x=>x.text).join('\n');
  expect(text).toContain('HOOK-WARNING-824');
  expect(text).toContain('Work continues.');
  expect(result.events.filter(x=>x.text?.includes('HOOK-WARNING-824'))).toHaveLength(1);
});
it('does not duplicate a project run already associated with a claim', () => {
  const claim={id:'w-test',ts:at+1500,source:'agent',claim:{holder:'test',leaseUntil:at+10000},patch:{status:'claimed'}};
  const result=itemThread([...lines,claim],[run]);
  expect(result.events.filter(x=>x.text?.includes('HOOK-WARNING-824'))).toHaveLength(1);
});
it('keeps an ordinary chat with no trace unchanged', () => {
  expect(itemThread(lines,[]).events.some(x=>x.text?.includes('Hook'))).toBe(false);
});
