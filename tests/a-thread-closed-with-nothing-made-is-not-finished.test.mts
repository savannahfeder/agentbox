// A THREAD CLOSED WITH NOTHING MADE IS NOT FINISHED (2026-11-20).
//
// On a synthetic team, Lena closed a duplicate mockup thread with E while its
// agent was stuck and had made nothing. Friday's standup then said "Finished
// Bookings list empty state mockups" and "1 thing done since Thu". The thread
// was done with no result, no progress and no solution: the standup counted
// every closed thread as finished. Measured by feeding teamToday her row and a
// teammate's card in the same state and reading the Finished lists.
//
// A thread counts as finished when it has something to show for it: an
// agent's answer or a written summary. A task closed by a person needs none.
import { describe, it, expect } from 'vitest';
import { teamToday } from '../renderer/src/team/today.ts';
import { postsOf, sentenceOf } from '../renderer/src/team/standup.ts';

const NOW = new Date(2026, 10, 20, 15, 0).getTime();
const at = (h: number) => new Date(2026, 10, 20, h, 0).getTime();
const products = [{ slug: 'web-app', name: 'Web app', team: {} }];
const item = (o: Record<string, unknown>) => ({ product: 'web-app', status: 'done', labels: ['founder'], updatedAt: at(11), createdAt: at(9), title: String(o.id), ...o });
const card = (o: Record<string, unknown>) => ({ personId: 'p-priya', visible: true, state: 'done', project: 'Web app', blockedBy: [], blocks: [], people: null, priority: null, problem: 'Mock up an empty state', progress: null, solution: null, updatedAt: at(11), ...o });
const day = (items: unknown[], cards: unknown[] = []) => teamToday({
  range: 'today', now: NOW, me: 'p-lena', products, items, cards, decisions: [], needs: [],
  people: [{ id: 'p-priya', name: 'Priya Shah' }], mates: [], mateOf: () => null,
} as unknown as Parameters<typeof teamToday>[0]);
const finished = (d: ReturnType<typeof day>, key: string) => (d.people.find((p) => p.key === key)?.finished ?? []).map((l) => l.title);

describe('what the standup says is finished', () => {
  it('leaves out a thread closed with E before its agent answered, the reported one', () => {
    const stopped = item({ id: 'w-517b', label: 'Bookings list empty state mockups', result: null, answer: 'No need for a local server, could you take a screenshot?' });
    const d = day([stopped]);
    expect(finished(d, 'me')).toEqual([]);
    const posts = postsOf(d.people, { mates: true });
    expect(posts.flatMap((p) => p.done)).toEqual([]);
    expect(posts.map((p) => sentenceOf(p).join(''))).not.toContainEqual(expect.stringContaining('Finished'));
  });

  it('counts a thread closed after its agent answered', () => {
    const done = item({ id: 'w-a', label: 'Empty state mockups', result: 'Two options are in designs/bookings-empty.' });
    expect(finished(day([done]), 'me')).toEqual(['Empty state mockups']);
  });

  it('counts a thread with a written solution and no result', () => {
    expect(finished(day([item({ id: 'w-b', label: 'Fixed by hand', solution: 'Changed the copy myself.' })]), 'me')).toEqual(['Fixed by hand']);
  });

  it('counts a task someone gave you and you closed, which never has an answer', () => {
    const task = item({ id: 't-1', label: 'Review the copy', labels: ['given-task'], createdBy: 'p-priya', assignee: 'p-lena', result: null });
    const d = day([task]);
    expect(d.people.find((p) => p.key === 'me')?.tasks ?? []).toEqual([]);
    expect(finished(d, 'me').concat(finished(d, 'person:p-priya'))).toEqual([]);
  });

  it('leaves out a teammate\'s card closed with nothing to show, named or private', () => {
    const d = day([], [card({ threadId: 'c1', title: 'Duplicate mockup' }), card({ threadId: 'c2', title: null, visible: false })]);
    expect(finished(d, 'person:p-priya')).toEqual([]);
    expect(d.people.find((p) => p.key === 'person:p-priya')?.privateDone ?? 0).toBe(0);
  });

  it('counts a teammate\'s card closed with a solution or progress', () => {
    const d = day([], [
      card({ threadId: 'c3', title: 'Empty state mockups', solution: 'Two options drawn.' }),
      card({ threadId: 'c4', title: 'Payment copy', progress: 'Wrote three lines.' }),
    ]);
    expect(finished(d, 'person:p-priya').sort()).toEqual(['Empty state mockups', 'Payment copy']);
  });
});
