// SEARCH PUTS WHAT YOU OPENED LATELY FIRST.
//
// Reported 2026-11-22, with a picture of Command K: "hero" listed two threads
// from Nov 16-17 and two from September, because the word sat in their titles
// or bodies. Read in renderer/src/search.ts: threads were ordered by how well
// the words matched, then by when the thread last changed, and when you opened
// one was never asked. A thread whose word was only in an older message of its
// conversation was not under Threads at all, only under Lines
// (main/everything-found.mts), which were ordered by date alone.
import { describe, it, expect } from 'vitest';
import { searchItems } from '../renderer/src/search.ts';
import { searchThreads } from '../renderer/src/threads/search.ts';
import fs from 'node:fs';
import { keptPick, titleFirst } from '../renderer/src/palette-pick.ts';
import { insideGroups } from '../renderer/src/found-inside.ts';
import { cursorIndex, firstRowStaysFirst } from '../renderer/src/cursor-follows.ts';
import { createFinder } from '../main/everything-found.mts';
import { openedBand, openedLately, openedOf, LATELY_FIRST_MS, LATELY_MS } from '../shared/opened-lately.mts';

const NOW = 1_795_000_000_000;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const thread = (id, title, body = '', extra = {}) => ({ id, product: 'team', title, body, status: 'open', createdAt: NOW - 30 * DAY, updatedAt: NOW - 5 * DAY, ...extra });
const oldTitle = thread('w-old', 'Pick a hero for agentbox.ac', 'Should the fanned hero go live?', { updatedAt: NOW - 5 * DAY });
const oldBody = thread('w-sep', 'Landing page updates', 'Retained the approved hero copy.', { updatedAt: NOW - 50 * DAY });
const lastHour = thread('w-hour', 'Landing page UI fixes', 'Move the screenshots closest to the hero.', { updatedAt: NOW - 22 * HOUR });
const thisMorning = thread('w-day', 'Launch film cut', 'The hero shot runs long.', { updatedAt: NOW - 30 * HOUR });
const noWord = thread('w-none', 'Pricing table', 'Nothing about it here.');
const items = [oldTitle, oldBody, lastHour, thisMorning, noWord];
const opened = { 'w-hour': NOW - 20 * MIN, 'w-day': NOW - 5 * HOUR, 'w-none': NOW - MIN, 'w-old': NOW - 6 * DAY };
const context = { products: [{ slug: 'team', name: 'Agentbox Team' }], people: [], me: null };
const ids = (hits) => hits.map((h) => h.item.id);

describe('how long ago counts as lately', () => {
  it('the last two hours lead, the last day next, older is not lately', () => {
    expect(openedBand(NOW - MIN, NOW)).toBe(2);
    expect(openedBand(NOW - LATELY_FIRST_MS, NOW)).toBe(2);
    expect(openedBand(NOW - LATELY_FIRST_MS - 1, NOW)).toBe(1);
    expect(openedBand(NOW - LATELY_MS, NOW)).toBe(1);
    expect(openedBand(NOW - LATELY_MS - 1, NOW)).toBe(0);
  });

  it('a thread never opened, or marked unread, is not lately', () => {
    expect(openedBand(undefined, NOW)).toBe(0);
    expect(openedBand(0, NOW)).toBe(0);
  });

  it('leaves out the thread on screen and anything older than a day', () => {
    expect(openedLately(opened, NOW, 'w-hour')).toEqual({ 'w-day': NOW - 5 * HOUR, 'w-none': NOW - MIN });
    expect(openedLately(opened, NOW)).toEqual({ 'w-hour': NOW - 20 * MIN, 'w-day': NOW - 5 * HOUR, 'w-none': NOW - MIN });
  });

  it('takes only ids to times from the window', () => {
    expect(openedOf({ a: 5, b: 'x', c: -1, d: Number.NaN })).toEqual({ a: 5 });
    expect(openedOf(null)).toEqual({});
  });
});

describe('the threads a search lists', () => {
  const lately = { opened: openedLately(opened, NOW), now: NOW };

  it('puts the thread opened in the last hour above a closer match from days ago', () => {
    expect(ids(searchThreads(items, 'hero', context, lately))).toEqual(['w-hour', 'w-day', 'w-old', 'w-sep']);
  });

  it('is the old order without what you opened', () => {
    expect(ids(searchThreads(items, 'hero', context))).toEqual(['w-old', 'w-hour', 'w-day', 'w-sep']);
  });

  it('never lists a thread opened a minute ago that does not have the words', () => {
    expect(ids(searchThreads(items, 'hero', context, lately))).not.toContain('w-none');
  });

  it('among threads opened alike, the closer match first, then the one opened last', () => {
    const titled = thread('w-t', 'Hero video', 'A cut for launch.');
    const mention = thread('w-m', 'Notes', 'The hero is fine.');
    const mention2 = thread('w-m2', 'More notes', 'Another hero line.');
    const seen = { opened: { 'w-t': NOW - 90 * MIN, 'w-m': NOW - 10 * MIN, 'w-m2': NOW - 5 * MIN }, now: NOW };
    expect(ids(searchItems([mention, mention2, titled], 'hero', seen))).toEqual(['w-t', 'w-m2', 'w-m']);
  });

  it('a ticket id still goes first: typing an id names one thread', () => {
    const named = thread('w-abc123', 'Old ticket', 'Nothing.');
    const cites = thread('w-cites', 'Recent', 'See w-abc123 for the history.');
    const seen = { opened: { 'w-cites': NOW - MIN }, now: NOW };
    expect(ids(searchItems([cites, named], 'w-abc123', seen))[0]).toBe('w-abc123');
  });

  it('a conversation with the person whose name you typed still goes first', () => {
    const people = [{ id: 'me', name: 'Alex' }, { id: 'maya', name: 'Maya Rowan' }];
    const products = [{ slug: 'pair', name: 'Direct', team: { direct: true, people: ['maya'], sharedBy: 'me' } }, { slug: 'team', name: 'Team' }];
    const chat = { id: 'chat', product: 'pair', title: 'Hello', body: 'Hi.', status: 'open', updatedAt: NOW - 9 * DAY, people: ['me', 'maya'] };
    const aboutMaya = thread('w-maya', 'Maya Rowan gave feedback', '');
    const seen = { opened: { 'w-maya': NOW - MIN }, now: NOW };
    expect(ids(searchThreads([aboutMaya, chat], 'Maya', { products, people, me: 'me' }, seen))).toEqual(['chat', 'w-maya']);
  });

  it('lists a thread you opened lately whose words are only inside its conversation, with the line they are in', () => {
    const inside = new Map([['w-quiet', '…five, closest to the hero. 3. Agentbox is one place…']]);
    const quiet = thread('w-quiet', 'Landing page UI fixes', 'Fix the spacing.');
    const hits = searchThreads([oldTitle, quiet], 'hero', context, { opened: { 'w-quiet': NOW - 10 * MIN }, now: NOW, inside });
    expect(ids(hits)).toEqual(['w-quiet', 'w-old']);
    expect(hits[0].summary).toBe('…five, closest to the hero. 3. Agentbox is one place…');
  });

  it('does not list a thread found inside that you have not opened lately', () => {
    const inside = new Map([['w-quiet', 'closest to the hero']]);
    const quiet = thread('w-quiet', 'Landing page UI fixes', 'Fix the spacing.');
    expect(ids(searchThreads([oldTitle, quiet], 'hero', context, { opened: { 'w-quiet': NOW - 2 * DAY }, now: NOW, inside }))).toEqual(['w-old']);
  });
});

describe('Command K keeps them first when it puts titles first', () => {
  const row = (id, label, lead) => ({ id, label, lead, run: () => {} });

  it('a title match does not jump a thread opened lately', () => {
    const rows = [row('thread-hour', 'Landing page UI fixes', 2), row('thread-old', 'Pick a hero for agentbox.ac', 0)];
    expect(titleFirst(rows, 'hero').map((r) => r.id)).toEqual(['thread-hour', 'thread-old']);
  });

  it('still puts the title first among rows opened alike', () => {
    const rows = [row('a', 'Notes on the launch', 2), row('b', 'Hero video', 2), row('c', 'Other', 0), row('d', 'Hero shot', 0)];
    expect(titleFirst(rows, 'hero').map((r) => r.id)).toEqual(['b', 'a', 'd', 'c']);
  });

  // In the running app, a thread main found a moment later landed on top while
  // the highlight stayed on the row that had been first, so Enter opened that.
  it('a pick nobody made is the top row, whatever lands there', () => {
    expect(keptPick(null, ['thread-found-inside', 'thread-was-first'])).toBe(0);
    expect(keptPick('thread-was-first', ['thread-found-inside', 'thread-was-first'])).toBe(1);
  });

  // The search page had the same fault: its cursor follows its thread, so it
  // followed the old first row down when the thread main found landed above.
  it('on the search page, a cursor on the first row stays on the first row when results land above it', () => {
    const list = [{ id: 'w-found', product: 'p' }, { id: 'w-was-first', product: 'p' }];
    const last = { index: 0, key: 'p:w-was-first' };
    expect(cursorIndex({ list, selected: 0, last: firstRowStaysFirst(last) })).toBe(0);
    expect(cursorIndex({ list, selected: 0, last })).toBe(1);
  });

  it('a cursor you moved down still follows its thread', () => {
    const list = [{ id: 'w-found', product: 'p' }, { id: 'a', product: 'p' }, { id: 'b', product: 'p' }];
    const last = { index: 1, key: 'p:b' };
    expect(cursorIndex({ list, selected: 1, last: firstRowStaysFirst(last) })).toBe(2);
  });

  it('the search page applies it where those results land', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/drawnAt\.current = firstRowStaysFirst\(drawnAt\.current\); setPageInside\(got\)/);
  });

  it('only a key or the pointer makes a pick', () => {
    const palette = fs.readFileSync(new URL('../renderer/src/components/Palette.tsx', import.meta.url), 'utf8');
    const sets = [...palette.matchAll(/setPickedKey\(([^;]*?)\)(?=[;,\s])/g)].map((m) => m[1]);
    expect(sets.sort()).toEqual(['keys[i] ?? null', 'null']);
  });
});

const say = (uid, ts, patch, by = 'me', source = 'founder') => ({ id: 'x', uid, ts, by, source, patch });
function finderOver(threads) {
  return createFinder({
    listThreads: () => threads.map((t) => ({ key: t.key, kind: 'thread', product: 'team', id: t.key, version: 1, updatedAt: 1 })),
    loadThread: async (t) => ({ lines: threads.find((x) => x.key === t.key).lines, resolve: null }),
    now: () => NOW,
  });
}

describe('the lines found inside threads', () => {
  const threads = [
    { key: 'w-hour', lines: [say('h1', NOW - 3 * DAY, { answer: 'Put them closest to the hero.' })] },
    { key: 'w-other', lines: [say('o1', NOW - HOUR, { answer: 'The hero shot is long.' })] },
    { key: 'w-skip', lines: [say('s1', NOW - 2 * HOUR, { answer: 'Nothing here.' })] },
  ];

  it('a line in a thread you opened lately comes before a newer line elsewhere', async () => {
    const got = await finderOver(threads).search('hero', { opened: { 'w-hour': NOW - 20 * MIN } });
    expect(got.lines.map((l) => l.uid)).toEqual(['h1', 'o1']);
  });

  it('newest first, as before, without what you opened', async () => {
    expect((await finderOver(threads).search('hero')).lines.map((l) => l.uid)).toEqual(['o1', 'h1']);
  });

  it('names the threads you opened lately that the words are inside, with the line', async () => {
    const got = await finderOver(threads).search('hero', { opened: { 'w-hour': NOW - 20 * MIN, 'w-skip': NOW - MIN, 'w-other': NOW - 3 * DAY } });
    expect(got.threads).toEqual([{ product: 'team', id: 'w-hour', text: 'Put them closest to the hero.' }]);
  });

  it('the screen draws them in the same order, group lines by time after', () => {
    const where = (id) => ({ kind: 'thread', product: 'team', id, ownerId: null, threadId: null, updatedAt: 1 });
    const found = {
      lines: [
        { ...where('w-hour'), uid: 'h1', by: 'me', source: 'founder', at: NOW - 3 * DAY, comment: false, text: 'closest to the hero' },
        { ...where('w-other'), uid: 'o1', by: 'me', source: 'founder', at: NOW - HOUR, comment: false, text: 'the hero shot' },
      ],
      files: [], comments: [], total: { lines: 2, files: 0, comments: 0 },
    };
    const groups = insideGroups({
      query: 'hero', found, items: [lastHour, thread('w-other', 'Launch film')], cards: [],
      rooms: new Map([['r1', 'Lumen']]), messages: { r1: [{ id: 'm1', roomId: 'r1', by: 'me', body: 'A hero idea', at: NOW - 30 * MIN }] }, decisions: {},
      me: 'me', nameOf: () => 'Someone', titleOf: (i) => i.title, limit: { lines: 5, files: 5, comments: 5, decisions: 5 },
      opened: { at: { 'w-hour': NOW - 20 * MIN }, now: NOW },
    });
    expect(groups.find((g) => g.key === 'lines').rows.map((r) => r.id.split('-').pop())).toEqual(['h1', 'm1', 'o1']);
  });
});
