// DISMISSING A PROPOSED TASK DOES NOT START THE THREAD WAITING ON IT (w-34443a206b).
//
// A tester on 2026-11-22 dismissed a task an agent had filed for their yes,
// and the thread parked behind it started a run straight away. Dismiss is a
// close, and the resume rule took any closed blocker as finished work, so a
// "no" read as "done, carry on". Measured on resumeFinishedWaits, which every
// tick runs over the blocked threads.
import { beforeEach, describe, expect, it } from 'vitest';
import { Supervisor } from '../main/supervisor.mts';

const T = 1_786_000_000_000;
type Row = Record<string, unknown> & { id: string; status: string };

let sup: InstanceType<typeof Supervisor>;
let items: Row[];
let reopened: Row[];

const row = (id: string, over: Record<string, unknown> = {}): Row => ({ id, product: 'p', status: 'open', kind: 'task', title: id, labels: [], wrote: {}, ...over });
const waiting = (id: string, blockedBy: string[]) => row(id, {
  status: 'blocked', blockedBy, labels: ['founder'],
  wrote: { status: { ts: T, source: 'agent' }, blockedBy: { ts: T, source: 'agent' } },
});
const closedByYou = (id: string, over: Record<string, unknown> = {}) => row(id, {
  status: 'done', parent: 'w-thread', ...over,
  wrote: { status: { ts: T + 1000, source: 'founder' }, ...(over.wrote as object ?? {}) },
});

beforeEach(() => {
  reopened = [];
  items = [];
  sup = new Supervisor(
    { home: '/nonexistent-home-with-no-second-account', storeRoot: '/nonexistent-zero-root', maxConcurrentSessions: 2, authProfiles: ['default'] },
    {
      listItems: () => items,
      listProducts: () => [],
      isDue: () => true,
      answerItem: (_product: string, id: string, patch: Record<string, unknown>) => { reopened.push({ id, status: String(patch.status) }); return items.find((i) => i.id === id); },
    },
    '/nonexistent-app',
  );
  sup.spawnWorker = () => {};
  sup._waitsSince = T - 1;
});

describe('a task you dismissed before saying yes', () => {
  it('does not start the thread waiting on it', () => {
    items = [closedByYou('w-task'), waiting('w-thread', ['w-task'])];
    expect(sup.resumeFinishedWaits(items)).toEqual([]);
    expect(reopened).toEqual([]);
    expect(sup._resumeQueue.has('w-thread')).toBe(false);
  });

  it('nor when it was one of two and the other finished', () => {
    const other = row('w-other', { status: 'done', wrote: { status: { ts: T + 2000, source: 'agent' } } });
    items = [closedByYou('w-task'), other, waiting('w-thread', ['w-task', 'w-other'])];
    expect(sup.resumeFinishedWaits(items)).toEqual([]);
  });
});

describe('what still resumes the thread', () => {
  it('a task you approved, which then ran and you closed', () => {
    items = [closedByYou('w-task', { answer: 'Approved. Run it.', wrote: { answer: { ts: T + 500, source: 'founder' } } }), waiting('w-thread', ['w-task'])];
    expect(sup.resumeFinishedWaits(items)).toEqual(['w-thread']);
  });

  it('a task its agent finished', () => {
    items = [row('w-task', { status: 'done', parent: 'w-thread', wrote: { status: { ts: T + 1000, source: 'agent' } } }), waiting('w-thread', ['w-task'])];
    expect(sup.resumeFinishedWaits(items)).toEqual(['w-thread']);
  });

  it('a task you wrote yourself and closed', () => {
    items = [closedByYou('w-task', { labels: ['founder'] }), waiting('w-thread', ['w-task'])];
    expect(sup.resumeFinishedWaits(items)).toEqual(['w-thread']);
  });

  it('a cause you cleared by hand, which every thread behind it waits on', () => {
    items = [closedByYou('w-cause', { kind: 'cause', parent: undefined, labels: ['cause'] }), waiting('w-thread', ['w-cause'])];
    expect(sup.resumeFinishedWaits(items)).toEqual(['w-thread']);
  });
});
