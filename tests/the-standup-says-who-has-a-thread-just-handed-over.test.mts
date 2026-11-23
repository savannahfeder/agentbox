// The standup says who has a thread just handed over, and names a pasted thread link by its title.
//
// What broke: two testers handed threads to each other (Hand it over) and then
// read the standup. Handing over closes the giver's thread and gives the
// teammate a task that leads back to it; the standup draws no tasks, so the
// health thread was missing from Priya's post on Theo's screen, the checkout
// and bookings hand-overs from Theo's on Priya's, and Theo's own post left out
// the bookings hand-over he held. Measured on both copies' ledgers: each
// hand-over was an open given-task row, assignee the receiver, body opening
// with the thread's link. A third: a teammate's @mention that was a pasted
// thread link was said as "[Clinic checkout prototype](https://app.agentbox.ac/t/<id>/<id>)".
import { describe, it, expect } from 'vitest';
import { teamToday } from '../renderer/src/team/today.ts';
import { DEFAULT_STANDUP, postsOf, sentenceOf, standupWindow, titleOf, type Part } from '../renderer/src/team/standup.ts';

const NOW = new Date(2026, 10, 23, 16, 30).getTime();
const on = (h: number, m = 0) => new Date(2026, 10, 23, h, m).getTime();
const THEO = 'p-theo';
const PRIYA = 'p-priya';
const link = (owner: string, id: string) => `https://app.agentbox.ac/t/${owner}/${id}`;
const task = (o: Record<string, unknown>) => ({
  product: 'direct-1', status: 'open', labels: ['given-task'], kind: 'directive', updatedAt: on(16, 29), createdAt: on(16, 29), ...o,
});
const handOver = (id: string, title: string, from: string, to: string, thread: string) => task({
  id, title, createdBy: from, assignee: to, body: `[${title}](${link(from, thread)})\n\nPlease take this over.`,
});
const dayFor = (me: string, other: { id: string; name: string }, items: unknown[], extra: Record<string, unknown> = {}) => teamToday({
  range: 'today', now: NOW, me, window: standupWindow(on(0), DEFAULT_STANDUP, NOW),
  products: [{ slug: 'direct-1', name: 'Direct', team: { direct: true } }, { slug: 'payments-api', name: 'Payments API', team: {} }] as never,
  decisions: [], mentions: [], people: [other], mates: [], mateOf: () => null, needs: [], cards: [],
  items: items as never, ...extra,
});
const words = (parts: Part[]) => parts.map((p) => (typeof p === 'string' ? p : 'more' in p ? `${p.more} more` : `[${titleOf(p)}]`)).join('');
const post = (day: ReturnType<typeof teamToday>, key: string, live = true) => postsOf(day.people, { mates: true, live }).find((p) => p.key === key);

describe('a thread handed over', () => {
  it('is in the receiver\'s Working on, on the giver\'s screen', () => {
    const day = dayFor(THEO, { id: PRIYA, name: 'Priya Shah' }, [handOver('t1', 'Node Payments API liveness route', THEO, PRIYA, 'w-health')]);
    expect(words(sentenceOf(post(day, `person:${PRIYA}`)!))).toBe('Working on [Node Payments API liveness route].');
  });

  it('is in your own Working on when you hold it and it is out of Needs you', () => {
    const day = dayFor(THEO, { id: PRIYA, name: 'Priya Shah' }, [handOver('t2', 'Empty bookings list options', PRIYA, THEO, 'w-bookings')]);
    expect(words(sentenceOf(post(day, 'me')!))).toBe('Working on [Empty bookings list options].');
  });

  it('is said once when the receiver\'s own thread for it is on their card', () => {
    const card = { personId: PRIYA, threadId: 'w-cont', visible: true, title: 'Node Payments API liveness route', state: 'running', project: 'Payments API', blockedBy: [], blocks: [], people: null, priority: null, progress: null, updatedAt: on(16, 33) };
    const day = dayFor(THEO, { id: PRIYA, name: 'Priya Shah' }, [handOver('t1', 'Node Payments API liveness route', THEO, PRIYA, 'w-health')], { cards: [card] });
    expect(post(day, `person:${PRIYA}`)!.working.map(titleOf)).toEqual(['Node Payments API liveness route']);
  });

  it('is not in a past day\'s post, which says only what moved then', () => {
    const day = dayFor(THEO, { id: PRIYA, name: 'Priya Shah' }, [handOver('t1', 'Node Payments API liveness route', THEO, PRIYA, 'w-health')]);
    expect(post(day, `person:${PRIYA}`, false)?.working ?? []).toEqual([]);
  });
});

describe('a task that is not a hand-over', () => {
  it('stays out of Working on', () => {
    const plain = task({ id: 't3', title: 'Confirm the checkout retry label', createdBy: THEO, assignee: PRIYA, body: 'Can you confirm the label reads Try payment again?' });
    const day = dayFor(THEO, { id: PRIYA, name: 'Priya Shah' }, [plain]);
    expect(post(day, `person:${PRIYA}`)?.working ?? []).toEqual([]);
  });

  it('whose link names someone else\'s thread stays out too', () => {
    const notTheirs = task({ id: 't4', title: 'Look at this', createdBy: THEO, assignee: PRIYA, body: `[Somebody's thread](${link('p-else', 'w-x')})` });
    const day = dayFor(THEO, { id: PRIYA, name: 'Priya Shah' }, [notTheirs]);
    expect(post(day, `person:${PRIYA}`)?.working ?? []).toEqual([]);
  });
});

describe('a mention that is a pasted thread link', () => {
  const mention = (body: string) => ({ id: 'm1', messageId: 'm1', roomId: 'r1', roomName: 'Clinic app', by: THEO, byName: 'Theo Okafor', body, at: on(16, 20) });
  const needsOf = (body: string) => post(dayFor(PRIYA, { id: THEO, name: 'Theo Okafor' }, [], { mentions: [mention(body)] }), `person:${THEO}`)!.needs.map((n) => titleOf(n.line));

  it('is named by the link\'s words, with no address or ids', () => {
    expect(needsOf(`[Clinic checkout prototype](${link(THEO, 'w-a4afccbbe7')})`)).toEqual(['Clinic checkout prototype']);
  });

  it('keeps the words around the link', () => {
    expect(needsOf(`@Priya can you open [Clinic checkout prototype](${link(THEO, 'w-a4afccbbe7')}) today?`)).toEqual(['@Priya can you open Clinic checkout prototype today?']);
  });

  it('leaves words in square brackets that are not a link as they are', () => {
    expect(needsOf('Is the [Pay] button the right size?')).toEqual(['Is the [Pay] button the right size?']);
  });
});
