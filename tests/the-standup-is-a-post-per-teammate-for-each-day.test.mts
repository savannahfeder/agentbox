// THE STANDUP IS A POST PER TEAMMATE FOR EACH DAY (2026-11-13).
//
// The Team page's "Everyone" showed one range of thread titles per person under
// four labels, and the founder found it did not replace a standup: there was
// no message from each person, no way to look back day by day, nothing to set
// when it happens, and AI teammates' work read as a separate person even when
// you wanted it counted as yours. Measured by building days from the store's
// shapes and reading the posts, windows and settings the Standup page draws.
import { describe, it, expect } from 'vitest';
import { teamToday } from '../renderer/src/team/today.ts';
import {
  DEFAULT_STANDUP, STANDUP_KEY, keepStandup, readStandup, standupAt, standupWindow, standupWeek, previousStandupDay,
  postsOf, postMatches, sentenceOf, type Part,
} from '../renderer/src/team/standup.ts';

// Thursday 12 November 2026, 3pm.
const NOW = new Date(2026, 10, 12, 15, 0).getTime();
const on = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
const item = (o: Record<string, unknown>) => ({ product: 'lumen', status: 'open', labels: [], updatedAt: on(12, 10), createdAt: on(12, 8), title: String(o.id), ...o });
const base = {
  range: 'today' as const, now: NOW, me: 'p-me', products: [{ slug: 'lumen', name: 'Lumen', team: {} }],
  decisions: [], mentions: [], people: [{ id: 'p-dev', name: 'Dev Patel' }], mates: [{ id: 't-fix', name: 'Maintainer' }],
  mateOf: (r: { labels?: string[] }) => r.labels?.find((l) => l.startsWith('teammate:'))?.slice(9) ?? null, needs: [], cards: [],
};
const words = (parts: Part[]) => parts.map((p) => (typeof p === 'string' ? p : 'more' in p ? `${p.more} more` : `[${p.title}]`)).join('');
const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m }; };

describe('when a standup happens and what it covers', () => {
  it('opens on weekdays at 9am with AI teammates posting', () => {
    expect(DEFAULT_STANDUP).toEqual({ days: [1, 2, 3, 4, 5], at: '09:00', mates: true });
  });
  it('a day\'s standup is at its set time', () => {
    expect(standupAt(on(12, 15), DEFAULT_STANDUP)).toBe(on(12, 9));
    expect(standupAt(on(12, 15), { ...DEFAULT_STANDUP, at: '10:30' })).toBe(on(12, 10, 30));
  });
  it('today covers the work since yesterday\'s standup, up to now', () => {
    expect(standupWindow(on(12, 0), DEFAULT_STANDUP, NOW)).toEqual({ from: on(11, 9), to: NOW });
  });
  it('a past day covers from the standup before it to its own', () => {
    expect(standupWindow(on(11, 0), DEFAULT_STANDUP, NOW)).toEqual({ from: on(10, 9), to: on(11, 9) });
  });
  it('Monday skips the weekend when weekends are off, and does not when they are on', () => {
    expect(previousStandupDay(on(9, 0), DEFAULT_STANDUP)).toBe(on(6, 0));
    expect(standupWindow(on(9, 0), DEFAULT_STANDUP, NOW).from).toBe(on(6, 9));
    expect(previousStandupDay(on(9, 0), { ...DEFAULT_STANDUP, days: [0, 1, 2, 3, 4, 5, 6] })).toBe(on(8, 0));
  });
  it('the week strip lists only standup days, Monday first, and a day still to come cannot be picked', () => {
    const week = standupWeek(on(12, 0), DEFAULT_STANDUP, NOW);
    expect(week.map((d) => d.label)).toEqual(['Mon 9', 'Tue 10', 'Wed 11', 'Thu 12', 'Fri 13']);
    expect(week.map((d) => d.ahead)).toEqual([false, false, false, false, true]);
  });
  it('a week with weekends on shows seven days', () => {
    expect(standupWeek(on(12, 0), { ...DEFAULT_STANDUP, days: [0, 1, 2, 3, 4, 5, 6] }, NOW)).toHaveLength(7);
  });
});

describe('what you set is kept', () => {
  it('reads the defaults when nothing is kept or what is kept is broken', () => {
    expect(readStandup(memory())).toEqual(DEFAULT_STANDUP);
    const s = memory(); s.setItem(STANDUP_KEY, '{nope');
    expect(readStandup(s)).toEqual(DEFAULT_STANDUP);
  });
  it('keeps the days, the time and whether AI teammates post', () => {
    const s = memory();
    keepStandup(s, { days: [1, 3, 5], at: '08:15', mates: false });
    expect(readStandup(s)).toEqual({ days: [1, 3, 5], at: '08:15', mates: false });
  });
  it('never keeps a standup with no days or a time that is not a time', () => {
    const s = memory();
    s.setItem(STANDUP_KEY, JSON.stringify({ days: [], at: '25:99', mates: true }));
    expect(readStandup(s)).toEqual(DEFAULT_STANDUP);
  });
});

describe('each teammate posts once a day, in a sentence with links', () => {
  const day = teamToday({
    ...base, window: standupWindow(on(12, 0), DEFAULT_STANDUP, NOW),
    items: [
      item({ id: 'a', title: 'Invoice email', status: 'done', shippedAt: on(12, 11), updatedAt: on(12, 11) }),
      item({ id: 'b', title: 'Stripe keys', status: 'done', shippedAt: on(12, 12), updatedAt: on(12, 12) }),
      item({ id: 'c', title: 'Refund copy', status: 'done', updatedAt: on(12, 13) }),
      item({ id: 'old', title: 'Last week', status: 'done', updatedAt: on(11, 8) }),
      item({ id: 'd', title: 'Billing page', updatedAt: on(12, 14) }),
      item({ id: 'm', title: 'Monday test', labels: ['teammate:t-fix'], status: 'done', updatedAt: on(12, 10) }),
    ],
  });
  const posts = postsOf(day.people, { mates: true });
  const me = posts.find((p) => p.key === 'me')!;

  it('only what moved since the last standup is in it', () => {
    expect(me.done.map((l) => l.title)).toEqual(['Refund copy', 'Stripe keys', 'Invoice email']);
  });
  it('the sentence names what shipped, then what finished, then what it is on, each a link', () => {
    expect(words(sentenceOf(me))).toBe('Shipped [Stripe keys] and [Invoice email]. Finished [Refund copy]. Working on [Billing page].');
  });
  it('an AI teammate posts its own when AI teammates post', () => {
    expect(posts.map((p) => p.key)).toEqual(['me', 'mate:t-fix']);
    expect(words(sentenceOf(posts[1]))).toBe('Finished [Monday test].');
  });
  it('with AI teammates off, their work is counted as yours', () => {
    const mine = postsOf(day.people, { mates: false });
    expect(mine.map((p) => p.key)).toEqual(['me']);
    expect(mine[0].done.map((l) => l.title)).toContain('Monday test');
  });
  it('search finds a post by a task in it or by who wrote it', () => {
    expect(postMatches(me, 'refund')).toBe(true);
    expect(postMatches(posts[1], 'maint')).toBe(true);
    expect(postMatches(me, 'nothing like this')).toBe(false);
    expect(postMatches(me, '  ')).toBe(true);
  });
});

// A tester's teammate was busy in projects she had not shared: her standup had
// no post at all, so she read as idle. Private work is counted, never named.
describe('a teammate working in private projects', () => {
  const card = (o: Record<string, unknown>) => ({ personId: 'p-dev', visible: false, title: null, state: 'running', project: null, blockedBy: [], blocks: [], people: null, priority: null, progress: null, updatedAt: on(12, 13), ...o });
  const day = (cards: unknown[]) => teamToday({ ...base, window: standupWindow(on(12, 0), DEFAULT_STANDUP, NOW), items: [], cards: cards as never });
  it('posts how many private threads they are on, without naming any', () => {
    const posts = postsOf(day([card({ threadId: 'x1' }), card({ threadId: 'x2' })]).people, { mates: true });
    const dev = posts.find((p) => p.key === 'person:p-dev')!;
    expect(words(sentenceOf(dev))).toBe('Working on 2 private threads.');
  });
  it('one private thread is said in the singular, beside named work', () => {
    const posts = postsOf(day([card({ threadId: 'x1' }), card({ threadId: 'n1', visible: true, title: 'Seat picker' })]).people, { mates: true });
    expect(words(sentenceOf(posts.find((p) => p.key === 'person:p-dev')!))).toBe('Working on [Seat picker] and 1 private thread.');
  });
  it('a private thread that last moved before the standup window is not counted', () => {
    expect(postsOf(day([card({ threadId: 'x1', updatedAt: on(10, 13) })]).people, { mates: true }).map((p) => p.key)).not.toContain('person:p-dev');
  });
});

// Two testers found today's "Waiting on Codex usage" under Wednesday and
// Thursday too: what is stuck is only known as of now. And a teammate's post
// vanished once her agent answered and the thread waited on her.
describe('what a post says on a past day and while a thread waits on its owner', () => {
  const card = (o: Record<string, unknown>) => ({ personId: 'p-dev', visible: true, state: 'running', project: 'Lumen', blockedBy: [], blocks: [], people: null, priority: null, progress: null, updatedAt: on(12, 13), ...o });
  const dayOf = (window: { from: number; to: number }, items: unknown[], cards: unknown[] = []) => teamToday({ ...base, window, items: items as never, cards: cards as never });
  const stuck = item({ id: 's', title: 'Investor update', status: 'blocked', blockedBy: ['name:Codex usage'], updatedAt: on(12, 14) });
  it('today\'s post says what is stuck', () => {
    const me = postsOf(dayOf(standupWindow(on(12, 0), DEFAULT_STANDUP, NOW), [stuck]).people, { mates: true, live: true }).find((p) => p.key === 'me');
    expect(me?.needs.map((n) => n.line.title)).toEqual(['Investor update']);
  });
  it('a past day\'s post does not carry today\'s blockers', () => {
    const posts = postsOf(dayOf(standupWindow(on(11, 0), DEFAULT_STANDUP, NOW), [stuck]).people, { mates: true, live: false });
    expect(posts.flatMap((p) => p.needs)).toEqual([]);
  });
  it('a thread waiting on its owner after the agent answered is still work they are on', () => {
    const posts = postsOf(dayOf(standupWindow(on(12, 0), DEFAULT_STANDUP, NOW), [], [card({ threadId: 'w1', title: 'Teams pricing', state: 'waiting' })]).people, { mates: true, live: true });
    expect(words(sentenceOf(posts.find((p) => p.key === 'person:p-dev')!))).toBe('Working on [Teams pricing].');
  });
});

// A tester's AI teammate finished a fix and handed it over for review; its
// standup post left it out, because what waits on you lives in Needs you.
describe('what a teammate handed you is in their post', () => {
  const review = item({ id: 'r', title: 'Booking fix', labels: ['teammate:t-fix'], updatedAt: on(12, 14) });
  const dayOf = () => teamToday({ ...base, window: standupWindow(on(12, 0), DEFAULT_STANDUP, NOW), items: [review], needs: [review] as never });
  it('an AI teammate\'s post says it needs you on what it handed over', () => {
    const mate = postsOf(dayOf().people, { mates: true, live: true }).find((p) => p.key === 'mate:t-fix');
    expect(mate?.needs.map((n) => [n.line.title, n.on])).toEqual([['Booking fix', 'you']]);
  });
  it('a past day does not say it', () => {
    expect(postsOf(dayOf().people, { mates: true, live: false }).flatMap((p) => p.needs)).toEqual([]);
  });
  // Round ten: "Priya's standup shows 'Needs you on Bookings list empty states' twice
  // consecutively with no visible distinction." Two rows wait on you under one name.
  it('says a name it needs you on once', () => {
    const twin = item({ id: 'r2', title: 'Booking fix', labels: ['teammate:t-fix'], updatedAt: on(12, 15) });
    const day = teamToday({ ...base, window: standupWindow(on(12, 0), DEFAULT_STANDUP, NOW), items: [review, twin], needs: [review, twin] as never });
    const mate = postsOf(day.people, { mates: true, live: true }).find((p) => p.key === 'mate:t-fix');
    expect(mate?.needs.map((n) => [n.line.title, n.on])).toEqual([['Booking fix', 'you']]);
  });
  it('your own post does not repeat your Needs you', () => {
    const mine = teamToday({ ...base, window: standupWindow(on(12, 0), DEFAULT_STANDUP, NOW), items: [item({ id: 'x', title: 'My ask', status: 'done', updatedAt: on(12, 11) })], needs: [item({ id: 'q', title: 'Agent asks me' })] as never });
    expect(postsOf(mine.people, { mates: true, live: true }).find((p) => p.key === 'me')?.needs ?? []).toEqual([]);
  });
});

// Two testers handed a blocked pricing thread to a teammate and the standup
// said they Finished it. Handing on closes the thread with "Given to …".
describe('a thread handed to someone else', () => {
  const given = item({ id: 'g', title: 'Teams pricing', status: 'done', answer: 'Given to Maya Chen.', updatedAt: on(12, 12), wrote: { status: { ts: on(12, 12) } } });
  const done = item({ id: 'd', title: 'Refund copy', status: 'done', answer: 'Done, and tested.', updatedAt: on(12, 12), wrote: { status: { ts: on(12, 12) } } });
  const me = () => teamToday({ ...base, window: standupWindow(on(12, 0), DEFAULT_STANDUP, NOW), items: [given, done] }).people.find((p) => p.key === 'me')!;
  it('is not something you finished', () => {
    expect(me().finished.map((l) => l.title)).toEqual(['Refund copy']);
  });
});

describe('a post when searching, and its "more"', () => {
  const line = (title: string) => ({ key: title, title, at: 1 });
  const post = { key: 'p', name: 'Dev Patel', kind: 'person' as const, done: [], shipped: [], finished: [], working: [line('A'), line('B'), line('CORS fix')], needs: [], privateDone: 0 };
  it('a long list says how many more, and that count can be opened', () => {
    const parts = sentenceOf(post);
    expect(words(parts)).toBe('Working on [A], [B] and 1 more.');
    expect(parts.find((p) => typeof p === 'object' && 'more' in p)).toEqual({ more: 1, of: 'working' });
  });
  it('a search names every task, so the one that matched is never hidden', () => {
    expect(words(sentenceOf(post, { all: true }))).toBe('Working on [A], [B] and [CORS fix].');
  });
});

describe('the sentence for every shape of day', () => {
  const line = (title: string) => ({ key: title, title, at: 1 });
  const post = (o: Partial<ReturnType<typeof postsOf>[number]>) => ({ key: 'p', name: 'Dev Patel', kind: 'person' as const, done: [], shipped: [], finished: [], working: [], needs: [], privateDone: 0, ...o });
  it('three shipped names two and counts the rest', () => {
    expect(words(sentenceOf(post({ shipped: [line('A'), line('B'), line('C')] })))).toBe('Shipped [A], [B] and 1 more.');
  });
  it('shipped and finished say both', () => {
    expect(words(sentenceOf(post({ shipped: [line('A')], finished: [line('B')] })))).toBe('Shipped [A]. Finished [B].');
  });
  it('only private work says how much without naming it', () => {
    expect(words(sentenceOf(post({ privateDone: 2 })))).toBe('Finished 2 private threads.');
  });
  it('nothing at all says so plainly', () => {
    expect(words(sentenceOf(post({})))).toBe('Nothing moved.');
  });
});

describe('teamToday reads any window, not only its three ranges', () => {
  it('a window keeps what is inside it and drops what is not', () => {
    const day = teamToday({
      ...base, window: { from: on(10, 9), to: on(11, 9) },
      items: [item({ id: 'in', title: 'Inside', status: 'done', updatedAt: on(10, 15) }), item({ id: 'out', title: 'Outside', status: 'done', updatedAt: on(11, 10) })],
    });
    expect(day.people.find((p) => p.key === 'me')!.finished.map((l) => l.title)).toEqual(['Inside']);
  });
});

// Round two of the team test: Priya's standup read "Finished Empty bookings list
// visual options and Empty bookings list visual options". One was her thread, the
// other a review she was asked for, under the same name. An ask handed back is
// help on someone else's thread, said as such, and never a second finished thing.
describe('an ask for help or a review, handed back', () => {
  const dm = { slug: 'dm', name: 'Dev', team: { direct: true, projectId: 'dm-1', people: ['p-me', 'p-dev'] } };
  const ask = (o: Record<string, unknown>) => item({ product: 'dm', labels: ['given-task'], status: 'done', title: 'Bookings empty state', updatedAt: on(12, 12), ask: { kind: 'review', owner: 'p-me', thread: 't1', product: 'lumen' }, ...o });
  const day = (items: Record<string, unknown>[]) => teamToday({ ...base, products: [...base.products, dm] as never, window: standupWindow(on(12, 0), DEFAULT_STANDUP, NOW), items: items as never });
  it('is help said by the person who handed it back, not finished by anyone', () => {
    const d = day([ask({ id: 'a1', createdBy: 'p-me', assignee: 'p-dev', verdict: 'yes', wrote: { status: { ts: on(12, 12), by: 'p-dev' }, verdict: { ts: on(12, 12), by: 'p-dev' } } })]);
    const dev = d.people.find((p) => p.key === 'person:p-dev')!;
    expect(dev.helped?.map((l) => l.title)).toEqual(['Bookings empty state']);
    expect(d.people.flatMap((p) => p.finished)).toEqual([]);
    expect(words(sentenceOf(postsOf(d.people, { mates: true }).find((p) => p.key === 'person:p-dev')!))).toBe('Helped on [Bookings empty state].');
  });
  it('is your own help in your post when you were the one asked', () => {
    const d = day([ask({ id: 'a2', createdBy: 'p-dev', assignee: 'p-me', verdict: 'done', ask: { kind: 'help', owner: 'p-dev', thread: 't9', product: 'lumen' }, wrote: { status: { ts: on(12, 12), by: 'p-me' }, verdict: { ts: on(12, 12), by: 'p-me' } } })]);
    expect(d.people.find((p) => p.key === 'me')!.helped?.map((l) => l.title)).toEqual(['Bookings empty state']);
  });
  it('stays help, not an open task, after a thank-you reopened the task', () => {
    const d = day([ask({ id: 'a4', status: 'open', createdBy: 'p-me', assignee: 'p-dev', verdict: 'yes', wrote: { status: { ts: on(12, 13), by: 'p-me' }, verdict: { ts: on(12, 12), by: 'p-dev' } } })]);
    expect(d.people.find((p) => p.key === 'person:p-dev')!.helped?.map((l) => l.title)).toEqual(['Bookings empty state']);
    expect(d.people.flatMap((p) => p.tasks)).toEqual([]);
  });
  // Round six: "Dana's update says she helped on Clinic bookings list empty
  // states and Clinic bookings list empty states". She helped, then reviewed,
  // the same thread: two asks, one thread to name.
  it('names a thread once when they helped and then reviewed it', () => {
    const d = day([
      ask({ id: 'a5', createdBy: 'p-me', assignee: 'p-dev', verdict: 'done', ask: { kind: 'help', owner: 'p-me', thread: 't1', product: 'lumen' }, wrote: { status: { ts: on(12, 11), by: 'p-dev' }, verdict: { ts: on(12, 11), by: 'p-dev' } } }),
      ask({ id: 'a6', createdBy: 'p-me', assignee: 'p-dev', verdict: 'yes', wrote: { status: { ts: on(12, 12), by: 'p-dev' }, verdict: { ts: on(12, 12), by: 'p-dev' } } }),
    ]);
    expect(d.people.find((p) => p.key === 'person:p-dev')!.helped?.map((l) => l.key)).toEqual(['dm/a6']);
  });
  it('is nobody\'s news when its owner took it back', () => {
    const d = day([ask({ id: 'a3', createdBy: 'p-me', assignee: 'p-dev', wrote: { status: { ts: on(12, 12), by: 'p-me' } } })]);
    expect(d.people.flatMap((p) => [...p.finished, ...(p.helped ?? [])])).toEqual([]);
  });
});
