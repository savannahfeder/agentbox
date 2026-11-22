// THE TEAM BESIDE NEEDS YOU SAYS WHO WAITS ON YOU (2026-10-30).
//
// The home was two tabs: Needs you, and Everything else with the team as cards
// over a board. The owner called the cards "a very large, cluttered area", and
// people on a team kept who-owes-whom in their heads ("I still keep a
// note in my head for: who owes me what"). Each person and AI teammate says in a
// word how they are, and "Waiting on you" when something of theirs is in Needs
// you. The two tabs stay one choice away in View and filters. Counted here, so a
// face can never say more waits on you than Needs you holds.
import { describe, it, expect } from 'vitest';
import { nowAndFinished, statusWord, waitsOnYou, youWaitOn } from '../renderer/src/team/everything/place.ts';

const mateOf = (r) => r.labels?.find((l) => l.startsWith('teammate:'))?.slice('teammate:'.length) ?? null;

describe('what waits on you, by who', () => {
  const needs = [
    { product: 'tasks', createdBy: 'p-dev' },
    { product: 'lumen', labels: ['teammate:t-cos'] },
    { product: 'lumen', labels: ['teammate:t-cos'] },
    { product: 'lumen', createdBy: 'p-me' },
    { product: 'lumen' },
    { product: 'direct-sofia' },
  ];
  const got = waitsOnYou({ needs, mentions: [{ by: 'p-sofia' }, { by: 'p-me' }, { by: null }], me: 'p-me', mateOf, directWith: (p) => (p === 'direct-sofia' ? 'p-sofia' : null) });

  it('counts a task a person gave you for them', () => {
    expect(got.get('person:p-dev')).toBe(1);
  });

  it('counts each run your AI teammate stopped for you', () => {
    expect(got.get('mate:t-cos')).toBe(2);
  });

  it('counts a conversation with a person and their mention, for them', () => {
    expect(got.get('person:p-sofia')).toBe(2);
  });

  it('never counts what you made yourself, or your own agents, for anyone', () => {
    expect(got.get('person:p-me')).toBeUndefined();
    expect([...got.values()].reduce((a, b) => a + b, 0)).toBe(5);
  });
});

describe('what you wait on a person for', () => {
  const items = [
    { id: 'a', assignee: 'p-dev', createdBy: 'p-me', status: 'open' },
    { id: 'b', assignee: 'p-dev', createdBy: 'p-me', status: 'done' },
    { id: 'c', assignee: 'p-dev', createdBy: 'p-sofia', status: 'open' },
    { id: 'd', assignee: 'p-sofia', createdBy: 'p-me', status: 'open' },
  ];

  it('is the tasks you gave them that are not done', () => {
    expect(youWaitOn(items, 'p-me', 'p-dev').map((i) => i.id)).toEqual(['a']);
  });

  // A tester's page listed a teammate's own threads under "Tasks you gave Lena": rows that name no maker.
  it("is not a thread of theirs that names nobody as its maker", () => {
    expect(youWaitOn([...items, { id: 'e', assignee: 'p-dev', status: 'open' }], 'p-me', 'p-dev').map((i) => i.id)).toEqual(['a']);
    expect(youWaitOn(items, null, 'p-dev')).toEqual([]);
  });

  it('is not a task someone else gave them, nor one given to another person', () => {
    expect(youWaitOn(items, 'p-me', 'p-dev').some((i) => i.id === 'c' || i.id === 'd')).toBe(false);
  });
});

describe('the one word under a name', () => {
  it('says Waiting on you over anything else when something of theirs is in Needs you', () => {
    expect(statusWord({ key: 'person:p-dev', kind: 'person', agents: 3, inProgress: 3, now: 'Webhooks' }, 1)).toBe('Waiting on you');
    expect(statusWord({ key: 'person:p-dev', kind: 'person', agents: 0, now: null }, 3)).toBe('3 waiting on you');
  });

  it('never says Waiting on you about yourself', () => {
    expect(statusWord({ key: 'me', kind: 'me', agents: 1, now: null }, 2)).toBe('1 agent working');
  });

  it('says someone else\'s AI teammate waits on its owner, not on you', () => {
    expect(statusWord({ key: 'theirmate:p-dev:t-rel', kind: 'mate', agents: null, now: 'Waiting on you' })).toBe('Waiting on its owner');
    expect(statusWord({ key: 'theirmate:p-dev:t-rel', kind: 'mate', agents: null, now: 'Cutting 2.4', running: true })).toBe('Working');
  });

  it('never says what they are on', () => {
    expect(statusWord({ key: 'person:p-dev', kind: 'person', agents: 2, now: 'Move webhooks' })).not.toContain('webhooks');
    expect(statusWord({ key: 'mate:t-cos', kind: 'mate', agents: 0, now: 'Reading the brief' })).toBe('Free');
  });
});


describe('a place\'s two lists', () => {
  const now = 10 * 24 * 3600_000;
  const rows = [{ id: 'a', done: false, at: now - 5 }, { id: 'b', done: true, at: now - 1000 }, { id: 'c', done: true, at: now - 8 * 24 * 3600_000 }, { id: 'd', done: false, at: now - 1 }];
  const split = nowAndFinished(rows, { done: (r) => r.done, at: (r) => r.at, now });

  it('puts what is under way first, newest first', () => {
    expect(split.now.map((r) => r.id)).toEqual(['d', 'a']);
  });

  it('keeps only the last week of what finished', () => {
    expect(split.finished.map((r) => r.id)).toEqual(['b']);
  });
});
