// A THREAD HANDED OVER STAYS UNDER ITS NEW OWNER ONCE THEY WRITE BACK (2026-11-23).
//
// Rerun A, issue 16: Priya handed "Checkout style note" to Theo, and her
// standup listed it under Theo's Working on. Once Theo wrote back on it, it was
// in neither post, while the thread still said Theo has it. Measured on Priya's
// ledger (w-1454d4970a): the task is a row in a record holding only tasks, so
// Needs you held it and the standup said it once, as what waits; it gave it to
// the person the conversation is with, and a record with no chat in it names
// nobody, so the line went to Priya's own post, which leaves Needs you to the
// inbox.
import { describe, it, expect } from 'vitest';
import { teamToday } from '../renderer/src/team/today.ts';
import { DEFAULT_STANDUP, postsOf, standupWindow, titleOf } from '../renderer/src/team/standup.ts';

const NOW = new Date(2026, 10, 23, 19, 30).getTime();
const on = (h: number, m = 0) => new Date(2026, 10, 23, h, m).getTime();
const THEO = 'p-theo';
const PRIYA = 'p-priya';
const handOver = {
  id: 'w-1454d4970a', product: 'direct-1', status: 'open', labels: ['given-task'], kind: 'directive', title: 'Checkout style note',
  createdBy: PRIYA, assignee: THEO, body: `[Checkout style note](https://app.agentbox.ac/t/${PRIYA}/w-e3e3fe4d7a)\n\nTheo, please use checkout-style.md.`,
  updatedAt: on(19, 22), createdAt: on(19, 15),
};
const dayFor = (needs: unknown[], directWith: (p: string) => string | null = () => null) => teamToday({
  range: 'today', now: NOW, me: PRIYA, window: standupWindow(on(0), DEFAULT_STANDUP, NOW),
  products: [{ slug: 'direct-1', name: 'Direct', team: { direct: true } }] as never,
  decisions: [], mentions: [], people: [{ id: THEO, name: 'Theo Okafor' }], mates: [], mateOf: () => null, cards: [],
  items: [handOver] as never, needs: needs as never, directWith,
});
const theo = (day: ReturnType<typeof teamToday>) => postsOf(day.people, { mates: true, live: true }).find((p) => p.key === `person:${THEO}`);

describe('a thread you handed over, once its new owner writes back', () => {
  it('is in their post as needing you, though the record holds no chat', () => {
    expect(theo(dayFor([handOver]))!.needs.map((n) => [titleOf(n.line), n.on])).toEqual([['Checkout style note', 'you']]);
  });

  it('is said the same way when the record has a chat with them', () => {
    expect(theo(dayFor([handOver], () => THEO))!.needs.map((n) => [titleOf(n.line), n.on])).toEqual([['Checkout style note', 'you']]);
  });

  it('is in their Working on while nothing waits on you', () => {
    const post = theo(dayFor([]))!;
    expect(post.working.map(titleOf)).toEqual(['Checkout style note']);
    expect(post.needs).toEqual([]);
  });
});
