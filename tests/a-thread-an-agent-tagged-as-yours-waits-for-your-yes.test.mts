// A THREAD AN AGENT TAGGED AS YOURS WAITS FOR YOUR YES, AND SAYS SO.
//
// What broke (w-d08dcbb6fc, 2026-10-28): "Voice dictation for Pro users" sat in
// In progress reading "Nothing running" for two days. Read off the store: an
// agent filed it under another thread with the `founder` tag, and the ledger
// recorded the tag as the agent's write. The queue refuses a tag an agent wrote
// (`_isFreshWork`), so nothing would ever start it. The list read only whether
// the tag was there (`hers` in list-rules.ts), so it promised an agent was
// coming. Of the 26 open threads in that store, it was the only one whose tag
// an agent wrote.
//
// Now both read one rule (`filedByThePerson` in shared/answers.mts): the thread
// is a proposal, in Later under the thread that filed it, or in Needs you when
// it was filed under none.

import { describe, it, expect } from 'vitest';
import { belongsInInbox, belongsInProgress, isProposal } from '../renderer/src/list-rules.ts';
import { filedByThePerson } from '../shared/answers.mts';
import { Supervisor } from '../main/supervisor.mts';

const NOW = Date.parse('2026-10-28T21:00:00Z');
const at = NOW - 2 * 86_400_000;

// The row as the store had it, less its words.
const reported = {
  id: 'w-b52b36c4df', product: 'agentbox-team', status: 'open', kind: 'directive',
  labels: ['founder', 'web-app'], parent: 'w-ba7eabe9fd', priority: 0, createdAt: at, updatedAt: at,
  note: 'Folded into the web app thread, where dictation is now being built. Nothing runs here.',
  wrote: {
    title: { ts: at, source: 'agent' },
    body: { ts: at, source: 'agent' },
    labels: { ts: at, source: 'agent' },
    note: { ts: at + 1000, source: 'agent' },
  },
};

const written = (source) => ({ ...reported, parent: undefined, wrote: { title: { ts: at, source }, labels: { ts: at, source: source === 'founder' ? 'system' : source } } });

const queue = () => {
  const sup = Object.create(Supervisor.prototype);
  sup.config = {};
  sup._fruitless = {};
  return sup;
};

describe('the thread that was reported', () => {
  it('is not in In progress', () => {
    expect(belongsInProgress(reported, { now: NOW })).toBe(false);
  });

  it('is a proposal under the thread that filed it', () => {
    expect(isProposal(reported)).toBe(true);
    expect(belongsInInbox(reported, { now: NOW })).toBe(false);
  });

  it('is in Needs you when it was filed under no thread', () => {
    const loose = { ...reported, parent: undefined };
    expect(belongsInProgress(loose, { now: NOW })).toBe(false);
    expect(belongsInInbox(loose, { now: NOW })).toBe(true);
  });
});

describe('a thread whose tag the person or the app wrote', () => {
  it('is In progress when you wrote it', () => {
    expect(belongsInProgress(written('founder'), { now: NOW })).toBe(true);
  });

  it('is In progress when it is older than the record of who wrote what', () => {
    const { wrote, ...legacy } = written('founder');
    expect(belongsInProgress(legacy, { now: NOW })).toBe(true);
  });
});

describe('the list and the queue read one rule', () => {
  const rows = [reported, { ...reported, parent: undefined }, written('founder'), written('agent')];
  it.each(rows.map((r, i) => [i, r]))('row %i is In progress exactly when the queue would start it', (_, row) => {
    expect(belongsInProgress(row, { now: NOW })).toBe(queue()._isFreshWork(row, NOW, new Set()));
  });

  it('is one function', () => {
    expect(filedByThePerson(reported)).toBe(false);
    expect(filedByThePerson(written('founder'))).toBe(true);
    expect(filedByThePerson({ labels: ['web-app'] })).toBe(false);
  });
});
