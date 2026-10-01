// THE INBOX AND THE TEAM PAGE ARE ONE PAGE, AND THE FACES PICK WHOSE THREADS IT SHOWS.
//
// Reported on the team build (w-05ff3d1438, 2026-10-01): two pages answered one
// question. The Inbox had the state tabs (Needs you, In progress, Scheduled)
// and the Team page did not; the Team page had the person and the Inbox did
// not, and seeing your team meant finding a picker. Her rule: the inbox is the
// team page filtered to you. So there is one page with the Inbox's tabs, and a
// small row of faces at the end of the tab bar picks whose threads are on it.
// You are picked by default. Past four faces the rest fold into "+N".
//
// And the second half of the report: her own threads were missing from the
// Team page because they were private. Measured on her store the same day:
// 1,211 open threads, every one from before she joined and none shared, so the
// board showed none of them. Your own threads are now always on your page, and
// when a teammate is in view the ones they cannot see carry a lock.
import { describe, it, expect } from 'vitest';
import {
  facesShown, normalizePicked, togglePicked, needsWord, teammateRows, mergeRows, privateMark,
  readPicked, writePicked,
} from '../renderer/src/threads/people-rules.ts';
import { teamEntries } from '../renderer/src/threads/page-rules.ts';

const NOW = Date.UTC(2026, 9, 1, 18);
const DAY = 86_400_000;
const ME = 'p-me';
const person = (id, name) => ({ id, name, email: `${id}@x.test` });
const me = person(ME, 'Sam Rivera');
const maya = person('p-maya', 'Maya Chen');
const theo = person('p-theo', 'Theo Park');
const ana = person('p-ana', 'Ana Ruiz');
const bo = person('p-bo', 'Bo Li');
const cy = person('p-cy', 'Cy Adams');
const ids = (list) => list.map((p) => p.id);
const display = { view: 'list', sort: 'updated', priorities: [], projects: [], updated: 'any' };
const northwind = { slug: 'northwind', name: 'Northwind', team: { projectId: 't-1', visibility: 'team', people: [] } };
const card = (o = {}) => ({
  personId: maya.id, threadId: 'w-m1', visible: true, title: 'Acme renewal', project: 'Northwind', state: 'waiting',
  priority: 5, problem: null, progress: null, solution: null, blockedBy: [], blocks: [], updatedAt: NOW - 60_000, ...o,
});
const item = (o = {}) => ({
  id: 'w-1', product: 'northwind', productName: 'Northwind', status: 'open', title: 'Mine', kind: 'directive',
  labels: ['founder'], priority: 5, epoch: 0, claim: null, createdAt: NOW - 30 * DAY, updatedAt: NOW - 3_600_000, createdBy: ME, ...o,
});

describe('normalizePicked: whose threads are on the page', () => {
  it('is you by default', () => expect(normalizePicked(null, ME, ids([me, maya]))).toEqual([ME]));
  it('keeps the people you picked, in the order picked', () => expect(normalizePicked(['p-maya', ME], ME, ids([me, maya]))).toEqual(['p-maya', ME]));
  it('drops someone who has left the team', () => expect(normalizePicked(['p-gone', 'p-maya'], ME, ids([me, maya]))).toEqual(['p-maya']));
  it('falls back to you when nobody picked is left', () => expect(normalizePicked(['p-gone'], ME, ids([me, maya]))).toEqual([ME]));
});

describe('togglePicked: a face is a switch', () => {
  it('adds a teammate', () => expect(togglePicked([ME], 'p-maya', ME)).toEqual([ME, 'p-maya']));
  it('takes them away again', () => expect(togglePicked([ME, 'p-maya'], 'p-maya', ME)).toEqual([ME]));
  it('can take you away, leaving only them', () => expect(togglePicked([ME, 'p-maya'], ME, ME)).toEqual(['p-maya']));
  it('never leaves the page showing nobody', () => {
    expect(togglePicked([ME], ME, ME)).toEqual([ME]);
    expect(togglePicked(['p-maya'], 'p-maya', ME)).toEqual(['p-maya']);
  });
});

describe('facesShown: four faces, then +N', () => {
  it('shows nothing at all when you are alone on the team', () => expect(facesShown([me], [ME], ME)).toEqual({ faces: [], more: 0 }));
  it('shows everyone up to four, you first', () => {
    const out = facesShown([theo, maya, me, ana], [ME], ME);
    expect(ids(out.faces)).toEqual([ME, 'p-ana', 'p-maya', 'p-theo']);
    expect(out.more).toBe(0);
  });
  it('at five, three faces and +2, so the row never grows past four marks', () => {
    const out = facesShown([theo, maya, me, ana, bo], [ME], ME);
    expect(out.faces).toHaveLength(3);
    expect(out.more).toBe(2);
  });
  it('a picked teammate keeps their face out of the fold', () => {
    const out = facesShown([theo, maya, me, ana, bo, cy], [ME, 'p-theo'], ME);
    expect(ids(out.faces)).toEqual([ME, 'p-theo', 'p-ana']);
    expect(out.more).toBe(3);
  });
});

describe('needsWord: the first tab says whose attention it is', () => {
  it('Needs you when the page is yours alone', () => expect(needsWord([ME], ME)).toBe('Needs you'));
  it('Waiting once a teammate is on the page', () => {
    expect(needsWord([ME, 'p-maya'], ME)).toBe('Waiting');
    expect(needsWord(['p-maya'], ME)).toBe('Waiting');
  });
});

describe('teammateRows: their threads, under the tab they belong to', () => {
  const cards = [
    card({ threadId: 'a', state: 'waiting' }),
    card({ threadId: 'b', state: 'running' }),
    card({ threadId: 'c', state: 'scheduled' }),
    card({ threadId: 'd', state: 'done' }),
    card({ threadId: 'e', personId: theo.id, state: 'waiting' }),
    card({ threadId: 'f', visible: false, title: null, project: null }),
    card({ threadId: 'g', personId: ME, state: 'waiting' }),
  ];
  const rows = (tab, picked, d = display) => teammateRows(cards, { tab, picked, me: ME, display: d, products: [northwind], now: NOW }).map((c) => c.threadId);
  it('none while only you are picked', () => expect(rows('inbox', [ME])).toEqual([]));
  it('Needs you lists what waits on a picked teammate', () => expect(rows('inbox', [ME, 'p-maya'])).toEqual(['a']));
  it('each tab takes its own state', () => {
    expect(rows('progress', ['p-maya'])).toEqual(['b']);
    expect(rows('snoozed', ['p-maya'])).toEqual(['c']);
    expect(rows('done', ['p-maya'])).toEqual(['d']);
    expect(rows('all', ['p-maya'])).toEqual(['a', 'b', 'c']);
  });
  it('only the people picked, never a hidden card, never your own card twice', () => {
    expect(rows('inbox', [ME, 'p-maya', 'p-theo']).sort()).toEqual(['a', 'e']);
  });
  it('the Display filters apply to them too', () => {
    expect(rows('inbox', ['p-maya'], { ...display, priorities: ['urgent'] })).toEqual([]);
    expect(rows('inbox', ['p-maya'], { ...display, projects: ['elsewhere'] })).toEqual([]);
    expect(rows('inbox', ['p-maya'], { ...display, projects: ['northwind'] })).toEqual(['a']);
  });
});

describe('mergeRows: one table, not two lists stacked', () => {
  const a = item({ id: 'mine-old', updatedAt: NOW - 3 * 3_600_000, priority: 9 });
  const b = item({ id: 'mine-new', updatedAt: NOW - 60_000, priority: 1 });
  const c = card({ threadId: 'theirs', updatedAt: NOW - 3_600_000, priority: 5 });
  const keys = (rows) => rows.map((r) => (r.item ? r.item.id : r.card.threadId));
  it('by Updated, newest first across everyone', () => expect(keys(mergeRows([b, a], [c], 'updated'))).toEqual(['mine-new', 'theirs', 'mine-old']));
  it('by Priority, yours keep the app’s order and theirs fall in by priority', () => expect(keys(mergeRows([a, b], [c], 'priority'))).toEqual(['mine-old', 'theirs', 'mine-new']));
  it('keeps yours in their own order whatever the sort', () => {
    const out = keys(mergeRows([a, b], [], 'updated'));
    expect(out).toEqual(['mine-old', 'mine-new']);
  });
});

describe('privateMark: a lock where it tells you something', () => {
  const team = { me: ME, since: NOW - DAY };
  it('a thread only you can see wears a lock once a teammate is on the page', () => expect(privateMark(item(), northwind, team, true)).toBe(true));
  it('and no lock while the page is yours alone, where every row is yours anyway', () => expect(privateMark(item(), northwind, team, false)).toBe(false));
  it('no lock on a thread the team can see', () => expect(privateMark(item({ createdAt: NOW }), northwind, team, true)).toBe(false));
  it('no lock when nobody is signed in', () => expect(privateMark(item(), northwind, null, true)).toBe(false));
});

describe('the board keeps your private threads when you ask it to', () => {
  const since = NOW - DAY;
  const old = item({ id: 'old', createdAt: NOW - 30 * DAY });
  it('the old Team board left out a thread from before you joined', () => {
    expect(teamEntries({ items: [old], products: [northwind], cards: [], me: ME, now: NOW, since }).map((e) => e.key)).toEqual([]);
  });
  it('your page keeps every thread of yours, private or not', () => {
    expect(teamEntries({ items: [old], products: [northwind], cards: [], me: ME, now: NOW, since, allMine: true }).map((e) => e.item.id)).toEqual(['old']);
  });
  it('but still never a teammate’s synced row under your name', () => {
    const theirs = item({ id: 'theirs', createdBy: 'p-maya' });
    expect(teamEntries({ items: [theirs], products: [northwind], cards: [], me: ME, now: NOW, since, allMine: true })).toEqual([]);
  });
});

describe('the picks are remembered', () => {
  it('reads back what was written, and you alone from nothing or from junk', () => {
    const box = new Map();
    const store = { getItem: (k) => box.get(k) ?? null, setItem: (k, v) => box.set(k, v) };
    expect(readPicked(store)).toBeNull();
    writePicked([ME, 'p-maya'], store);
    expect(readPicked(store)).toEqual([ME, 'p-maya']);
    box.set('threads.people', '{not json');
    expect(readPicked(store)).toBeNull();
  });
});
