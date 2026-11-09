// THE TEAM VIEW SAYS WHAT THE TASKS TAB SAYS, AND FOLDS OLD WAITING THREADS.
//
// The Team view's Agents list read "Fix double booking issue ·
// WAITING ON DEV" while the Tasks tab and the thread said "Blocked on Jordan's
// answers to Dev's five questions", and under it sat about 30 "WAITING ON DEV"
// rows from the day before. Measured on CardRow and personCardsOf: the row's
// word came from the card's state and linkWords, which reads people and
// threads but not a block in plain words, and every shared card not done was
// listed however old. Now a task's row takes the Tasks tab's word, and an
// agent thread older than today that only waits on its owner is left out.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { cardTaskWord } from '../renderer/src/team/tasks.ts';
import { personCardsOf, mateRunsOf } from '../renderer/src/team/everything/members.ts';

const DAY = new Date(2026, 10, 1).getTime();
const NOW = DAY + 3 * 3_600_000;
const nameOf = (id) => ({ dev: 'Dev', maya: 'Maya' }[id] ?? 'Someone');
const BLOCK = "name:Jordan's answers to Dev's five questions";
const card = (over = {}) => ({ personId: 'dev', threadId: 't1', visible: true, title: 'Fix double booking issue', project: 'Task', state: 'waiting', priority: null,
  problem: null, progress: null, solution: null, blockedBy: [], blocks: [], people: null, updatedAt: NOW - 60_000, ...over });

describe('a task’s row on the Team view', () => {
  const direct = { slug: 'direct-dev', name: 'Dev', team: { projectId: 'p', direct: true, people: ['dev', 'maya'] } };
  const row = { id: 't1', product: 'direct-dev', status: 'open', title: 'Fix double booking issue', labels: ['given-task'], assignee: 'dev', people: ['maya', 'dev'], createdBy: 'maya',
    blockedBy: [BLOCK], wrote: { blockedBy: { ts: NOW - 120_000, source: 'founder', by: 'maya' } }, createdAt: NOW - 3_600_000, updatedAt: NOW - 60_000 };
  it('reads the task on this Mac the way the Tasks tab does', () => {
    const word = cardTaskWord(card({ task: { from: 'maya' } }), { items: [row], products: [direct], cards: [], me: 'maya', nameOf });
    expect(word).toMatch(/^Blocked on Jordan/);
  });
  it('reads a task only on its card from the card’s own block', () => {
    const word = cardTaskWord(card({ task: { from: 'sofia' }, blockedBy: [{ id: BLOCK, title: null }] }), { items: [], products: [], cards: [], me: 'maya', nameOf });
    expect(word).toMatch(/^Blocked on Jordan/);
  });
  it('a task with no block says nothing of its own, and the card’s state stands', () => {
    expect(cardTaskWord(card({ task: { from: 'sofia' } }), { items: [], products: [], cards: [], me: 'maya', nameOf })).toBeNull();
  });
  it('an agent thread is not a task', () => {
    expect(cardTaskWord(card(), { items: [row], products: [direct], cards: [], me: 'maya', nameOf })).toBeNull();
  });
});

describe('which shared threads are listed', () => {
  const shown = (cards) => personCardsOf(cards, 'dev', DAY).map((c) => c.threadId);
  it('an agent thread from yesterday that only waits on its owner is left out', () => {
    expect(shown([card({ threadId: 'old', updatedAt: DAY - 3_600_000 })])).toEqual([]);
  });
  it('one that waited on its owner today is listed', () => {
    expect(shown([card({ threadId: 'today', updatedAt: DAY + 60_000 })])).toEqual(['today']);
  });
  it('yesterday’s running, scheduled and task cards stay', () => {
    expect(shown([
      card({ threadId: 'run', state: 'running', updatedAt: DAY - 3_600_000 }),
      card({ threadId: 'sched', state: 'scheduled', updatedAt: DAY - 3_600_000 }),
      card({ threadId: 'task', task: { from: 'maya' }, updatedAt: DAY - 3_600_000 }),
    ]).sort()).toEqual(['run', 'sched', 'task']);
  });
  it('an AI teammate’s run waiting on its owner since yesterday is left out; a queued one stays', () => {
    const items = [
      { id: 'a', labels: ['teammate:t1'], status: 'blocked', updatedAt: DAY - 3_600_000 },
      { id: 'b', labels: ['teammate:t1'], status: 'blocked', updatedAt: DAY + 60_000 },
      { id: 'c', labels: ['teammate:t1'], status: 'open', updatedAt: DAY - 3_600_000 },
    ];
    expect(mateRunsOf(items, 't1', DAY).map((i) => i.id).sort()).toEqual(['b', 'c']);
  });
});

it('the Team view’s row asks the task’s word first', () => {
  const strip = fs.readFileSync(new URL('../renderer/src/team/everything/TeamStrip.tsx', import.meta.url), 'utf8');
  expect(strip).toMatch(/cardTaskWord\(c, /);
});
