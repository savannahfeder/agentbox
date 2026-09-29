// The answer to a question she asked has to reach her.
//
// Every one of them HAD been done. She asked the same metrics question three
// times in six and a half hours ( 19:29 00:44 01:55, that last one tagged
// urgent), and a worker answered each within twenty minutes with a real
// readout. She never saw any of them, because an item she composed is in no
// list she reads: while it waits and while it runs it is under In Progress, and
// the moment a worker finishes it, it is `done`, and `done` was the first line
// of the inbox filter. Her own asks went from In Progress to the archive
// without ever passing her. The screenshot she sent was taken in the Done tab,
// on a 51-minute-old answer she had gone digging for.
//
// So: her ask, ended by an AGENT, is an answer she has not received. Her ask
// ended by HER is filed. Same word, opposite events, and the ledger has always
// known which was which.

import { describe, it, expect } from 'vitest';
import { belongsInInbox, statusForReply } from '../renderer/src/list-rules';

const T = 1_786_000_000_000;

// Shaped exactly as the fold hands them over (shared/work-items.mjs).
const hersAndAnswered = {
  id: 'w-d6d138a2ea', product: 'harbour-new', status: 'done', kind: 'directive',
  labels: ['founder'], priority: 9, title: 'can you check our metrics?',
  result: 'Checked, and there is real news...',
  createdAt: T, updatedAt: T + 650_000,
  wrote: { title: { ts: T, source: 'founder' }, status: { ts: T + 650_000, source: 'agent' } },
};

describe('the answer to her own ask', () => {
  it('arrives in her inbox when a worker finishes it', () => {
    expect(belongsInInbox(hersAndAnswered, { deliveredThrough: T - 1 })).toBe(true);
  });

  it('leaves when she archives it, and does not come back', () => {
    const archived = {
      ...hersAndAnswered,
      wrote: { ...hersAndAnswered.wrote, status: { ts: T + 900_000, source: 'founder' } },
    };
    expect(belongsInInbox(archived, { deliveredThrough: T - 1 })).toBe(false);
  });

  it('does not drag the whole archive back in on the first run after this change', () => {
    // Twenty-one of her asks were already finished and filed before delivery
    // existed. They stay where she has been finding them.
    expect(belongsInInbox(hersAndAnswered, { deliveredThrough: T + 999_999 })).toBe(false);
  });

  it('still keeps work SHE ended, and work that was never hers, out', () => {
    const agentFiled = {
      ...hersAndAnswered, id: 'w-1', labels: ['review'], kind: 'review',
      wrote: { status: { ts: T + 650_000, source: 'agent' } },
    };
    expect(belongsInInbox(agentFiled, { deliveredThrough: T - 1 })).toBe(false);
  });
});

describe('replying on a thread that already finished', () => {
  // The supervisor only carries an answer to a worker while the item is open,
  // so this is what decides whether her follow-up is read or lost.
  it('hands the thread back so her follow-up reaches a worker', () => {
    expect(statusForReply('done')).toBe('open');
    expect(statusForReply('blocked')).toBe('open');
  });

  it('leaves a thread alone while a worker is on it', () => {
    // deliverMidflightReply carries the reply when that session exits; a
    // handback here would put a second worker on the same item.
    expect(statusForReply('claimed')).toBeUndefined();
    expect(statusForReply('open')).toBeUndefined();
  });
});

describe('what the inbox held before, unchanged', () => {
  const base = { id: 'w-2', product: 'p', priority: 5, createdAt: T, updatedAt: T, wrote: {} };

  it('holds an unanswered question and lets go of an answered one', () => {
    expect(belongsInInbox({ ...base, kind: 'question', status: 'open', labels: [] })).toBe(true);
    expect(belongsInInbox({ ...base, kind: 'question', status: 'open', labels: [], answer: 'option 2' })).toBe(false);
  });

  it('holds an agent proposal until she answers it', () => {
    expect(belongsInInbox({ ...base, kind: 'task', status: 'open', labels: [] })).toBe(true);
    expect(belongsInInbox({ ...base, kind: 'task', status: 'open', labels: [], answer: 'run it' })).toBe(false);
  });

  it('treats a withdrawn answer as no answer', () => {
    expect(belongsInInbox({ ...base, kind: 'review', status: 'open', labels: [], answer: '(withdrawn)' })).toBe(true);
  });

  it('holds anything blocked', () => {
    expect(belongsInInbox({ ...base, kind: 'task', status: 'blocked', labels: ['founder'] })).toBe(true);
  });

  it('keeps her own ask out while it is queued and while it runs', () => {
    // Those two states are what In Progress is for; a row in both places is the
    // duplication the one-thread-one-row rule exists to prevent.
    expect(belongsInInbox({ ...base, kind: 'directive', status: 'open', labels: ['founder'] })).toBe(false);
    expect(belongsInInbox({ ...base, kind: 'directive', status: 'claimed', labels: ['founder'] })).toBe(false);
  });
});
