// A COMMENT ON A FINISHED THREAD IS NOT NEWS THAT IT FINISHED (2026-11-21).
//
// Bob finished "Invoice email" on Monday. On Wednesday Alice commented "nice"
// on it, and Wednesday's standup and Today page said "Bob: Finished Invoice
// email": a teammate's card was dated by its last change, and a comment
// changes the row. Found by a code review of the team features; measured by
// folding the thread's real ledger into its card and the day's posts. A
// finished card is now dated when it finished.
import { it, expect } from 'vitest';
import { foldWorkItems } from '../shared/work-items.mts';
import { cardsFor } from '../shared/thread-cards.mts';
import { teamToday } from '../renderer/src/team/today.ts';
import { postsOf, standupWindow, DEFAULT_STANDUP } from '../renderer/src/team/standup.ts';

const on = (d: number, h: number) => new Date(2026, 10, d, h).getTime();
const product = { slug: 'lumen', name: 'Lumen', team: {} };
const finished = [
  { id: 't1', ts: on(9, 10), source: 'founder', by: 'bob', patch: { title: 'Invoice email', body: 'Write it', visibility: 'team' } },
  { id: 't1', ts: on(9, 12), source: 'agent', by: 'bob', patch: { result: 'Done.', solution: 'Wrote the invoice email', progress: 'wrote it' } },
  { id: 't1', ts: on(9, 13), source: 'founder', by: 'bob', patch: { status: 'done' } },
];
const comment = { id: 't1', ts: on(11, 14), source: 'system', by: 'alice', uid: 'comment-c1', patch: { comment: { text: 'nice' } } };

function bobsFinished(lines, now) {
  const items = [...foldWorkItems(lines, now).values()].map((i) => ({ ...i, product: 'lumen' }));
  const card = cardsFor({ products: [product], readItems: () => items as never, now, me: 'bob' }).find((c) => c.threadId === 't1');
  const day = teamToday({
    range: 'today', window: standupWindow(new Date(now).setHours(0, 0, 0, 0), DEFAULT_STANDUP, now), now, me: 'alice', items: [], products: [product as never],
    cards: [{ ...card!, personId: 'bob' } as never], decisions: [], needs: [], people: [{ id: 'bob', name: 'Bob B' }], mates: [], mateOf: () => null,
  });
  return { card, titles: postsOf(day.people, { mates: true }).find((p) => p.key === 'person:bob')?.finished.map((l) => l.title) ?? [] };
}

it('a thread finished Monday is not in Wednesday\'s standup because someone commented on it', () => {
  const { card, titles } = bobsFinished([...finished, comment], on(11, 15));
  expect(card?.state).toBe('done');
  expect(card?.updatedAt).toBe(on(9, 13));
  expect(titles).toEqual([]);
});

it('a thread finished today is still in today\'s standup', () => {
  const today = finished.map((l) => ({ ...l, ts: l.ts + 2 * 86_400_000 }));
  expect(bobsFinished(today, on(11, 15)).titles).toEqual(['Invoice email']);
});
