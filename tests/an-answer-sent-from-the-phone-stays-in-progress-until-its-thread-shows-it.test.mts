// AN ANSWER SENT FROM THE PHONE STAYS IN PROGRESS UNTIL ITS THREAD SHOWS IT.
//
// In phone session m19 (2026-11-15) the tester answered thread D on the
// phone. The computer moved D to In progress within about 20 seconds, but a
// minute later the phone still listed it in Needs you. The phone marks a
// thread answered while her reply waits, and dropped that mark as soon as a
// copy of the thread stamped later than the moment the computer took the reply
// arrived, whether or not that copy had her answer in it. A copy built before
// the answer landed but sent after it put D back in Needs you until the next
// one. Measured with phoneView and phoneTabs on such a copy. Now the mark stays
// until the copy shows her words, or shows the agent answering after them.
import { describe, it, expect } from 'vitest';
import { phoneView, phoneSlug } from '../renderer/src/phone-rows';
import { phoneTabs } from '../mobile/src/lib/tabs';

const NOW = Date.parse('2026-11-15T18:30:00Z');
const DEV = 'a1b2c3d4e5f6';
const iso = (ms) => new Date(ms).toISOString();
const RES = '**Which way?**\n\nI can do it two ways.\n\n## Options\n1. The first (recommended)\n2. The second';
const PICK = 'Option 1: The first (recommended)';
const SENT = NOW - 58_000;
const TAKEN = NOW - 50_000;
const asked = { id: 'w-1', title: 'D thread', status: 'open', kind: 'question', labels: ['founder'], priority: 0, createdAt: NOW - 9e6, updatedAt: NOW - 9e5, result: RES, wrote: { result: { ts: NOW - 9e5, source: 'agent' } } };
const history = [{ id: 'w-1', ts: NOW - 9e5, source: 'agent', patch: { result: RES } }];

function tabOf({ item = asked, lines = history, copyAt, taken = true }) {
  const cmd = { id: 'c1', device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: PICK }, created_at: iso(SENT), ...(taken ? { taken_at: iso(TAKEN), outcome: 'done' } : { taken_at: null, outcome: null }) };
  const rows = { projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(NOW) }], threads: [{ device: DEV, project: 'alpha', item: 'w-1', updated_at: iso(copyAt), snapshot: { v: 3, item, history: lines } }], commands: [cmd] };
  const tabs = phoneTabs(phoneView(rows, NOW), NOW);
  return Object.keys(tabs).find((k) => tabs[k].length) ?? null;
}

describe('a thread answered on the phone', () => {
  it('is In progress while the computer has not taken the answer', () => {
    expect(tabOf({ copyAt: NOW - 60_000, taken: false })).toBe('progress');
  });
  it('is In progress once taken, under a copy from before', () => {
    expect(tabOf({ copyAt: TAKEN - 10_000 })).toBe('progress');
  });
  it('stays In progress under a later copy that does not have the answer yet (the reported case)', () => {
    expect(tabOf({ copyAt: TAKEN + 30_000 })).toBe('progress');
  });
  it('is In progress under a copy that has the answer', () => {
    const answered = { ...asked, status: 'claimed', answer: PICK, wrote: { ...asked.wrote, answer: { ts: SENT + 2_000, source: 'founder' } } };
    expect(tabOf({ item: answered, lines: [...history, { id: 'w-1', ts: SENT + 2_000, source: 'founder', patch: { answer: PICK } }], copyAt: TAKEN + 30_000 })).toBe('progress');
  });
});

describe('what still brings it back to Needs you', () => {
  it('the agent answering after her pick, even before the copy shows the pick', () => {
    const next = { ...asked, result: 'Done the first way. Anything else?', wrote: { result: { ts: TAKEN + 20_000, source: 'agent' } } };
    expect(tabOf({ item: next, lines: [...history, { id: 'w-1', ts: TAKEN + 20_000, source: 'agent', patch: { result: next.result } }], copyAt: TAKEN + 30_000 })).toBe('inbox');
  });
});
